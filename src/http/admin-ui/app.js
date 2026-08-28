const state = {
  apiKey: '',
  moderatorId: '',
  metaId: '',
  movie: null
}

const elements = Object.fromEntries([
  'credentials-form', 'api-key', 'moderator-id', 'toggle-secret', 'connection-status',
  'search-form', 'movie-id', 'notice', 'empty-state', 'movie-content', 'movie-status',
  'summary-id', 'summary-name', 'summary-description', 'disable-button', 'restore-button',
  'metric-streams', 'metric-rating', 'metric-release', 'metric-updated', 'streams-count',
  'streams-list', 'audit-list', 'refresh-audit', 'request-id'
].map((id) => [id, document.getElementById(id)]))

const actionLabels = {
  'movie.ingested': 'Filme importado',
  'movie.disabled': 'Filme desativado',
  'movie.restored': 'Filme restaurado'
}

const statusLabels = {
  active: 'Ativo',
  disabled: 'Desativado',
  started: 'Iniciado',
  completed: 'Concluído',
  failed: 'Falhou',
  not_found: 'Não encontrado'
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date)
}

function showNotice(message, kind = 'info') {
  elements.notice.textContent = message
  elements.notice.dataset.kind = kind
  elements.notice.hidden = false
}

function hideNotice() {
  elements.notice.hidden = true
  elements.notice.textContent = ''
}

function setBusy(isBusy) {
  for (const button of document.querySelectorAll('button')) button.disabled = isBusy
}

function headers({ mutation = false } = {}) {
  if (!state.apiKey) throw new Error('Informe a chave administrativa antes de continuar.')
  const result = { Authorization: `Bearer ${state.apiKey}` }
  if (mutation && state.moderatorId) result['X-Moderator-Id'] = state.moderatorId
  return result
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...headers({ mutation: options.method && options.method !== 'GET' }),
      ...options.headers
    }
  })
  const requestId = response.headers.get('x-request-id')
  if (requestId) elements['request-id'].textContent = `Request ID: ${requestId}`

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body.message || body.error || `Erro HTTP ${response.status}`)
    error.status = response.status
    throw error
  }
  return body
}

function badge(status) {
  const element = document.createElement('span')
  element.className = 'badge'
  element.dataset.status = status
  element.textContent = statusLabels[status] || status
  return element
}

function emptyList(message) {
  const element = document.createElement('p')
  element.className = 'empty-list'
  element.textContent = message
  return element
}

function renderStreams(streams) {
  elements['streams-list'].replaceChildren()
  elements['streams-count'].textContent = String(streams.length)
  elements['metric-streams'].textContent = String(streams.length)

  if (streams.length === 0) {
    elements['streams-list'].append(emptyList('Nenhum stream armazenado para este filme.'))
    return
  }

  for (const stream of streams) {
    const item = document.createElement('article')
    item.className = 'stream-item'
    const title = document.createElement('strong')
    title.textContent = stream.title || 'Stream sem título'
    const hash = document.createElement('code')
    hash.textContent = stream.infoHash || 'InfoHash indisponível'
    const trackers = document.createElement('small')
    const trackerCount = Array.isArray(stream.sources) ? stream.sources.length : 0
    trackers.textContent = `${trackerCount} tracker${trackerCount === 1 ? '' : 's'} · ${formatDate(stream.updatedAt)}`
    item.append(title, hash, trackers)
    elements['streams-list'].append(item)
  }
}

function renderAudit(events) {
  elements['audit-list'].replaceChildren()
  if (events.length === 0) {
    elements['audit-list'].append(emptyList('Ainda não há eventos administrativos para este filme.'))
    return
  }

  for (const event of events) {
    const item = document.createElement('article')
    item.className = 'timeline-item'
    const content = document.createElement('div')
    const title = document.createElement('strong')
    title.textContent = actionLabels[event.action] || event.action
    const metadata = document.createElement('small')
    const actor = event.moderatorId ? ` · ${event.moderatorId}` : ''
    metadata.textContent = `${formatDate(event.createdAt)}${actor}`
    const request = document.createElement('small')
    request.textContent = `Request ID: ${event.requestId || '—'}`
    content.append(title, metadata, request)
    item.append(badge(event.status), content)
    elements['audit-list'].append(item)
  }
}

