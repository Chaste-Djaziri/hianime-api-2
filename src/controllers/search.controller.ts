import { Context } from 'hono';
import { axiosInstance } from '../services/axiosInstance.js';
import { NotFoundError, validationError } from '../utils/errors.js';
import config from '../config/config.js';
import { AnimeFeatured } from '../types/anime.js';

type DataSearchAnime = {
  slug?: string | null;
  title?: string | null;
  name?: string | null;
  alternativeTitle?: string | null;
  type?: string | null;
  episodes_count?: number | null;
  sub_count?: number | null;
  dub_count?: number | null;
  duration?: string | null;
  images?: { poster?: string | null } | null;
};

type DataSearchResponse = {
  response?: DataSearchAnime[];
  pageInfo?: {
    currentPage?: number;
    hasNextPage?: boolean;
    totalPages?: number;
  };
};

type SearchResponse = {
  pageInfo: { currentPage: number; hasNextPage: boolean; totalPages: number };
  animes: AnimeFeatured[];
};

const searchController = async (c: Context): Promise<SearchResponse> => {
  const keyword = c.req.query('keyword') || null;
  const page = c.req.query('page') || '1';

  if (!keyword) throw new validationError('query is required');

  const params = new URLSearchParams({ keyword: keyword.trim(), page });
  const endpoint = `${config.dataApiBaseurl}/search?${params.toString()}`;
  const result = await axiosInstance(endpoint);

  if (!result.success || !result.data) {
    throw new validationError(result.message || 'make sure given endpoint is correct');
  }

  let payload: DataSearchResponse;
  try {
    payload = JSON.parse(result.data) as DataSearchResponse;
  } catch {
    throw new validationError('Search provider returned malformed JSON');
  }

  const animes = (payload.response ?? [])
    .filter(anime => Boolean(anime.slug))
    .map(anime => ({
      title: anime.title ?? anime.name ?? null,
      alternativeTitle: anime.alternativeTitle ?? null,
      id: anime.slug ?? null,
      poster: anime.images?.poster ?? null,
      type: anime.type ?? null,
      duration: anime.duration ?? null,
      episodes: {
        sub: anime.sub_count ?? null,
        dub: anime.dub_count ?? null,
        eps: anime.episodes_count ?? null,
      },
    }));

  if (animes.length < 1) {
    throw new NotFoundError('page not found');
  }

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

export default searchController;
