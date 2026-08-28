import assert from 'node:assert/strict'
import test from 'node:test'
import { createAddonInterface } from '../src/addon.js'
import { createApplication } from '../src/http/app.js'
import { manifest } from '../src/manifest.js'
import { ModerationConfirmationError } from '../src/services/movie-moderation-service.js'
import { silentLogger, testConfig, validMovie } from '../test-support/fixtures.js'

async function useServer(app, callback) {
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(0, '127.0.0.1')
    instance.once('listening', () => resolve(instance))
    instance.once('error', reject)
  })

  try {
    const address = server.address()
    await callback(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
  }
}

function buildApplication({
  config = testConfig,
  auditService,
  ingestionService,
  moderationService,
  metaRepository: providedMetaRepository,
  streamRepository: providedStreamRepository
} = {}) {
  const metaRepository = providedMetaRepository ?? {
    async findByCatalog() {
      return [{ id: 'tt1234567', type: 'movie', name: 'Filme de teste' }]
    },
    async isAvailable() {
      return true
    }
  }
  const streamRepository = providedStreamRepository ?? {
    async findByMetaId() {
      return [{
        metaId: 'tt1234567',
        type: 'movie',
        title: 'Filme de teste',
        infoHash: 'd2474e86c95b19b8bcfdb92bc12c9d44667cfa36',
        sources: []
      }]
    }
  }
  const addonInterface = createAddonInterface({
    manifest,
    metaRepository,
    streamRepository,
    logger: silentLogger
  })

  return createApplication({
    addonInterface,
    config,
    auditService: auditService ?? {
      async execute({ operation }) {
        return {
          result: await operation(),
          event: { id: 'audit-test', status: 'completed' }
        }
      },
      async history() {
        return []
      }
    },
    ingestionService: ingestionService ?? { upsert: async () => ({ metaId: 'tt1234567' }) },
    moderationService: moderationService ?? {
      get: async () => null,
      disable: async () => null,
      restore: async () => null
    },
    isReady: () => true,
    logger: silentLogger
  })
}

test('API expõe manifesto, health checks, catálogo e streams', async () => {
  await useServer(buildApplication(), async (baseUrl) => {
    const manifestResponse = await fetch(`${baseUrl}/manifest.json`)
    assert.equal(manifestResponse.status, 200)
    assert.match(manifestResponse.headers.get('x-request-id'), /^[0-9a-f-]{36}$/)
    assert.equal((await manifestResponse.json()).id, manifest.id)

    const readyResponse = await fetch(`${baseUrl}/health/ready`)
    assert.equal(readyResponse.status, 200)

    const adminPageResponse = await fetch(`${baseUrl}/admin/`)
    assert.equal(adminPageResponse.status, 200)
    assert.match(adminPageResponse.headers.get('content-security-policy'), /script-src 'self'/)
    assert.match(await adminPageResponse.text(), /Painel administrativo/)

    const adminScriptResponse = await fetch(`${baseUrl}/admin/assets/app.js`)
    assert.equal(adminScriptResponse.status, 200)
    const adminScript = await adminScriptResponse.text()
    assert.doesNotMatch(adminScript, /localStorage|sessionStorage/)

    const adminStylesResponse = await fetch(`${baseUrl}/admin/assets/styles.css`)
    assert.equal(adminStylesResponse.status, 200)

    const catalogResponse = await fetch(`${baseUrl}/catalog/movie/BrazilianCatalog.json`)
    assert.equal(catalogResponse.status, 200)
    assert.equal((await catalogResponse.json()).metas.length, 1)

    const streamResponse = await fetch(`${baseUrl}/stream/movie/tt1234567.json`)
    assert.equal(streamResponse.status, 200)
    assert.equal((await streamResponse.json()).streams.length, 1)
  })
})

test('API administrativa exige Bearer token e valida o payload', async () => {
  let receivedMovie
  const app = buildApplication({
    ingestionService: {
      async upsert(movie) {
        receivedMovie = movie
        return { metaId: movie.meta.id, receivedStreams: movie.magnets.length }
      }
    }
  })

  await useServer(app, async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/admin/movies`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validMovie)
    })
    assert.equal(unauthorized.status, 401)

    const authorized = await fetch(`${baseUrl}/admin/movies`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${testConfig.ingestApiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(validMovie)
    })
    assert.equal(authorized.status, 200)
    assert.equal((await authorized.json()).data.metaId, validMovie.meta.id)
    assert.equal(receivedMovie.meta.id, validMovie.meta.id)
  })
})

test('API administrativa fica invisível quando não configurada', async () => {
  const app = buildApplication({
    config: { ...testConfig, ingestApiKey: undefined }
  })

  await useServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/admin/movies`, { method: 'POST' })
    assert.equal(response.status, 404)
  })
})

