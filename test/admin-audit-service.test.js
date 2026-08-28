import assert from 'node:assert/strict'
import test from 'node:test'
import { AdminAuditService } from '../src/services/admin-audit-service.js'
import { silentLogger } from '../test-support/fixtures.js'

const requestId = '7b793840-6e42-4f70-8a5d-17f98e77efc4'

function createService() {
  const calls = []
  const events = []
  const repository = {
    async start(input) {
      calls.push('start')
      const event = { id: 'event-1', status: 'started', ...input }
      events.push(event)
      return event
    },
    async finish(id, update) {
      calls.push(`finish:${update.status}`)
      return { ...events.find((event) => event.id === id), ...update }
    },
    async findByMetaId(metaId, options) {
      calls.push(`history:${metaId}:${options.limit}`)
      return events
    }
  }

  return {
    calls,
    events,
    service: new AdminAuditService({ repository, logger: silentLogger })
  }
}

test('AdminAuditService registra início antes da operação e conclusão depois', async () => {
  const { calls, service } = createService()
  const execution = await service.execute({
    action: 'movie.ingested',
    metaId: 'tt1234567',
    moderatorId: 'daniel.castro',
    requestId,
    async operation() {
      calls.push('operation')
      return { receivedStreams: 2 }
    },
    summarize: (result) => ({ receivedStreams: result.receivedStreams })
  })

  assert.deepEqual(calls, ['start', 'operation', 'finish:completed'])
  assert.equal(execution.event.status, 'completed')
  assert.deepEqual(execution.event.details, { receivedStreams: 2 })
})

test('AdminAuditService registra falha sem guardar mensagem potencialmente sensível', async () => {
  const { calls, service } = createService()
  const failure = Object.assign(new Error('segredo interno'), { code: 'TEST_FAILURE' })

  await assert.rejects(service.execute({
    action: 'movie.disabled',
    metaId: 'tt1234567',
    requestId,
    operation: async () => { throw failure }
  }), failure)

  assert.deepEqual(calls, ['start', 'finish:failed'])
})

test('AdminAuditService registra resultado inexistente e valida opções do histórico', async () => {
  const { calls, service } = createService()
  const execution = await service.execute({
    action: 'movie.restored',
    metaId: 'tt1234567',
    requestId,
    operation: async () => null
  })

  assert.equal(execution.event.status, 'not_found')
  await service.history('tt1234567', { limit: '25' })
  assert.equal(calls.at(-1), 'history:tt1234567:25')
  await assert.rejects(service.history('inválido', { limit: 500 }))
})

test('AdminAuditService rejeita identidade de moderador inválida antes da operação', async () => {
  const { calls, service } = createService()

  await assert.rejects(service.execute({
    action: 'movie.disabled',
    metaId: 'tt1234567',
    moderatorId: 'identidade com espaços e <script>',
    requestId,
    operation: async () => ({})
  }))
  assert.deepEqual(calls, [])
})

test('falha ao finalizar auditoria não classifica uma alteração concluída como falha', async () => {
  const finishStatuses = []
  const repository = {
    async start(input) {
      return { id: 'event-1', status: 'started', ...input }
    },
    async finish(_id, update) {
      finishStatuses.push(update.status)
      throw new Error('auditoria indisponível')
    }
  }
  const service = new AdminAuditService({ repository, logger: silentLogger })

  await assert.rejects(service.execute({
    action: 'movie.restored',
    metaId: 'tt1234567',
    requestId,
    operation: async () => ({ status: 'active' })
  }))

  assert.deepEqual(finishStatuses, ['completed'])
})
