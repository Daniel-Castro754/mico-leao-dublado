import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import express from 'express'
import helmet from 'helmet'
import { getRouter } from '@stremio-addon/node-express'
import { createAdminRouter } from './admin-router.js'

const adminUiDirectory = fileURLToPath(new URL('./admin-ui/', import.meta.url))

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

function renderLandingPage(manifestUrl) {
  const safeManifestUrl = escapeHtml(manifestUrl)
  const installUrl = escapeHtml(manifestUrl.replace(/^https?:\/\//, 'stremio://'))

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mico-Leão Dublado</title>
  <style>
    :root { color-scheme: dark; font-family: system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #111827; color: #f9fafb; }
    main { width: min(42rem, calc(100% - 3rem)); padding: 2rem; border: 1px solid #374151; border-radius: 1rem; background: #1f2937; }
    h1 { margin-top: 0; color: #fbbf24; }
    a { color: #fde68a; }
    .button { display: inline-block; margin-top: 1rem; padding: .75rem 1rem; border-radius: .5rem; background: #d97706; color: white; text-decoration: none; font-weight: 700; }
    code { overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <main>
    <h1>Mico-Leão Dublado</h1>
    <p>Addon comunitário do Stremio para filmes dublados em português brasileiro.</p>
    <p>Manifesto: <a href="${safeManifestUrl}"><code>${safeManifestUrl}</code></a></p>
    <a class="button" href="${installUrl}">Instalar no Stremio</a>
    <p><a href="/admin/">Abrir painel administrativo</a></p>
  </main>
</body>
</html>`
}

export function createApplication({
  addonInterface,
  config,
  auditService,
  ingestionService,
  moderationService,
  isReady,
  logger
}) {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', config.trustProxy)
  app.use((req, res, next) => {
    req.requestId = randomUUID()
    res.set('X-Request-Id', req.requestId)
    next()
  })
  app.use(helmet())

  app.get('/', (req, res) => {
    const manifestUrl = `${req.protocol}://${req.get('host')}/manifest.json`
    res.type('html').send(renderLandingPage(manifestUrl))
  })

  app.get('/health/live', (_req, res) => {
    res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) })
  })

  app.get('/health/ready', (_req, res) => {
    const ready = isReady()
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' })
  })

  app.get(['/admin', '/admin/'], (_req, res) => {
    res.set('Cache-Control', 'no-store')
    res.sendFile('index.html', { root: adminUiDirectory })
  })
  app.use('/admin/assets', express.static(adminUiDirectory, {
    fallthrough: false,
    index: false,
    maxAge: '1h'
  }))

  app.use('/admin', createAdminRouter({
    config,
    auditService,
    ingestionService,
    moderationService,
    logger
  }))

  app.all('/movie', (_req, res) => {
    res.status(410).json({
      error: 'endpoint_removed',
      message: 'Use a API administrativa autenticada em POST /admin/movies.'
    })
  })

  app.use(getRouter(addonInterface))

  // @stremio-addon/node-express@1.0.0 chama next() mesmo após enviar
  // uma resposta. Interrompa a cadeia para evitar um segundo envio pelo 404.
  app.use((_req, res, next) => {
    if (res.headersSent) return undefined
    return next()
  })

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' })
  })

  return app
}
