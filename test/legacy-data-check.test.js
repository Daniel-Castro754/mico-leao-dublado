import assert from 'node:assert/strict'
import test from 'node:test'
import { inspectLegacyDatabase } from '../scripts/check-legacy-data.js'

function createCollection({ invalidDocuments = 0, duplicateGroups = 0, excessDocuments = 0 } = {}) {
  return {
    aggregate() {
      return {
        async toArray() {
          return [{
            summary: duplicateGroups > 0
              ? [{ duplicateGroups, excessDocuments }]
              : [],
            samples: duplicateGroups > 0
              ? [{ _id: 'duplicado', count: excessDocuments + 1 }]
              : []
          }]
        }
      }
    },
    async countDocuments() {
      return invalidDocuments
    }
  }
}

function createConnection(collections) {
  return {
    name: 'mico-test',
    db: {
      listCollections() {
        return {
          async toArray() {
            return Object.keys(collections).map((name) => ({ name }))
          }
        }
      },
      collection(name) {
        return collections[name]
      }
    }
  }
}

test('diagnóstico considera banco vazio compatível e não cria coleções', async () => {
  const report = await inspectLegacyDatabase(createConnection({}))

  assert.deepEqual(report, {
    database: 'mico-test',
    readOnly: true,
    safeToCreateUniqueIndexes: true,
    issueCount: 0,
    collections: {
      metas: { exists: false },
      streams: { exists: false }
    }
  })
})

test('diagnóstico aprova coleções válidas sem duplicatas', async () => {
  const report = await inspectLegacyDatabase(createConnection({
    metas: createCollection(),
    streams: createCollection()
  }))

  assert.equal(report.safeToCreateUniqueIndexes, true)
  assert.equal(report.issueCount, 0)
  assert.equal(report.collections.metas.invalidDocuments, 0)
  assert.equal(report.collections.streams.duplicates.duplicateGroups, 0)
})

test('diagnóstico relata documentos inválidos e duplicatas sem alterá-los', async () => {
  const report = await inspectLegacyDatabase(createConnection({
    metas: createCollection({ invalidDocuments: 2, duplicateGroups: 1, excessDocuments: 1 }),
    streams: createCollection({ invalidDocuments: 1, duplicateGroups: 2, excessDocuments: 3 })
  }))

  assert.equal(report.readOnly, true)
  assert.equal(report.safeToCreateUniqueIndexes, false)
  assert.equal(report.issueCount, 7)
  assert.equal(report.collections.metas.duplicates.samples[0].count, 2)
  assert.equal(report.collections.streams.duplicates.duplicateGroups, 2)
})
