import { Context } from 'hono';
import {
  ApiAnimeDetail,
  extractDetailpage,
  extractDetailpageFromApi,
} from '../extractor/extractDetailpage';
import { axiosInstance } from '../services/axiosInstance';
import { validationError } from '../utils/errors';
import { DetailAnime } from '../types/anime';
import config from '../config/config';

const detailpageController = async (c: Context): Promise<DetailAnime> => {
  const id = c.req.param('id');
  if (!id) throw new validationError('Anime id is required');

  const numericId = Number(id.split('-').at(-1));
  if (!Number.isInteger(numericId) || numericId <= 0) {
    throw new validationError('Anime id must end with its numeric id', {
      validIdExample: 'one-piece-12',
    });
  }

  const result = await axiosInstance(`${config.dataApiBaseurl}/anime/${numericId}`);
  if (!result.success || !result.data) {
    throw new validationError(
      result.message || 'Failed to fetch detail page',
      'maybe id is incorrect : ' + id
    );
  }
  try {
    return extractDetailpageFromApi(JSON.parse(result.data) as ApiAnimeDetail);
  } catch {
    return extractDetailpage(result.data);
  }
};

export default detailpageController;
