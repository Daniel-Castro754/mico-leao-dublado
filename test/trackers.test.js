import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mergeTrackerSources,
  normalizeTrackerUrl,
  parseTrackerSources,
  trackerSourceToUrl
} from '../src/trackers.js'

test('normalizeTrackerUrl aceita trackers públicos suportados', () => {
  assert.equal(
    normalizeTrackerUrl('udp://TRACKER.example:1337/announce'),
    'udp://tracker.example:1337/announce'
  )
  assert.equal(
    normalizeTrackerUrl('tracker:https://tracker.example/announce'),
    'https://tracker.example/announce'
  )
})

test('normalizeTrackerUrl rejeita esquemas e credenciais não suportados', () => {
  assert.equal(normalizeTrackerUrl('wss://tracker.example/announce'), null)
  assert.equal(normalizeTrackerUrl('file:///etc/passwd'), null)
  assert.equal(normalizeTrackerUrl('https://user:secret@tracker.example/announce'), null)
  assert.equal(normalizeTrackerUrl('não-é-url'), null)
})

test('parseTrackerSources separa, normaliza, deduplica e limita trackers', () => {
  const sources = parseTrackerSources(`
    udp://tracker.example:80/announce,
    tracker:udp://tracker.example:80/announce
    https://second.example/announce
    ftp://ignored.example/announce
  `, { limit: 2 })

  assert.deepEqual(sources, [
    'tracker:udp://tracker.example:80/announce',
    'tracker:https://second.example/announce'
  ])
})

test('parseTrackerSources respeita limite zero', () => {
  assert.deepEqual(parseTrackerSources('udp://tracker.example:80', { limit: 0 }), [])
})

test('mergeTrackerSources preserva prioridade e compatibilidade com dados antigos', () => {
  assert.deepEqual(
    mergeTrackerSources([
      ['udp://magnet.example:80/announce'],
      ['tracker:udp://default.example:1337/announce'],
      ['udp://magnet.example:80/announce']
    ], { limit: 10 }),
    [
      'tracker:udp://magnet.example:80/announce',
      'tracker:udp://default.example:1337/announce'
    ]
  )
})

test('trackerSourceToUrl remove somente um prefixo validado', () => {
  assert.equal(
    trackerSourceToUrl('tracker:udp://tracker.example:80/announce'),
    'udp://tracker.example:80/announce'
  )
  assert.equal(trackerSourceToUrl('invalid'), null)
})