test('API administrativa consulta, desativa e restaura filmes', async () => {
  const states = []
  const meta = { id: validMovie.meta.id, name: validMovie.meta.name, disabledAt: null }
  const app = buildApplication({
    moderationService: {
      async get(metaId) {
        assert.equal(metaId, meta.id)
        return { status: 'active', meta, streams: [] }
      },
      async disable(metaId, confirmation) {
        assert.equal(confirmation, metaId)
        states.push('disabled')
        return { status: 'disabled', meta: { ...meta, disabledAt: '2026-08-28T00:00:00.000Z' } }
      },
      async restore(metaId) {
        assert.equal(metaId, meta.id)
        states.push('active')
        return { status: 'active', meta }
      }
    }
  })
  const authorization = `Bearer ${testConfig.ingestApiKey}`

  await useServer(app, async (baseUrl) => {
    const details = await fetch(`${baseUrl}/admin/movies/${meta.id}`, {
      headers: { authorization }
    })
    assert.equal(details.status, 200)
    assert.equal((await details.json()).data.status, 'active')

    const disable = await fetch(`${baseUrl}/admin/movies/${meta.id}/disable`, {
      method: 'POST',
      headers: {
        authorization,
        'x-confirm-movie-id': meta.id
      }
    })
    assert.equal(disable.status, 200)
    assert.equal((await disable.json()).data.status, 'disabled')

    const restore = await fetch(`${baseUrl}/admin/movies/${meta.id}/restore`, {
      method: 'POST',
      headers: { authorization }
    })
    assert.equal(restore.status, 200)
    assert.equal((await restore.json()).data.status, 'active')
    assert.deepEqual(states, ['disabled', 'active'])
  })
})

test('filme desativado não expõe streams', async () => {
  let streamQueries = 0
  const app = buildApplication({
    metaRepository: {
      async findByCatalog() {
        return []
      },
      async isAvailable() {
        return false
      }
    },
    streamRepository: {
      async findByMetaId() {
        streamQueries += 1
        return [{ infoHash: 'a'.repeat(40) }]
      }
    }
  })

  await useServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/stream/movie/${validMovie.meta.id}.json`)
    assert.equal(response.status, 200)
    assert.deepEqual((await response.json()).streams, [])
    assert.equal(streamQueries, 0)
  })
})

test('desativação administrativa exige confirmação explícita', async () => {
  const app = buildApplication({
    moderationService: {
      async disable(metaId) {
        throw new ModerationConfirmationError(metaId)
      }
    }
  })

  await useServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/admin/movies/${validMovie.meta.id}/disable`, {
      method: 'POST',
      headers: { authorization: `Bearer ${testConfig.ingestApiKey}` }
    })
    const body = await response.json()

    assert.equal(response.status, 400)
    assert.equal(body.error, 'confirmation_required')
    assert.match(body.message, /X-Confirm-Movie-Id/)
  })
})

test('API expõe histórico persistente e encaminha identidade do moderador', async () => {
  let receivedHistory
  let receivedExecution
  const app = buildApplication({
    auditService: {
      async execute(input) {
        receivedExecution = input
        return {
          result: await input.operation(),
          event: { id: 'event-1', status: 'completed', moderatorId: input.moderatorId }
        }
      },
      async history(metaId, options) {
        receivedHistory = { metaId, options }
        return [{ id: 'event-1', action: 'movie.disabled', status: 'completed' }]
      }
    },
    moderationService: {
      async disable(metaId) {
        return { status: 'disabled', meta: { id: metaId } }
      }
    }
  })
  const authorization = `Bearer ${testConfig.ingestApiKey}`

  await useServer(app, async (baseUrl) => {
    const disable = await fetch(`${baseUrl}/admin/movies/${validMovie.meta.id}/disable`, {
      method: 'POST',
      headers: {
        authorization,
        'x-confirm-movie-id': validMovie.meta.id,
        'x-moderator-id': 'moderador.daniel'
      }
    })
    assert.equal(disable.status, 200)
    assert.equal((await disable.json()).audit.moderatorId, 'moderador.daniel')
    assert.equal(receivedExecution.action, 'movie.disabled')
    assert.equal(receivedExecution.metaId, validMovie.meta.id)
    assert.equal(receivedExecution.moderatorId, 'moderador.daniel')
    assert.match(receivedExecution.requestId, /^[0-9a-f-]{36}$/)

    const history = await fetch(
      `${baseUrl}/admin/movies/${validMovie.meta.id}/audit?limit=25`,
      { headers: { authorization } }
    )
    assert.equal(history.status, 200)
    assert.equal((await history.json()).data[0].action, 'movie.disabled')
    assert.deepEqual(receivedHistory, {
      metaId: validMovie.meta.id,
      options: { limit: '25' }
    })
  })
})
