import assert from 'node:assert/strict'
import test from 'node:test'
import { sanitizeMessage, toLogError } from '../src/logger.js'

test('sanitizeMessage remove credenciais de URIs MongoDB', () => {
  const sanitized = sanitizeMessage('Erro em mongodb+srv://user:password@example.net/catalog')

  assert.equal(sanitized, 'Erro em mongodb+srv://[REDACTED]@example.net/catalog')
  assert.equal(sanitized.includes('password'), false)
})

test('toLogError retorna somente campos seguros', () => {
  const result = toLogError(new Error('Falha em mongodb://user:secret@mongo/test'))

  assert.equal(result.name, 'Error')
  assert.equal(result.message.includes('secret'), false)
  assert.equal('stack' in result, false)
})
