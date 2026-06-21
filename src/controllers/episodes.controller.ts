import { Context } from 'hono';
import config from '../config/config.js';
import { validationError } from '../utils/errors.js';
import {
  extractEpisodes,
  extractEpisodesFromApi,
  Episode,
  NextEpisodesApiResponse,
} from '../extractor/extractEpisodes.js';
import { axiosInstance } from '../services/axiosInstance.js';

export interface EpisodesResponse {
  totalEpisodes: number;
  episodes: Episode[];
}

const episodesController = async (c: Context): Promise<EpisodesResponse> => {
  const id = c.req.param('id');

  if (!id) throw new validationError('id is required');

  const numericId = Number(id.split('-').at(-1));
  if (!Number.isInteger(numericId) || numericId <= 0) {
    throw new validationError('Anime id must end with its numeric id', {
      validIdExample: 'one-piece-12',
    });
  }

  const result = await axiosInstance(`${config.dataApiBaseurl}/anime/${numericId}/episodes`);

  if (!result.success || !result.data) {
    throw new validationError(result.message || 'make sure the id is correct', {
      validIdEX: 'one-piece-100',
    });
  }

  let episodes: Episode[];
  try {
    episodes = extractEpisodesFromApi(JSON.parse(result.data) as NextEpisodesApiResponse, id);
  } catch {
    episodes = extractEpisodes(result.data, id);
  }
  if (episodes.length === 0) {
    throw new validationError('No episodes found; make sure the anime id is correct', {
      validIdExample: 'one-piece-12',
    });
  }

  return { totalEpisodes: episodes.length, episodes };
};

export default episodesController;
