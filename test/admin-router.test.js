import assert from 'node:assert/strict'
import test from 'node:test'
import { isApiKeyValid } from '../src/http/admin-router.js'

test('isApiKeyValid valida Bearer token sem comparação direta', () => {
  const key = 'a-secure-api-key-with-more-than-32-characters'

  assert.equal(isApiKeyValid(`Bearer ${key}`, key), true)
  assert.equal(isApiKeyValid('Bearer incorreta', key), false)
  assert.equal(isApiKeyValid(`Basic ${key}`, key), false)
  assert.equal(isApiKeyValid(undefined, key), false)
  assert.equal(isApiKeyValid(`Bearer ${key}`, undefined), false)
})
