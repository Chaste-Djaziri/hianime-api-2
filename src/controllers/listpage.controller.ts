import { Context } from 'hono';
import { axiosInstance } from '../services/axiosInstance.js';
import { NotFoundError, validationError } from '../utils/errors.js';
import config from '../config/config.js';
import { AnimeFeatured } from '../types/anime.js';

type DataListAnime = {
  slug?: string | null;
  title?: string | null;
  name?: string | null;
  alternativeTitle?: string | null;
  poster?: string | null;
  type?: string | null;
  duration?: string | null;
  episodes?: { sub?: number | null; dub?: number | null; eps?: number | null } | null;
};

type DataListResponse = {
  response?: DataListAnime[];
  pageInfo?: { currentPage?: number; hasNextPage?: boolean; totalPages?: number };
};

type ListResponse = {
  pageInfo: { currentPage: number; hasNextPage: boolean; totalPages: number };
  animes: AnimeFeatured[];
};

const VALID_QUERIES = [
  'top-airing', 'most-popular', 'most-favorite', 'completed', 'recently-added',
  'recently-updated', 'top-upcoming', 'genre', 'producer', 'az-list', 'subbed-anime',
  'dubbed-anime', 'movie', 'tv', 'ova', 'ona', 'special', 'events',
];

const listpageController = async (c: Context): Promise<ListResponse> => {
  const query = c.req.param('query')?.toLowerCase() || '';
  if (!VALID_QUERIES.includes(query)) {
    throw new validationError('invalid query', { validateQueries: VALID_QUERIES });
  }

  let category = c.req.param('category') || null;
  const page = c.req.query('page') || '1';
  if ((query === 'genre' || query === 'producer') && !category) {
    throw new validationError(`category is require for query ${query}`);
  }
  if (!['genre', 'producer', 'az-list'].includes(query)) category = null;

  const normalizedCategory = category?.replaceAll(' ', '-').toLowerCase();
  const path = normalizedCategory ? `${query}/${normalizedCategory}` : query;
  const endpoint = `${config.dataApiBaseurl}/animes/${path}?page=${encodeURIComponent(page)}`;
  const result = await axiosInstance(endpoint);
  if (!result.success || !result.data) {
    throw new validationError(result.message || 'make sure given endpoint is correct');
  }

  let payload: DataListResponse;
  try {
    payload = JSON.parse(result.data) as DataListResponse;
  } catch {
    throw new validationError('Anime list provider returned malformed JSON');
  }

  const animes = (payload.response ?? [])
    .filter(anime => Boolean(anime.slug))
    .map(anime => ({
      title: anime.title ?? anime.name ?? null,
      alternativeTitle: anime.alternativeTitle ?? null,
      id: anime.slug ?? null,
      poster: anime.poster ?? null,
      type: anime.type ?? null,
      duration: anime.duration ?? null,
      episodes: {
        sub: anime.episodes?.sub ?? null,
        dub: anime.episodes?.dub ?? null,
        eps: anime.episodes?.eps ?? null,
      },
    }));
  if (!animes.length) throw new NotFoundError();

  const currentPage = Math.max(1, Number(payload.pageInfo?.currentPage ?? page) || 1);
  const totalPages = Math.max(currentPage, Number(payload.pageInfo?.totalPages ?? currentPage) || currentPage);
  return {
    pageInfo: {
      currentPage,
      totalPages,
      hasNextPage: payload.pageInfo?.hasNextPage ?? currentPage < totalPages,
    },
    animes,
  };
};

export default listpageController;
