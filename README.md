# Mico-Leão Dublado

Addon comunitário do [Stremio](https://www.stremio.com/) para organizar e disponibilizar um catálogo de filmes dublados em português brasileiro.

Esta é uma modernização do projeto original, agora com Node.js 24, SDK Stremio moderno, MongoDB, validação de dados, API administrativa autenticada, testes automatizados, health checks, Docker e integração contínua.

## Principais recursos

- Catálogo de filmes com busca, gêneros e paginação.
- Streams BitTorrent representados por `infoHash` e trackers.
- Manifesto estático e disponível independentemente dos dados do catálogo.
- MongoDB com índices únicos contra duplicatas.
- Importação administrativa protegida por Bearer token.
- Moderação reversível para consultar, desativar e restaurar filmes sem apagar dados.
- Validação de configuração e payloads com Zod.
- Rate limit, headers de segurança e limites de payload.
- Logs estruturados sem exposição intencional de credenciais.
- Endpoints de liveness e readiness.
- Encerramento gracioso do servidor.
- CI com lint, testes, audit e build do container.

## Requisitos

- Node.js 24 ou superior.
- npm 11 ou superior.
- MongoDB suportado pelo Mongoose 9.
- Docker e Docker Compose são opcionais, mas recomendados para desenvolvimento.

## Início rápido com Docker

1. Copie o arquivo de exemplo:

   ```bash
   cp .env.example .env
   ```

2. Opcionalmente, gere uma chave para habilitar a API administrativa:

   ```bash
   openssl rand -hex 32
   ```

   Coloque o resultado em `INGEST_API_KEY` no arquivo `.env`.

3. Inicie a aplicação e o MongoDB:

   ```bash
   docker compose up --build
   ```

4. Abra:

   ```text
   http://localhost:8080/
   ```

O manifesto estará em:

```text
http://localhost:8080/manifest.json
```

> O Compose fornecido é voltado ao desenvolvimento local. Em produção, use autenticação, backups, rede privada e TLS para o MongoDB.

## Execução sem Docker

1. Instale as dependências:

   ```bash
   npm ci
   ```

2. Configure o ambiente:

   ```bash
   cp .env.example .env
   ```

3. Exporte as variáveis do `.env` usando a ferramenta de sua preferência e execute:

   ```bash
   npm start
   ```

Durante o desenvolvimento também é possível usar:

```bash
npm run dev
```

## Variáveis de ambiente

| Variável | Obrigatória | Padrão | Descrição |
|---|---:|---|---|
| `MONGODB_URI` | Sim | — | URI completa `mongodb://` ou `mongodb+srv://`. |
| `PORT` | Não | `3000` | Porta HTTP da aplicação. |
| `NODE_ENV` | Não | `development` | `development`, `test` ou `production`. |
| `LOG_LEVEL` | Não | `info` | Nível dos logs estruturados. |
| `TRUST_PROXY` | Não | `false` | Ative somente atrás de um proxy conhecido. |
| `INGEST_API_KEY` | Não | desabilitada | Chave de no mínimo 32 caracteres para a API administrativa. |
| `DB_CONNECT_MAX_ATTEMPTS` | Não | `5` | Número máximo de tentativas de conexão. |
| `DB_CONNECT_RETRY_MS` | Não | `2000` | Intervalo base entre tentativas. |
| `DB_SERVER_SELECTION_TIMEOUT_MS` | Não | `5000` | Timeout de seleção do servidor MongoDB. |
| `ADMIN_RATE_LIMIT_WINDOW_MS` | Não | `60000` | Janela do rate limit administrativo. |
| `ADMIN_RATE_LIMIT_MAX` | Não | `30` | Requisições permitidas por janela. |

Não monte URIs a partir de usuário e senha dentro do código e nunca registre `MONGODB_URI` ou `INGEST_API_KEY` nos logs.

## Adicionar ao Stremio

Depois de publicar o servidor em um domínio HTTPS, use a URL completa do manifesto:

```text
https://seu-dominio.example/manifest.json
```

No Stremio, abra a área de addons e informe essa URL. A página inicial do servidor também disponibiliza um botão de instalação.

O endereço antigo do Baby Beamup foi removido porque não está mais ativo.

## Verificação do banco legado

Antes de iniciar esta versão contra o banco antigo, execute o diagnóstico somente leitura. Ele procura documentos inválidos e duplicatas que impediriam a criação dos novos índices únicos.

No PowerShell:

```powershell
$env:MONGODB_URI = 'mongodb://localhost:27017/mico-leao-dublado'
npm run db:check
```

No Bash:

```bash
MONGODB_URI='mongodb://localhost:27017/mico-leao-dublado' npm run db:check
```

O comando não insere, altera nem remove documentos e inclui `"readOnly": true` no relatório JSON. Os códigos de saída são:

- `0`: nenhuma incompatibilidade detectada;
- `1`: falha de configuração, conexão ou consulta;
- `2`: duplicatas ou documentos incompatíveis encontrados.

Crie um backup antes de qualquer correção. A remoção automática de duplicatas não é executada, pois a escolha do registro que deve prevalecer depende do conteúdo moderado.

## Importação administrativa

A rota pública antiga `POST /movie` foi removida por segurança. Ela agora responde com HTTP `410 Gone`.

A nova rota é:

```text
POST /admin/movies
Authorization: Bearer SUA_INGEST_API_KEY
Content-Type: application/json
```

Exemplo de payload:

```json
{
  "meta": {
    "id": "tt1234567",
    "type": "movie",
    "name": "Nome do filme",
    "genres": ["Aventura"],
    "poster": "https://example.com/poster.jpg",
    "description": "Descrição do filme.",
    "releaseInfo": "2026",
    "imdbRating": 7.5,
    "runtime": "1h 40min",
    "catalogs": ["BrazilianCatalog"]
  },
  "magnets": [
    {
      "title": "Nome do filme 1080p Dublado",
      "magnet": "magnet:?xt=urn:btih:HASH_BTih_DE_40_CARACTERES"
    }
  ]
}
```

Exemplo com `curl`:

```bash
curl --request POST http://localhost:8080/admin/movies \
  --header "Authorization: Bearer $INGEST_API_KEY" \
  --header "Content-Type: application/json" \
  --data @movie.json
```

Quando `INGEST_API_KEY` não está definida, a API protegida em `/admin/movies` responde como inexistente. A página estática do painel ainda pode ser aberta, mas não consegue consultar nem alterar dados.

### Painel administrativo

A aplicação inclui uma interface web sem dependências externas em:

```text
http://localhost:8080/admin/
```

O painel permite:

- informar a chave administrativa e uma identificação opcional do moderador;
- consultar um filme pelo IMDb ID;
- visualizar metadados e streams armazenados;
- desativar ou restaurar conteúdo;
- consultar o histórico persistente de auditoria;
- acompanhar o `X-Request-Id` da última requisição.

A chave é mantida somente na memória JavaScript da aba. Ela não é salva em cookies, `localStorage`, `sessionStorage` ou parâmetros da URL e é apagada ao atualizar ou fechar a página. Em produção, o painel deve ser acessado exclusivamente por HTTPS.

Os arquivos JavaScript e CSS são servidos pela própria aplicação e respeitam a política CSP do Helmet. A interface usa APIs seguras do DOM e não injeta respostas da API como HTML.

### Moderação reversível

Todas as rotas de moderação usam o mesmo Bearer token da ingestão. Para consultar metadados, estado e streams armazenados:

```bash
curl http://localhost:8080/admin/movies/tt1234567 \
  --header "Authorization: Bearer $INGEST_API_KEY"
```

Para desativar um filme, envie também o cabeçalho de confirmação com o mesmo IMDb ID da URL:

```bash
curl --request POST http://localhost:8080/admin/movies/tt1234567/disable \
  --header "Authorization: Bearer $INGEST_API_KEY" \
  --header "X-Confirm-Movie-Id: tt1234567"
```

Um filme desativado deixa imediatamente de aparecer no catálogo e seus streams deixam de ser retornados, mas nenhum documento é apagado. Para restaurá-lo:

```bash
curl --request POST http://localhost:8080/admin/movies/tt1234567/restore \
  --header "Authorization: Bearer $INGEST_API_KEY"
```

As operações de desativação e restauração geram logs estruturados com o IMDb ID, sem incluir o Bearer token.

### Histórico administrativo persistente

As operações de ingestão, desativação e restauração são registradas na coleção `audit_events`. O servidor cria o evento antes de iniciar a alteração e depois o finaliza com um dos estados:

- `started`: alteração iniciada, mas ainda não finalizada;
- `completed`: alteração concluída;
- `failed`: a operação gerou erro;
- `not_found`: o filme solicitado não existia.

É possível identificar opcionalmente o moderador em cada mutação:

```text
X-Moderator-Id: daniel.castro
```

O identificador aceita até 100 letras, números e os caracteres `.`, `_`, `@` e `-`. Esse cabeçalho é uma identificação declarada pelo cliente que possui a chave compartilhada; ele não substitui autenticação individual. Para atribuição forte entre vários moderadores, use chaves individuais ou um provedor de identidade em uma evolução futura.

Cada resposta HTTP recebe também um `X-Request-Id` gerado pelo servidor. Esse ID relaciona a resposta, os logs estruturados e o evento persistido.

Para consultar os eventos mais recentes de um filme:

```bash
curl "http://localhost:8080/admin/movies/tt1234567/audit?limit=50" \
  --header "Authorization: Bearer $INGEST_API_KEY"
```

O limite padrão é 50 e o máximo é 100 eventos. O histórico não armazena Bearer tokens, magnets, payloads completos nem mensagens internas de erro. Em falhas são persistidos somente o nome e, quando disponível, o código seguro do erro.

## Endpoints operacionais

| Endpoint | Uso |
|---|---|
| `/health/live` | Confirma que o processo HTTP está vivo. |
| `/health/ready` | Confirma que o MongoDB está conectado. |
| `/manifest.json` | Manifesto do addon para o Stremio. |
| `/catalog/movie/BrazilianCatalog.json` | Catálogo principal. |
| `/stream/movie/:imdbId.json` | Streams associados ao filme. |
| `GET /admin/movies/:imdbId` | Consulta administrativa autenticada. |
| `POST /admin/movies/:imdbId/disable` | Desativa sem apagar; requer confirmação por cabeçalho. |
| `POST /admin/movies/:imdbId/restore` | Restaura um filme desativado. |
| `GET /admin/movies/:imdbId/audit` | Lista o histórico administrativo persistente. |

## Qualidade e testes

```bash
npm run lint
npm test
npm run test:coverage
npm run audit:prod
npm run check
```

O projeto usa o test runner nativo do Node.js para reduzir dependências de desenvolvimento.

## Estrutura

```text
src/
├── http/          # Aplicação Express e API administrativa
├── models/        # Schemas e índices do Mongoose
├── repositories/  # Consultas e upserts atômicos
├── schemas/       # Validação dos payloads
├── services/      # Regras de ingestão e magnets
├── addon.js       # Handlers do protocolo Stremio
├── config.js      # Validação das variáveis de ambiente
├── database.js    # Ciclo de vida do MongoDB
├── index.js       # Inicialização e encerramento
├── logger.js      # Logs estruturados e sanitização
└── manifest.js    # Manifesto estático
```

## Produção

Antes de publicar:

- Ao reaproveitar um banco legado, faça backup e elimine eventuais duplicatas de `Meta.id` e de `{ Stream.metaId, Stream.infoHash }`; os novos índices únicos rejeitam dados duplicados durante a inicialização.
- Use HTTPS em um proxy ou plataforma confiável.
- Mantenha o MongoDB em rede privada, com autenticação e backups.
- Use uma `INGEST_API_KEY` aleatória e rotacione-a periodicamente.
- Não exponha a API administrativa se ela não for necessária.
- Execute `npm run check` e `npm run audit:prod` no deploy.
- Monitore `/health/ready`, erros e latência.
- Teste recuperação de backup e rollback da aplicação.

## Responsabilidade de uso e conteúdo

Este projeto fornece software para organização e consulta de metadados e referências de streams. Ele não hospeda os arquivos de mídia.

Cada utilizador é responsável por avaliar a procedência, as permissões, a segurança e a legalidade do conteúdo em sua jurisdição. O uso do software e todas as consequências decorrentes desse uso são de exclusiva responsabilidade do utilizador.

Este aviso não substitui a legislação aplicável e não concede direitos sobre obras, marcas, metadados ou conteúdos de terceiros.

## Licença

O código-fonte é disponibilizado sob a licença MIT. Consulte [LICENSE](LICENSE).

