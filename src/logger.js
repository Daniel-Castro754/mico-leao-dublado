import pino from 'pino'

const credentialPattern = /(mongodb(?:\+srv)?:\/\/)([^\s@/]+)@/gi

export function sanitizeMessage(message) {
  return String(message).replace(credentialPattern, '$1[REDACTED]@')
}

export function toLogError(error) {
  if (!(error instanceof Error)) {
    return { message: sanitizeMessage(error) }
  }

  return {
    name: error.name,
    message: sanitizeMessage(error.message),
    code: error.code
  }
}

export function createLogger({ level = 'info', nodeEnv = 'development' } = {}) {
  return pino({
    level,
    base: {
      service: 'mico-leao-dublado',
      environment: nodeEnv
    },
    redact: {
      paths: [
        'mongodbUri',
        'MONGODB_URI',
        'ingestApiKey',
        'INGEST_API_KEY',
        'req.headers.authorization'
      ],
      censor: '[REDACTED]'
    }
  })
}
