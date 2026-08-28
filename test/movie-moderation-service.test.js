import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ModerationConfirmationError,
  MovieModerationService
} from '../src/services/movie-moderation-service.js'

function createService({ meta = null, streams = [] } = {}) {
  const updates = []
  const metaRepository = {
    async findAdminById() {
      return meta
    },
    async setDisabledAt(id, disabledAt) {
      updates.push({ id, disabledAt })
      if (!meta) return null
      return { ...meta, disabledAt }
    }
  }
  const streamRepository = {
    async findAdminByMetaId() {
      return streams
    }
  }
  const now = new Date('2026-08-28T12:00:00.000Z')

  return {
    service: new MovieModerationService({
      metaRepository,
      streamRepository,
      now: () => now
    }),
    updates,
    now
  }
}

test('MovieModerationService consulta metadados e streams administrativos', async () => {
  const meta = { id: 'tt1234567', name: 'Filme', disabledAt: null }
  const streams = [{ metaId: meta.id, infoHash: 'a'.repeat(40) }]
  const { service } = createService({ meta, streams })

  assert.deepEqual(await service.get(meta.id), {
    status: 'active',
    meta,
    streams
  })
  assert.equal(await createService().service.get(meta.id), null)
})

test('MovieModerationService exige confirmação exata para desativar', async () => {
  const meta = { id: 'tt1234567', name: 'Filme', disabledAt: null }
  const { service, updates } = createService({ meta })

  await assert.rejects(
    service.disable(meta.id, 'tt0000000'),
    ModerationConfirmationError
  )
  assert.equal(updates.length, 0)
})

test('MovieModerationService desativa e restaura sem apagar dados', async () => {
  const meta = { id: 'tt1234567', name: 'Filme', disabledAt: null }
  const { service, updates, now } = createService({ meta })

  const disabled = await service.disable(meta.id, meta.id)
  const restored = await service.restore(meta.id)

  assert.equal(disabled.status, 'disabled')
  assert.equal(disabled.meta.disabledAt, now)
  assert.equal(restored.status, 'active')
  assert.equal(restored.meta.disabledAt, null)
  assert.deepEqual(updates, [
    { id: meta.id, disabledAt: now },
    { id: meta.id, disabledAt: null }
  ])
})

test('MovieModerationService rejeita identificador inválido', async () => {
  const { service } = createService()
  await assert.rejects(service.get('identificador-inválido'))
})
