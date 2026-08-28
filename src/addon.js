import { AddonBuilder } from '@stremio-addon/sdk'
import { toLogError } from './logger.js'

const CATALOG_PAGE_SIZE = 100
const MAX_SKIP = 100_000

function parseSkip(value) {
  const parsed = Number.parseInt(String(value ?? '0'), 10)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.min(parsed, MAX_SKIP)
}

export function createAddonInterface({ manifest, metaRepository, streamRepository, logger }) {
  const builder = new AddonBuilder(manifest)

  builder.defineStreamHandler(async ({ type, id }) => {
    if (type !== 'movie' || !/^tt\d+$/.test(id)) {
      return { streams: [] }
    }

    try {
      if (!await metaRepository.isAvailable(id)) {
        return { streams: [] }
      }
      return { streams: await streamRepository.findByMetaId(id) }
    } catch (error) {
      logger.error({ error: toLogError(error), type, id }, 'Falha ao consultar streams')
      return { streams: [] }
    }
  })

  builder.defineCatalogHandler(async ({ type, id, extra = {} }) => {
    if (type !== 'movie' || id !== 'BrazilianCatalog') {
      return { metas: [] }
    }

    try {
      const metas = await metaRepository.findByCatalog({
        catalogId: id,
        genre: typeof extra.genre === 'string' ? extra.genre.slice(0, 80) : undefined,
        search: typeof extra.search === 'string' ? extra.search.trim().slice(0, 100) : undefined,
        skip: parseSkip(extra.skip),
        limit: CATALOG_PAGE_SIZE
      })
      return { metas }
    } catch (error) {
      logger.error({ error: toLogError(error), type, id }, 'Falha ao consultar catálogo')
      return { metas: [] }
    }
  })

  return builder.getInterface()
}
