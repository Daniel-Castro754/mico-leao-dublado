import { decode } from 'magnet-uri'

export function assembleMovie(movie) {
  const streamsByInfoHash = new Map()

  for (const entry of movie.magnets) {
    let decoded
    try {
      decoded = decode(entry.magnet)
    } catch (error) {
      throw new Error(`Magnet inválido para "${entry.title}"`, { cause: error })
    }

    if (!decoded.infoHash || !/^[a-f0-9]{40}$/i.test(decoded.infoHash)) {
      throw new Error(`Magnet sem infoHash BTIH válido para "${entry.title}"`)
    }

    const infoHash = decoded.infoHash.toLowerCase()
    const sources = [...new Set(
      (Array.isArray(decoded.announce) ? decoded.announce : [])
        .filter((source) => typeof source === 'string' && source.length <= 2_048)
    )]

    streamsByInfoHash.set(infoHash, {
      metaId: movie.meta.id,
      type: 'movie',
      title: entry.title,
      infoHash,
      sources
    })
  }

  return {
    meta: movie.meta,
    streams: [...streamsByInfoHash.values()]
  }
}
