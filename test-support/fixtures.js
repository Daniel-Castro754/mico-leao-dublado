export const validMovie = Object.freeze({
  meta: {
    id: 'tt1234567',
    type: 'movie',
    name: 'Filme de teste',
    genres: ['Aventura'],
    description: 'Conteúdo usado somente nos testes automatizados.',
    releaseInfo: '2026',
    imdbRating: 7.5,
    runtime: '1h 40min',
    catalogs: ['BrazilianCatalog']
  },
  magnets: [
    {
      title: 'Filme de teste 1080p Dublado',
      magnet: 'magnet:?xt=urn:btih:d2474e86c95b19b8bcfdb92bc12c9d44667cfa36&tr=udp%3A%2F%2Ftracker.example.com%3A80'
    }
  ]
})

export const silentLogger = Object.freeze({
  debug() {},
  error() {},
  fatal() {},
  info() {},
  trace() {},
  warn() {}
})

export const testConfig = Object.freeze({
  nodeEnv: 'test',
  port: 3000,
  mongodbUri: 'mongodb://localhost:27017/test',
  logLevel: 'silent',
  trustProxy: false,
  ingestApiKey: 'test-api-key-with-at-least-32-characters',
  dbConnectMaxAttempts: 1,
  dbConnectRetryMs: 100,
  dbServerSelectionTimeoutMs: 500,
  adminRateLimitWindowMs: 60_000,
  adminRateLimitMax: 100
})
