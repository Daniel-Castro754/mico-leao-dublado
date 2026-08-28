import mongoose from 'mongoose'

const metaSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true },
  type: { type: String, required: true, enum: ['movie'], default: 'movie' },
  name: { type: String, required: true, trim: true, maxlength: 300 },
  genres: { type: [String], default: [] },
  poster: { type: String },
  background: { type: String },
  logo: { type: String },
  description: { type: String, maxlength: 10_000 },
  releaseInfo: { type: String, maxlength: 80 },
  imdbRating: { type: Number, min: 0, max: 10 },
  runtime: { type: String, maxlength: 80 },
  catalogs: { type: [String], required: true },
  disabledAt: { type: Date, default: null }
}, {
  strict: 'throw',
  timestamps: true,
  versionKey: false
})

metaSchema.index({ id: 1 }, { unique: true, name: 'meta_id_unique' })
metaSchema.index(
  { disabledAt: 1, catalogs: 1, name: 1, id: 1 },
  { name: 'catalog_active_name' }
)
metaSchema.index(
  { disabledAt: 1, genres: 1, name: 1, id: 1 },
  { name: 'catalog_active_genre_name' }
)

export const Meta = mongoose.models.Meta ?? mongoose.model('Meta', metaSchema)
