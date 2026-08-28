import mongoose from 'mongoose'

const detailsSchema = new mongoose.Schema({
  receivedStreams: { type: Number, min: 0 },
  matchedCount: { type: Number, min: 0 },
  modifiedCount: { type: Number, min: 0 },
  upsertedCount: { type: Number, min: 0 }
}, { _id: false, strict: 'throw' })

const errorSchema = new mongoose.Schema({
  name: { type: String, maxlength: 200 },
  code: { type: String, maxlength: 200 }
}, { _id: false, strict: 'throw' })

const auditEventSchema = new mongoose.Schema({
  requestId: { type: String, required: true, immutable: true },
  action: {
    type: String,
    required: true,
    immutable: true,
    enum: ['movie.ingested', 'movie.disabled', 'movie.restored']
  },
  status: {
    type: String,
    required: true,
    enum: ['started', 'completed', 'failed', 'not_found']
  },
  metaId: { type: String, required: true, immutable: true, match: /^tt\d+$/ },
  moderatorId: { type: String, immutable: true, maxlength: 100 },
  details: { type: detailsSchema },
  error: { type: errorSchema },
  completedAt: { type: Date }
}, {
  strict: 'throw',
  collection: 'audit_events',
  timestamps: true,
  versionKey: false
})

auditEventSchema.index({ requestId: 1 }, { unique: true, name: 'audit_request_unique' })
auditEventSchema.index({ metaId: 1, createdAt: -1, _id: -1 }, { name: 'audit_meta_history' })
auditEventSchema.index({ status: 1, createdAt: -1 }, { name: 'audit_status_history' })

export const AuditEvent = mongoose.models.AuditEvent
  ?? mongoose.model('AuditEvent', auditEventSchema)
