import assert from 'node:assert/strict'
import test from 'node:test'
import { loadConfig } from '../src/config.js'

test('loadConfig aplica padrões seguros', () => {
  const config = loadConfig({ MONGODB_URI: 'mongodb://localhost:27017/test' })

  assert.equal(config.port, 3000)
  assert.equal(config.nodeEnv, 'development')
  assert.equal(config.ingestApiKey, undefined)
  assert.equal(config.trustProxy, false)
  assert.ok(Object.isFrozen(config))
})

test('loadConfig aceita Atlas e converte valores do ambiente', () => {
  const config = loadConfig({
    NODE_ENV: 'production',
    PORT: '8080',
    MONGODB_URI: 'mongodb+srv://example.mongodb.net/catalog',
    TRUST_PROXY: 'true',
    INGEST_API_KEY: 'a'.repeat(32)
  })

  assert.equal(config.port, 8080)
  assert.equal(config.trustProxy, true)
  assert.equal(config.ingestApiKey, 'a'.repeat(32))
})

test('loadConfig rejeita URI e chave administrativa inválidas sem expor segredo', () => {
  assert.throws(
    () => loadConfig({ MONGODB_URI: 'http://localhost', INGEST_API_KEY: 'curta' }),
    /Configuração inválida/
  )
})
