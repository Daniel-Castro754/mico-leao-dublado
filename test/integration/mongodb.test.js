import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import mongoose from 'mongoose'
import { inspectLegacyDatabase } from '../../scripts/check-legacy-data.js'
import { AuditEvent } from '../../src/models/audit-event.js'
import { Meta } from '../../src/models/meta.js'
import { Stream } from '../../src/models/stream.js'
import { AuditEventRepository } from '../../src/repositories/audit-event-repository.js'
import { MetaRepository } from '../../src/repositories/meta-repository.js'
import { StreamRepository } from '../../src/repositories/stream-repository.js'
import { AdminAuditService } from '../../src/services/admin-audit-service.js'
import { MovieModerationService } from '../../src/services/movie-moderation-service.js'
import { silentLogger } from '../../test-support/fixtures.js'

const baseUri = process.env.TEST_MONGODB_URI

function createIsolatedUri(uri) {
  const parsed = new URL(uri)
  parsed.pathname = `/mico_integration_${process.pid}_${Date.now()}`
  return parsed.toString()
}

test('MongoDB aplica índices, upserts e diagnóstico legado', {
  skip: !baseUri && 'TEST_MONGODB_URI não configurada'
}, async () => {
  const uri = createIsolatedUri(baseUri)

  await mongoose.connect(uri, {
    autoIndex: false,
    serverSelectionTimeoutMS: 10_000
  })

  try {
    await mongoose.connection.dropDatabase()
    await Promise.all([AuditEvent.createIndexes(), Meta.createIndexes(), Stream.createIndexes()])

    const auditEventRepository = new AuditEventRepository()
    const metaRepository = new MetaRepository()
    const streamRepository = new StreamRepository()
    const auditService = new AdminAuditService({
      repository: auditEventRepository,
      logger: silentLogger
    })
    const moderationService = new MovieModerationService({ metaRepository, streamRepository })
    const meta = {
      id: 'tt1234567',
      type: 'movie',
      name: 'Filme de integração',
      genres: ['Aventura'],
      catalogs: ['BrazilianCatalog']
    }
    const firstMeta = await metaRepository.upsert(meta)
    const updatedMeta = await metaRepository.upsert({ ...meta, name: 'Filme atualizado' })

    assert.equal(firstMeta.id, meta.id)
    assert.equal(updatedMeta.name, 'Filme atualizado')
    assert.equal(await Meta.countDocuments({ id: meta.id }), 1)

    const streams = [
      {
        metaId: meta.id,
        type: 'movie',
        title: '1080p Dublado',
        infoHash: 'a'.repeat(40),
        sources: ['udp://tracker.example:80']
      },
      {
        metaId: meta.id,
        type: 'movie',
        title: '720p Dublado',
        infoHash: 'b'.repeat(40),
        sources: []
      }
    ]

    await streamRepository.upsertMany(streams)
    await streamRepository.upsertMany([{ ...streams[0], title: '1080p Atualizado' }])

    const savedStreams = await streamRepository.findByMetaId(meta.id)
    assert.equal(savedStreams.length, 2)
    assert.equal(savedStreams[0].title, '1080p Atualizado')

    assert.equal(await metaRepository.isAvailable(meta.id), true)
    const disabledExecution = await auditService.execute({
      action: 'movie.disabled',
      metaId: meta.id,
      moderatorId: 'integration-test',
      requestId: randomUUID(),
      operation: () => moderationService.disable(meta.id, meta.id)
    })
    assert.equal(disabledExecution.result.status, 'disabled')
    assert.equal(disabledExecution.event.status, 'completed')
    assert.equal(await metaRepository.isAvailable(meta.id), false)
    assert.equal((await metaRepository.findByCatalog({
      catalogId: 'BrazilianCatalog'
    })).length, 0)

    const restoredExecution = await auditService.execute({
      action: 'movie.restored',
      metaId: meta.id,
      moderatorId: 'integration-test',
      requestId: randomUUID(),
      operation: () => moderationService.restore(meta.id)
    })
    assert.equal(restoredExecution.result.status, 'active')
    assert.equal(await metaRepository.isAvailable(meta.id), true)
    const auditHistory = await auditService.history(meta.id)
    assert.equal(auditHistory.length, 2)
    assert.equal(auditHistory.every((event) => event.status === 'completed'), true)

    await assert.rejects(
      Meta.create(meta),
      (error) => error?.code === 11_000
    )

    const healthyReport = await inspectLegacyDatabase(mongoose.connection)
    assert.equal(healthyReport.safeToCreateUniqueIndexes, true)
    assert.equal(healthyReport.issueCount, 0)

    await Meta.collection.dropIndex('meta_id_unique')
    await Meta.collection.insertOne(meta)

    const duplicateReport = await inspectLegacyDatabase(mongoose.connection)
    assert.equal(duplicateReport.safeToCreateUniqueIndexes, false)
    assert.equal(duplicateReport.collections.metas.duplicates.duplicateGroups, 1)
    assert.equal(duplicateReport.collections.metas.duplicates.excessDocuments, 1)
  } finally {
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
  }
})
