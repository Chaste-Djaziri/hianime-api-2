import { load } from 'cheerio';
import config from '../config/config.js';
import { extractNextFlightObject } from './extractNextFlight.js';

export interface Episode {
  title: string | null;
  alternativeTitle: string | null;
  id: string | null;
  isFiller: boolean;
  episodeNumber: number;
  animeId?: number;
  embedId?: string | null;
  thumbnail?: string | null;
  sub?: boolean;
  dub?: boolean;
  embedUrl?: string | null;
  dubEmbedUrl?: string | null;
}

export interface NextEpisode {
  id: number;
  anime_id: number;
  number: number;
  titles?: { en?: string | null; ja?: string | null; romaji?: string | null };
  filler?: boolean;
  thumbnail?: string | null;
  sub?: boolean;
  dub?: boolean;
  embed_id?: string | null;
}

interface NextAnimePage {
  slug: string;
  anime: { id: number };
  episodes: NextEpisode[];
}

export interface NextEpisodesApiResponse {
  anime_id: number;
  total: number;
  sub_count: string;
  dub_count: string;
  data: NextEpisode[];
}

export const createEmbedUrl = (animeId: number, episodeNumber: number, language: 'sub' | 'dub') =>
  `${config.playerBaseurl}/embed/hd-1/${animeId}/${episodeNumber}/${language}?k=1`;

const mapNextEpisode = (episode: NextEpisode, animeSlug: string, fallbackAnimeId: number) => {
  const animeId = episode.anime_id || fallbackAnimeId;

  return {
    title: episode.titles?.en || episode.titles?.romaji || null,
    alternativeTitle: episode.titles?.romaji || episode.titles?.ja || null,
    id: `${animeSlug}?ep=${episode.number}`,
    isFiller: episode.filler ?? false,
    episodeNumber: episode.number,
    animeId,
    embedId: episode.embed_id || null,
    thumbnail: episode.thumbnail || null,
    sub: episode.sub ?? false,
    dub: episode.dub ?? false,
    embedUrl: episode.sub === false ? null : createEmbedUrl(animeId, episode.number, 'sub'),
    dubEmbedUrl: episode.dub ? createEmbedUrl(animeId, episode.number, 'dub') : null,
  } satisfies Episode;
};

export const extractEpisodesFromApi = (
  response: NextEpisodesApiResponse,
  animeSlug: string
): Episode[] =>
  Array.isArray(response.data)
    ? response.data.map(episode => mapNextEpisode(episode, animeSlug, response.anime_id))
    : [];

export const extractEpisodes = (html: string, animeSlug?: string): Episode[] => {
  if (animeSlug) {
    const page = extractNextFlightObject<NextAnimePage>(
      html,
      `{"slug":${JSON.stringify(animeSlug)},"anime":`
    );

    if (page?.episodes) {
      return page.episodes.map(episode => mapNextEpisode(episode, animeSlug, page.anime.id));
    }
  }

  const $ = load(html);

  const response: Episode[] = [];
  $('.ssl-item.ep-item').each((i, el) => {
    const obj: Episode = {
      title: null,
      alternativeTitle: null,
      id: null,
      isFiller: false,
      episodeNumber: i + 1,
    };
    obj.title = $(el).attr('title') || null;
    obj.id = $(el).attr('href')?.replace('/watch/', '').replace('?', '::') || null;
    obj.isFiller = $(el).hasClass('ssl-item-filler');

    obj.alternativeTitle = $(el).find('.ep-name.e-dynamic-name').attr('data-jname') || null;

    response.push(obj);
  });
  return response;
};
