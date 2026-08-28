const TRACKER_PREFIX = 'tracker:'
const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:', 'udp:'])
const MAX_TRACKER_LENGTH = 2_048

function tokenize(input) {
  if (Array.isArray(input)) {
    return input.flatMap(tokenize)
  }
  if (typeof input !== 'string') return []
  return input.split(/[\s,]+/).filter(Boolean)
}

export function normalizeTrackerUrl(value) {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  const candidate = trimmed.toLowerCase().startsWith(TRACKER_PREFIX)
    ? trimmed.slice(TRACKER_PREFIX.length)
    : trimmed

  if (!candidate || candidate.length > MAX_TRACKER_LENGTH) return null

  let url
  try {
    url = new URL(candidate)
  } catch {
    return null
  }

  if (!SUPPORTED_PROTOCOLS.has(url.protocol)) return null
  if (!url.hostname || url.username || url.password || url.hash) return null

  url.hostname = url.hostname.toLowerCase()
  return url.toString()
}

export function parseTrackerSources(input, { limit = 100 } = {}) {
  const boundedLimit = Math.max(0, Math.min(Number(limit) || 0, 100))
  if (boundedLimit === 0) return []

  const sources = []
  const seen = new Set()

  for (const token of tokenize(input)) {
    const url = normalizeTrackerUrl(token)
    if (!url) continue

    const source = `${TRACKER_PREFIX}${url}`
    if (seen.has(source)) continue

    seen.add(source)
    sources.push(source)
    if (sources.length >= boundedLimit) break
  }

  return sources
}

export function mergeTrackerSources(inputs, { limit = 30 } = {}) {
  return parseTrackerSources(inputs, { limit })
}

export function trackerSourceToUrl(source) {
  const normalized = parseTrackerSources([source], { limit: 1 })[0]
  return normalized ? normalized.slice(TRACKER_PREFIX.length) : null
}
