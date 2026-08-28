import { pathToFileURL } from 'node:url'
import mongoose from 'mongoose'
import { loadConfig } from '../src/config.js'
import { toLogError } from '../src/logger.js'

const MAX_DUPLICATE_SAMPLES = 20

async function findDuplicates(collection, groupId, match = {}) {
  const [result] = await collection.aggregate([
    { $match: match },
    { $group: { _id: groupId, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              duplicateGroups: { $sum: 1 },
              excessDocuments: { $sum: { $subtract: ['$count', 1] } }
            }
          },
          { $project: { _id: 0 } }
        ],
        samples: [
          { $sort: { count: -1, _id: 1 } },
          { $limit: MAX_DUPLICATE_SAMPLES }
        ]
      }
    }
  ], {
    allowDiskUse: true,
    maxTimeMS: 30_000
  }).toArray()

  return {
    duplicateGroups: result?.summary[0]?.duplicateGroups ?? 0,
    excessDocuments: result?.summary[0]?.excessDocuments ?? 0,
    samples: result?.samples ?? []
  }
}

async function inspectMetas(collection) {
  const duplicates = await findDuplicates(
    collection,
    '$id',
    { id: { $type: 'string' } }
  )
  const invalidDocuments = await collection.countDocuments({
    $or: [
      { id: { $not: /^tt\d+$/ } },
      { type: { $ne: 'movie' } },
      { name: { $not: /\S/ } },
      { catalogs: { $not: { $type: 'array' } } },
      { catalogs: { $size: 0 } }
    ]
  }, { maxTimeMS: 30_000 })

  return { exists: true, invalidDocuments, duplicates }
}

async function inspectStreams(collection) {
  const duplicates = await findDuplicates(
    collection,
    {
      metaId: '$metaId',
      infoHash: { $toLower: '$infoHash' }
    },
    {
      metaId: { $type: 'string' },
      infoHash: { $type: 'string' }
    }
  )
  const invalidDocuments = await collection.countDocuments({
    $or: [
      { metaId: { $not: /^tt\d+$/ } },
      { type: { $ne: 'movie' } },
      { title: { $not: /\S/ } },
      { infoHash: { $not: /^[a-fA-F0-9]{40}$/ } }
    ]
  }, { maxTimeMS: 30_000 })

  return { exists: true, invalidDocuments, duplicates }
}

function countIssues(collectionReport) {
  if (!collectionReport.exists) return 0
  return collectionReport.invalidDocuments + collectionReport.duplicates.excessDocuments
}

export async function inspectLegacyDatabase(connection) {
  const existingCollections = new Set(
    (await connection.db.listCollections({}, { nameOnly: true }).toArray())
      .map(({ name }) => name)
  )

  const metas = existingCollections.has('metas')
    ? await inspectMetas(connection.db.collection('metas'))
    : { exists: false }
  const streams = existingCollections.has('streams')
    ? await inspectStreams(connection.db.collection('streams'))
    : { exists: false }
  const issueCount = countIssues(metas) + countIssues(streams)

  return {
    database: connection.name,
    readOnly: true,
    safeToCreateUniqueIndexes: issueCount === 0,
    issueCount,
    collections: { metas, streams }
  }
}

async function main(environment = process.env) {
  const config = loadConfig(environment)
  const connection = await mongoose.createConnection(config.mongodbUri, {
    autoIndex: false,
    maxPoolSize: 2,
    minPoolSize: 0,
    serverSelectionTimeoutMS: config.dbServerSelectionTimeoutMs
  }).asPromise()

  try {
    const report = await inspectLegacyDatabase(connection)
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    if (!report.safeToCreateUniqueIndexes) process.exitCode = 2
  } finally {
    await connection.close()
  }
}

const isMainModule = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMainModule) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ error: toLogError(error) })}\n`)
    process.exitCode = 1
  })
}
