import { movieInputSchema } from '../schemas/movie.js'
import { assembleMovie } from './movie-assembler.js'

export class MovieIngestionService {
  constructor({ metaRepository, streamRepository }) {
    this.metaRepository = metaRepository
    this.streamRepository = streamRepository
  }

  async upsert(input) {
    const movie = movieInputSchema.parse(input)
    const { meta, streams } = assembleMovie(movie)

    const savedMeta = await this.metaRepository.upsert(meta)
    const streamResult = await this.streamRepository.upsertMany(streams)

    return {
      metaId: savedMeta.id,
      receivedStreams: streams.length,
      ...streamResult
    }
  }
}
