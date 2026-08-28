import assert from 'node:assert/strict'
import test from 'node:test'
import { AuditEventRepository } from '../src/repositories/audit-event-repository.js'

function createQuery(result) {
  const calls = []
  const query = {
    select(value) {
      calls.push(['select', value])
      return query
    },
    sort(value) {
      calls.push(['sort', value])
      return query
    },
    limit(value) {
      calls.push(['limit', value])
      return query
    },
    maxTimeMS(value) {
      calls.push(['maxTimeMS', value])
      return query
    },
    lean() {
      calls.push(['lean'])
      return query
    },
    async exec() {
      calls.push(['exec'])
      return result
    }
  }
  return { calls, query }
}

test('AuditEventRepository inicia e finaliza eventos normalizados', async () => {
  const startedDocument = {
    toObject: () => ({ _id: 'event-1', action: 'movie.disabled', status: 'started' })
  }
  const finishedQuery = createQuery({
    _id: 'event-1',
    action: 'movie.disabled',
    status: 'completed'
  })
  let createdInput
  let finishedArguments
  const model = {
    async create(input) {
      createdInput = input
      return startedDocument
    },
    findByIdAndUpdate(...args) {
      finishedArguments = args
      return finishedQuery.query
    }
  }
  const repository = new AuditEventRepository(model)

  const started = await repository.start({ action: 'movie.disabled', metaId: 'tt1234567' })
  const finished = await repository.finish(started.id, { status: 'completed' })

  assert.deepEqual(createdInput, {
    action: 'movie.disabled',
    metaId: 'tt1234567',
    status: 'started'
  })
  assert.deepEqual(started, { id: 'event-1', action: 'movie.disabled', status: 'started' })
  assert.equal(finished.status, 'completed')
  assert.equal(finished.id, 'event-1')
  assert.equal(finishedArguments[0], 'event-1')
  assert.equal(finishedArguments[1].$set.status, 'completed')
  assert.ok(finishedArguments[1].$set.completedAt instanceof Date)
  assert.deepEqual(finishedArguments[2], { returnDocument: 'after', runValidators: true })
  assert.deepEqual(finishedQuery.calls, [
    ['select', { __v: 0 }],
    ['lean'],
    ['exec']
  ])
})

test('AuditEventRepository lista histórico recente e converte _id em id', async () => {
  const historyQuery = createQuery([
    { _id: 'event-2', status: 'completed' },
    { _id: 'event-1', status: 'failed' }
  ])
  let findArguments
  const model = {
    find(...args) {
      findArguments = args
      return historyQuery.query
    }
  }

  const events = await new AuditEventRepository(model)
    .findByMetaId('tt1234567', { limit: 25 })

  assert.deepEqual(findArguments, [{ metaId: 'tt1234567' }, { __v: 0 }])
  assert.deepEqual(events, [
    { id: 'event-2', status: 'completed' },
    { id: 'event-1', status: 'failed' }
  ])
  assert.deepEqual(historyQuery.calls, [
    ['sort', { createdAt: -1, _id: -1 }],
    ['limit', 25],
    ['maxTimeMS', 5_000],
    ['lean'],
    ['exec']
  ])
})
