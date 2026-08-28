import mongoose from 'mongoose'
import { toLogError } from './logger.js'

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

export async function connectDatabase({
  uri,
  maxAttempts = 5,
  retryDelayMs = 2_000,
  serverSelectionTimeoutMs = 5_000,
  logger
}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await mongoose.connect(uri, {
        autoIndex: false,
        serverSelectionTimeoutMS: serverSelectionTimeoutMs,
        maxPoolSize: 20,
        minPoolSize: 1
      })

      logger?.info({ attempt, database: mongoose.connection.name }, 'MongoDB conectado')
      return mongoose.connection
    } catch (error) {
      logger?.warn(
        { attempt, maxAttempts, error: toLogError(error) },
        'Falha ao conectar ao MongoDB'
      )

      if (attempt === maxAttempts) {
        throw new Error(`Não foi possível conectar ao MongoDB após ${maxAttempts} tentativas`, {
          cause: error
        })
      }

      await sleep(retryDelayMs * attempt)
    }
  }

  throw new Error('Fluxo de conexão ao MongoDB terminou de forma inesperada')
}

export function isDatabaseReady() {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== mongoose.ConnectionStates.disconnected) {
    await mongoose.disconnect()
  }
}
