import { z } from 'zod'

const optionalUrl = z.union([z.url(), z.literal('')]).optional()

export const imdbIdSchema = z.string()
  .regex(/^tt\d+$/, 'id deve ser um identificador IMDb, por exemplo tt1234567')

export const movieMetaSchema = z.object({
  id: imdbIdSchema,
  type: z.literal('movie').default('movie'),
  name: z.string().trim().min(1).max(300),
  genres: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  poster: optionalUrl,
  background: optionalUrl,
  logo: optionalUrl,
  description: z.string().trim().max(10_000).optional(),
  releaseInfo: z.string().trim().max(80).optional(),
  imdbRating: z.number().min(0).max(10).optional(),
  runtime: z.string().trim().max(80).optional(),
  catalogs: z.array(z.string().trim().min(1).max(100)).min(1).max(10)
})

export const movieMagnetSchema = z.object({
  title: z.string().trim().min(1).max(300),
  magnet: z.string().trim().startsWith('magnet:?').max(16_384)
})

export const movieInputSchema = z.object({
  meta: movieMetaSchema,
  magnets: z.array(movieMagnetSchema).min(1).max(50)
}).strict()
