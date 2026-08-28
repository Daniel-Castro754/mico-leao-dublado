import assert from 'node:assert/strict'
import test from 'node:test'
import { MovieIngestionService } from '../src/services/movie-ingestion-service.js'
import { validMovie } from '../test-support/fixtures.js'

test('MovieIngestionService valida, atualiza metadados e aguarda os streams', async () => {
  const calls = []
  const service = new MovieIngestionService({
    metaRepository: {
      async upsert(meta) {
        calls.push(['meta', meta.id])
        return meta
      }
    },
    streamRepository: {
      async upsertMany(streams) {
        await new Promise((resolve) => setTimeout(resolve, 5))
        calls.push(['streams', streams.length])
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 }
      }
    }
  })

  const result = await service.upsert(validMovie)

  assert.deepEqual(calls, [['meta', 'tt1234567'], ['streams', 1]])
  assert.deepEqual(result, {
    metaId: 'tt1234567',
    receivedStreams: 1,
    matchedCount: 0,
    modifiedCount: 0,
    upsertedCount: 1
  })
})

test('MovieIngestionService rejeita payload fora do contrato', async () => {
  const service = new MovieIngestionService({
    metaRepository: { upsert: () => assert.fail('não deveria gravar') },
    streamRepository: { upsertMany: () => assert.fail('não deveria gravar') }
  })

  await assert.rejects(() => service.upsert({ meta: {}, magnets: [] }))
})
