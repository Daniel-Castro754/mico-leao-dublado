import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseTrackerSources, trackerSourceToUrl } from '../src/trackers.js'

const SOURCE_URL = 'https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt'
const MAX_RESPONSE_SIZE = 100_000
const EXPECTED_MINIMUM = 5
const TRACKER_LIMIT = 20

async function readEnvironmentTemplate(environmentPath) {
  try {
    return await readFile(environmentPath, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return readFile(path.resolve('.env.example'), 'utf8')
  }
}

function updateEnvironment(content, value) {
  const line = `DEFAULT_TRACKERS=${value}`
  return /^DEFAULT_TRACKERS=.*$/m.test(content)
    ? content.replace(/^DEFAULT_TRACKERS=.*$/m, line)
    : `${content.trimEnd()}\n${line}\n`
}

const response = await fetch(SOURCE_URL, {
  headers: { 'user-agent': 'mico-leao-dublado-tracker-updater/1.0' },
  signal: AbortSignal.timeout(10_000)
})

if (!response.ok) {
  throw new Error(`Falha ao consultar trackers: HTTP ${response.status}`)
}

const text = await response.text()
if (text.length > MAX_RESPONSE_SIZE) {
  throw new Error('A lista remota excedeu o limite de segurança')
}

const sources = parseTrackerSources(text, { limit: TRACKER_LIMIT })
if (sources.length < EXPECTED_MINIMUM) {
  throw new Error(`A fonte retornou somente ${sources.length} trackers válidos`)
}

const trackers = sources.map(trackerSourceToUrl)
const environmentPath = path.resolve('.env')
const currentEnvironment = await readEnvironmentTemplate(environmentPath)
await writeFile(
  environmentPath,
  updateEnvironment(currentEnvironment, trackers.join(',')),
  { encoding: 'utf8', mode: 0o600 }
)

process.stdout.write(`${JSON.stringify({
  updated: true,
  trackers: trackers.length,
  source: SOURCE_URL,
  destination: environmentPath
}, null, 2)}\n`)
