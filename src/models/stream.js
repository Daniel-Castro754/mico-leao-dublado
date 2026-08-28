import mongoose from 'mongoose'

const streamSchema = new mongoose.Schema({
  metaId: { type: String, required: true, trim: true },
  type: { type: String, required: true, enum: ['movie'], default: 'movie' },
  title: { type: String, required: true, trim: true, maxlength: 300 },
  infoHash: {
    type: String,
    required: true,
    lowercase: true,
    match: /^[a-f0-9]{40}$/
  },
  sources: { type: [String], default: [] }
}, {
  strict: 'throw',
  timestamps: true,
  versionKey: false
})

streamSchema.index(
  { metaId: 1, infoHash: 1 },
  { unique: true, name: 'stream_meta_infohash_unique' }
)
streamSchema.index({ metaId: 1, title: 1 }, { name: 'stream_meta_title' })

export const Stream = mongoose.models.Stream ?? mongoose.model('Stream', streamSchema)
