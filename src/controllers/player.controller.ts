import { Context } from 'hono';
import { createEmbedUrl } from '../extractor/extractEpisodes.js';
import { validationError } from '../utils/errors.js';

const playerController = (c: Context) => {
  const id = c.req.param('id');
  if (!id) throw new validationError('Anime id is required');

  const episodeNumber = Number(c.req.param('episode'));
  const animeId = Number(id.split('-').at(-1));
  const language = c.req.query('type') || 'sub';

  if (!Number.isInteger(animeId) || animeId <= 0) {
    throw new validationError('Anime id must end with its numeric id', {
      validIdExample: 'one-piece-12',
    });
  }
  if (!Number.isInteger(episodeNumber) || episodeNumber <= 0) {
    throw new validationError('Episode number must be a positive integer');
  }
  if (language !== 'sub' && language !== 'dub') {
    throw new validationError('type must be either sub or dub');
  }

  return {
    animeId,
    episodeNumber,
    type: language,
    embedUrl: createEmbedUrl(animeId, episodeNumber, language),
  };
};

export default playerController;
