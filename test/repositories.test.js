import assert from 'node:assert/strict'
import test from 'node:test'
import { MetaRepository } from '../src/repositories/meta-repository.js'
import { StreamRepository } from '../src/repositories/stream-repository.js'

function createQuery(result) {
  const calls = []
  const query = {
    sort(value) {
      calls.push(['sort', value])
      return query
    },
    skip(value) {
      calls.push(['skip', value])
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
    select(value) {
      calls.push(['select', value])
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

test('MetaRepository monta consulta paginada e escapa a busca textual', async () => {
  const { calls, query } = createQuery([{ id: 'tt1234567' }])
  let receivedFilter
  let receivedProjection
  const model = {
    find(filter, projection) {
      receivedFilter = filter
      receivedProjection = projection
      return query
    }
  }

  const repository = new MetaRepository(model)
  const result = await repository.findByCatalog({
    catalogId: 'BrazilianCatalog',
    genre: 'Ação',
    search: 'Filme (2026).*',
    skip: 100,
    limit: 50
  })

  assert.deepEqual(result, [{ id: 'tt1234567' }])
  assert.deepEqual(receivedFilter, {
    catalogs: 'BrazilianCatalog',
    disabledAt: null,
    genres: 'Ação',
    name: { $regex: 'Filme \\(2026\\)\\.\\*', $options: 'i' }
  })
  assert.deepEqual(receivedProjection, {
    _id: 0,
    catalogs: 0,
    createdAt: 0,
    disabledAt: 0,
    updatedAt: 0
  })
  assert.deepEqual(calls, [
    ['sort', { name: 1, id: 1 }],
    ['skip', 100],
    ['limit', 50],
    ['maxTimeMS', 5_000],
    ['lean'],
    ['exec']
  ])
})

test('MetaRepository consulta disponibilidade e dados administrativos', async () => {
  const meta = { id: 'tt1234567', disabledAt: null }
  const availableQuery = createQuery({ _id: 'internal-id' })
  const adminQuery = createQuery(meta)
  let availableFilter
  let adminArguments
  const model = {
    exists(filter) {
      availableFilter = filter
      return availableQuery.query
    },
    findOne(...args) {
      adminArguments = args
      return adminQuery.query
    }
  }
  const repository = new MetaRepository(model)

  assert.equal(await repository.isAvailable(meta.id), true)
  assert.equal(await repository.findAdminById(meta.id), meta)
  assert.deepEqual(availableFilter, { id: meta.id, disabledAt: null })
  assert.deepEqual(adminArguments, [{ id: meta.id }, { _id: 0 }])
  assert.deepEqual(availableQuery.calls, [['maxTimeMS', 5_000], ['exec']])
  assert.deepEqual(adminQuery.calls, [['maxTimeMS', 5_000], ['lean'], ['exec']])
})

test('MetaRepository atualiza o estado de moderação', async () => {
  const disabledAt = new Date('2026-08-28T12:00:00.000Z')
  const meta = { id: 'tt1234567', disabledAt }
  const { calls, query } = createQuery(meta)
  let receivedArguments
  const model = {
    findOneAndUpdate(...args) {
      receivedArguments = args
      return query
    }
  }

  const result = await new MetaRepository(model).setDisabledAt(meta.id, disabledAt)

  assert.equal(result, meta)
  assert.deepEqual(receivedArguments, [
    { id: meta.id },
    { $set: { disabledAt } },
    { new: true, runValidators: true }
  ])
  assert.deepEqual(calls, [['select', { _id: 0 }], ['lean'], ['exec']])
})

test('MetaRepository faz upsert atômico com validação do Mongoose', async () => {
  const meta = { id: 'tt1234567', type: 'movie', name: 'Filme' }
  const { calls, query } = createQuery(meta)
  let receivedArguments
  const model = {
    findOneAndUpdate(...args) {
      receivedArguments = args
      return query
    }
  }

  const result = await new MetaRepository(model).upsert(meta)

  assert.equal(result, meta)
  assert.deepEqual(receivedArguments, [
    { id: meta.id },
    { $set: meta },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  ])
  assert.deepEqual(calls, [['lean'], ['exec']])
})

test('StreamRepository consulta streams públicos em ordem estável', async () => {
  const streams = [{ infoHash: 'a'.repeat(40) }]
  const { calls, query } = createQuery(streams)
  let receivedArguments
  const model = {
    find(...args) {
      receivedArguments = args
      return query
    }
  }

  const result = await new StreamRepository(model).findByMetaId('tt1234567')

  assert.equal(result, streams)
  assert.deepEqual(receivedArguments, [
    { metaId: 'tt1234567' },
    { _id: 0, createdAt: 0, updatedAt: 0 }
  ])
  assert.deepEqual(calls, [
    ['sort', { title: 1, infoHash: 1 }],
    ['maxTimeMS', 5_000],
    ['lean'],
    ['exec']
  ])
})

test('StreamRepository evita escrita vazia e faz bulk upsert por infoHash', async () => {
  let receivedOperations
  let receivedOptions
  const model = {
    async bulkWrite(operations, options) {
      receivedOperations = operations
      receivedOptions = options
      return { matchedCount: 1, modifiedCount: 1, upsertedCount: 1 }
    }
  }
  const repository = new StreamRepository(model)

  assert.deepEqual(await repository.upsertMany([]), {
    matchedCount: 0,
    modifiedCount: 0,
    upsertedCount: 0
  })

  const streams = [
    { metaId: 'tt1234567', infoHash: 'a'.repeat(40), type: 'movie', title: '1080p', sources: [] }
  ]
  const result = await repository.upsertMany(streams)

  assert.deepEqual(receivedOperations, [{
    updateOne: {
      filter: { metaId: streams[0].metaId, infoHash: streams[0].infoHash },
      update: { $set: streams[0] },
      upsert: true
    }
  }])
  assert.deepEqual(receivedOptions, { ordered: false })
  assert.deepEqual(result, { matchedCount: 1, modifiedCount: 1, upsertedCount: 1 })
})

test('StreamRepository retorna dados administrativos com timestamps', async () => {
  const streams = [{ infoHash: 'a'.repeat(40), createdAt: new Date() }]
  const { calls, query } = createQuery(streams)
  let receivedArguments
  const model = {
    find(...args) {
      receivedArguments = args
      return query
    }
  }

  const result = await new StreamRepository(model).findAdminByMetaId('tt1234567')

  assert.equal(result, streams)
  assert.deepEqual(receivedArguments, [{ metaId: 'tt1234567' }, { _id: 0 }])
  assert.deepEqual(calls, [
    ['sort', { title: 1, infoHash: 1 }],
    ['maxTimeMS', 5_000],
    ['lean'],
    ['exec']
  ])
})
