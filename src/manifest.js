export const manifest = Object.freeze({
  id: 'community.mico-leao-dublado',
  version: '1.0.0',
  name: 'Mico-Leão Dublado',
  description: 'Catálogo comunitário de filmes dublados em português brasileiro.',
  logo: 'https://i.ibb.co/9tWdHsv/icon.jpg',
  resources: ['catalog', 'stream'],
  types: ['movie'],
  catalogs: [
    {
      type: 'movie',
      id: 'BrazilianCatalog',
      name: 'Filmes Dublados (pt-BR)',
      genres: [
        'Ação',
        'Animação',
        'Aventura',
        'Clássico',
        'Comédia',
        'Documentário',
        'Drama',
        'Fantasia',
        'Ficção',
        'Faroeste',
        'Guerra',
        'Musical',
        'Nacional',
        'Policial',
        'Romance',
        'Suspense',
        'Terror'
      ],
      extraSupported: ['search', 'genre', 'skip']
    }
  ],
  idPrefixes: ['tt']
})
