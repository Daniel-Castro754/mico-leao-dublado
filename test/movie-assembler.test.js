import assert from 'node:assert/strict'
import test from 'node:test'
import { assembleMovie } from '../src/services/movie-assembler.js'
import { validMovie } from '../test-support/fixtures.js'

test('assembleMovie converte magnets em streams do Stremio', () => {
  const result = assembleMovie(validMovie)

  assert.equal(result.meta.id, validMovie.meta.id)
  assert.equal(result.streams.length, 1)
  assert.deepEqual(result.streams[0], {
    metaId: 'tt1234567',
    type: 'movie',
    title: 'Filme de teste 1080p Dublado',
    infoHash: 'd2474e86c95b19b8bcfdb92bc12c9d44667cfa36',
    sources: ['udp://tracker.example.com:80']
  })
})

test('assembleMovie elimina infoHashes duplicados', () => {
  const result = assembleMovie({
    ...validMovie,
    magnets: [...validMovie.magnets, ...validMovie.magnets]
  })

  assert.equal(result.streams.length, 1)
})

test('assembleMovie rejeita magnet sem BTIH válido', () => {
  assert.throws(
    () => assembleMovie({
      ...validMovie,
      magnets: [{ title: 'Inválido', magnet: 'magnet:?dn=sem-hash' }]
    }),
    /infoHash BTIH válido/
  )
})