function renderMovie(payload) {
  state.movie = payload
  const { meta, streams = [], status } = payload
  elements['empty-state'].hidden = true
  elements['movie-content'].hidden = false
  elements['movie-status'].dataset.status = status
  elements['movie-status'].textContent = statusLabels[status] || status
  elements['summary-id'].textContent = meta.id
  elements['summary-name'].textContent = meta.name || 'Filme sem nome'
  elements['summary-description'].textContent = meta.description || 'Sem descrição cadastrada.'
  elements['metric-rating'].textContent = meta.imdbRating ?? '—'
  elements['metric-release'].textContent = meta.releaseInfo || '—'
  elements['metric-updated'].textContent = formatDate(meta.updatedAt)
  elements['disable-button'].hidden = status === 'disabled'
  elements['restore-button'].hidden = status !== 'disabled'
  renderStreams(streams)
}

async function loadAudit() {
  if (!state.metaId) return
  const response = await api(`/admin/movies/${encodeURIComponent(state.metaId)}/audit?limit=50`)
  renderAudit(response.data || [])
}

async function loadMovie(metaId) {
  hideNotice()
  setBusy(true)
  try {
    const response = await api(`/admin/movies/${encodeURIComponent(metaId)}`)
    state.metaId = metaId
    renderMovie(response.data)
    await loadAudit()
  } catch (error) {
    state.movie = null
    elements['movie-content'].hidden = true
    elements['empty-state'].hidden = false
    showNotice(error.status === 401 ? 'Chave administrativa inválida.' : error.message, 'error')
  } finally {
    setBusy(false)
  }
}

async function moderate(action) {
  if (!state.metaId) return
  const isDisable = action === 'disable'
  const verb = isDisable ? 'desativar' : 'restaurar'
  if (!window.confirm(`Deseja realmente ${verb} ${state.metaId}?`)) return

  hideNotice()
  setBusy(true)
  try {
    const response = await api(`/admin/movies/${encodeURIComponent(state.metaId)}/${action}`, {
      method: 'POST',
      headers: isDisable ? { 'X-Confirm-Movie-Id': state.metaId } : {}
    })
    renderMovie({ ...state.movie, ...response.data })
    await loadAudit()
    showNotice(`Filme ${isDisable ? 'desativado' : 'restaurado'} com sucesso.`, 'success')
  } catch (error) {
    showNotice(error.status === 401 ? 'Chave administrativa inválida.' : error.message, 'error')
  } finally {
    setBusy(false)
  }
}

elements['credentials-form'].addEventListener('submit', (event) => {
  event.preventDefault()
  state.apiKey = elements['api-key'].value
  state.moderatorId = elements['moderator-id'].value.trim()
  elements['api-key'].value = ''
  elements['connection-status'].dataset.state = 'connected'
  elements['connection-status'].lastElementChild.textContent = state.moderatorId
    ? `Chave em memória · ${state.moderatorId}`
    : 'Chave mantida somente nesta aba'
  showNotice('Chave carregada em memória. Faça uma busca para validar o acesso.', 'success')
})

elements['toggle-secret'].addEventListener('click', () => {
  const showing = elements['api-key'].type === 'text'
  elements['api-key'].type = showing ? 'password' : 'text'
  elements['toggle-secret'].textContent = showing ? 'Mostrar' : 'Ocultar'
  elements['toggle-secret'].setAttribute('aria-label', showing ? 'Mostrar chave' : 'Ocultar chave')
})

elements['search-form'].addEventListener('submit', (event) => {
  event.preventDefault()
  const metaId = elements['movie-id'].value.trim()
  if (!/^tt\d+$/.test(metaId)) {
    showNotice('Informe um IMDb ID válido, como tt1234567.', 'error')
    return
  }
  void loadMovie(metaId)
})

elements['disable-button'].addEventListener('click', () => void moderate('disable'))
elements['restore-button'].addEventListener('click', () => void moderate('restore'))
elements['refresh-audit'].addEventListener('click', async () => {
  setBusy(true)
  try {
    await loadAudit()
    showNotice('Histórico atualizado.', 'success')
  } catch (error) {
    showNotice(error.message, 'error')
  } finally {
    setBusy(false)
  }
})
