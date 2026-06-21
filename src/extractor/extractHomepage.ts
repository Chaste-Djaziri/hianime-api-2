import { load } from 'cheerio';
import { Element } from 'domhandler';
import { HomePage, SpotlightAnime, TrendingAnime, AnimeFeatured } from '../types/anime';
import { extractNextFlightObject } from './extractNextFlight';

interface NextAnimeCard {
  slug: string;
  titles?: { romaji?: string | null; english?: string | null; native?: string | null };
  type?: string | null;
  quality?: string | null;
  episodes?: number | null;
  duration?: string | null;
  sub?: number | null;
  dub?: number | null;
  rank?: number | null;
  aired?: string | null;
  synopsis?: string | null;
  images?: { poster?: string | null };
}

interface NextHomeData {
  success: boolean;
  data: {
    spotlight?: NextAnimeCard[];
    trending?: NextAnimeCard[];
    latestEpisode?: NextAnimeCard[];
    topAiring?: { all?: NextAnimeCard[] } | NextAnimeCard[];
    mostPopular?: NextAnimeCard[];
    mostFavorite?: NextAnimeCard[];
    justCompleted?: NextAnimeCard[];
    newAdded?: NextAnimeCard[];
    topUpcoming?: NextAnimeCard[];
    top10?: { today?: NextAnimeCard[]; week?: NextAnimeCard[]; month?: NextAnimeCard[] };
  };
}

const titleFor = (anime: NextAnimeCard) => anime.titles?.english || anime.titles?.romaji || null;

const toFeatured = (anime: NextAnimeCard): AnimeFeatured => ({
  title: titleFor(anime),
  alternativeTitle: anime.titles?.romaji || anime.titles?.native || null,
  id: anime.slug || null,
  poster: anime.images?.poster || null,
  type: anime.type || null,
  duration: anime.duration || null,
  episodes: {
    sub: anime.sub ?? null,
    dub: anime.dub ?? null,
    eps: anime.episodes ?? anime.sub ?? null,
  },
});

const toTrending = (anime: NextAnimeCard, index: number): TrendingAnime => ({
  title: titleFor(anime),
  alternativeTitle: anime.titles?.romaji || anime.titles?.native || null,
  id: anime.slug || null,
  poster: anime.images?.poster || null,
  rank: anime.rank ?? index + 1,
});

const extractNextHomepage = (html: string): HomePage | null => {
  const root = extractNextFlightObject<{ homeData: NextHomeData }>(html, '{"homeData":');
  if (!root?.homeData?.success || !root.homeData.data) return null;

  const data = root.homeData.data;
  const topAiring = Array.isArray(data.topAiring) ? data.topAiring : data.topAiring?.all;

  return {
    spotlight: (data.spotlight || []).map((anime, index) => ({
      ...toFeatured(anime),
      rank: anime.rank ?? index + 1,
      quality: anime.quality || null,
      aired: anime.aired || null,
      synopsis: anime.synopsis?.startsWith('$') ? null : anime.synopsis || null,
      duration: anime.duration || null,
    })),
    trending: (data.trending || []).map(toTrending),
    topAiring: (topAiring || []).map(toFeatured),
    mostPopular: (data.mostPopular || []).map(toFeatured),
    mostFavorite: (data.mostFavorite || []).map(toFeatured),
    latestCompleted: (data.justCompleted || []).map(toFeatured),
    latestEpisode: (data.latestEpisode || []).map(toFeatured),
    newAdded: (data.newAdded || []).map(toFeatured),
    topUpcoming: (data.topUpcoming || []).map(toFeatured),
    top10: {
      today: (data.top10?.today || []).map(toTrending),
      week: (data.top10?.week || []).map(toTrending),
      month: (data.top10?.month || []).map(toTrending),
    },
    genres: [],
  };
};

export const extractHomepage = (html: string): HomePage => {
  const nextHomepage = extractNextHomepage(html);
  if (nextHomepage) return nextHomepage;

  const $ = load(html);

  const response: HomePage = {
    spotlight: [],
    trending: [],
    topAiring: [],
    mostPopular: [],
    mostFavorite: [],
    latestCompleted: [],
    latestEpisode: [],
    newAdded: [],
    topUpcoming: [],
    top10: {
      today: null,
      week: null,
      month: null,
    },
    genres: [],
  };

  const $spotlight = $('.deslide-wrap .swiper-wrapper .swiper-slide');
  const $trending = $('#trending-home .swiper-container .swiper-slide');
  const $featured = $('#anime-featured .anif-blocks .row .anif-block');
  const $home = $('.block_area.block_area_home');
  const $top10 = $('.block_area .cbox');
  const $genres = $('.sb-genre-list');

  $($spotlight).each((i: number, el: Element) => {
    const obj: SpotlightAnime = {
      title: null,
      alternativeTitle: null,
      id: null,
      poster: null,
      rank: i + 1,
      type: null,
      quality: null,
      duration: null,
      aired: null,
      synopsis: null,
      episodes: {
        sub: null,
        dub: null,
        eps: null,
      },
    };
    obj.id = $(el).find('.desi-buttons a').first().attr('href')?.split('/').at(-1) || null;
    obj.poster = $(el).find('.deslide-cover .film-poster-img').attr('data-src') || null;

    const titles = $(el).find('.desi-head-title');
    obj.title = titles.text();
    obj.alternativeTitle = titles.attr('data-jname') || null;

    obj.synopsis = $(el).find('.desi-description').text().trim();

    const details = $(el).find('.sc-detail');
    obj.type = details.find('.scd-item').eq(0).text().trim();
    obj.duration = details.find('.scd-item').eq(1).text().trim();
    obj.aired = details.find('.scd-item.m-hide').text().trim();
    obj.quality = details.find('.scd-item .quality').text().trim();

    obj.episodes.sub = Number(details.find('.tick-sub').text().trim()) || null;
    obj.episodes.dub = Number(details.find('.tick-dub').text().trim()) || null;

    const epsText = details.find('.tick-eps').length
      ? details.find('.tick-eps').text().trim()
      : details.find('.tick-sub').text().trim();
    obj.episodes.eps = Number(epsText) || null;

    response.spotlight.push(obj);
  });
  $($trending).each((i: number, el: Element) => {
    const obj: TrendingAnime = {
      title: null,
      alternativeTitle: null,
      rank: i + 1,
      poster: null,
      id: null,
    };

    const titleEl = $(el).find('.item .film-title');
    obj.title = titleEl.text();
    obj.alternativeTitle = titleEl.attr('data-jname') || null;

    const imageEl = $(el).find('.film-poster');

    obj.poster = imageEl.find('img').attr('data-src') || null;
    obj.id = imageEl.attr('href')?.split('/').at(-1) || null;

    response.trending.push(obj);
  });

  $($featured).each((i: number, el: Element) => {
    const data = $(el)
      .find('.anif-block-ul ul li')
      .map((index: number, item: Element) => {
        const obj: AnimeFeatured = {
          title: null,
          alternativeTitle: null,
          id: null,
          poster: null,
          type: null,
          duration: null,
          episodes: {
            sub: null,
            dub: null,
            eps: null,
          },
        };
        const titleEl = $(item).find('.film-detail .film-name a');
        obj.title = titleEl.attr('title') || null;
        obj.alternativeTitle = titleEl.attr('data-jname') || null;
        obj.id = titleEl.attr('href')?.split('/').at(-1) || null;

        obj.poster = $(item).find('.film-poster .film-poster-img').attr('data-src') || null;

        // Extract type (first fdi-item) and duration (second fdi-item if exists)
        const infoItems = $(item).find('.fd-infor .fdi-item');
        obj.type = infoItems.eq(0).text().trim() || null;
        obj.duration = infoItems.eq(1).text().trim() || null;

        obj.episodes.sub = Number($(item).find('.tick .tick-sub').text()) || null;
        obj.episodes.dub = Number($(item).find('.tick .tick-dub').text()) || null;

        const epsText = $(item).find('.fd-infor .tick-eps').length
          ? $(item).find('.fd-infor .tick-eps').text()
          : $(item).find('.fd-infor .tick-sub').text();

        obj.episodes.eps = Number(epsText) || null;

        return obj;
      })
      .get();

    const dataType = $(el).find('.anif-block-header').text().replace(/\s+/g, '');
    const normalizedDataType = (dataType.charAt(0).toLowerCase() +
      dataType.slice(1)) as keyof HomePage;

    (response[normalizedDataType] as AnimeFeatured[]) = data as AnimeFeatured[];
  });

  $($home).each((i: number, el: Element) => {
    const data = $(el)
      .find('.tab-content .film_list-wrap .flw-item')
      .map((index: number, item: Element) => {
        const obj: AnimeFeatured = {
          title: null,
          alternativeTitle: null,
          id: null,
          poster: null,
          type: null, // Default
          episodes: {
            sub: null,
            dub: null,
            eps: null,
          },
        };
        const titleEl = $(item).find('.film-detail .film-name .dynamic-name');
        obj.title = titleEl.attr('title') || null;
        obj.alternativeTitle = titleEl.attr('data-jname') || null;
        obj.id = titleEl.attr('href')?.split('/').at(-1) || null;

        obj.poster = $(item).find('.film-poster img').attr('data-src') || null;

        const episodesEl = $(item).find('.film-poster .tick');
        obj.episodes.sub = Number($(episodesEl).find('.tick-sub').text()) || null;
        obj.episodes.dub = Number($(episodesEl).find('.tick-dub').text()) || null;

        const epsText = $(episodesEl).find('.tick-eps').length
          ? $(episodesEl).find('.tick-eps').text()
          : $(episodesEl).find('.tick-sub').text();

        obj.episodes.eps = Number(epsText) || null;

        return obj;
      })
      .get();

    const dataType = $(el).find('.cat-heading').text().replace(/\s+/g, '');
    const normalizedDataType = (dataType.charAt(0).toLowerCase() +
      dataType.slice(1)) as keyof HomePage;

    if ((normalizedDataType as string) === 'newOnHiAnime') {
      response.newAdded = data;
    } else if (normalizedDataType in response) {
      (response[normalizedDataType] as AnimeFeatured[]) = data as AnimeFeatured[];
    }
  });

  const extractTopTen = (id: string): TrendingAnime[] => {
    const res = $top10
      .find(`${id} ul li`)
      .map((i: number, el: Element) => {
        const obj: TrendingAnime = {
          title: $(el).find('.film-name a').text() || null,
          rank: i + 1,
          alternativeTitle: $(el).find('.film-name a').attr('data-jname') || null,
          id: $(el).find('.film-name a').attr('href')?.split('/').pop() || null,
          poster: $(el).find('.film-poster img').attr('data-src') || null,
        };
        return obj;
      })
      .get();
    return res;
  };

  response.top10.today = extractTopTen('#top-viewed-day');
  response.top10.week = extractTopTen('#top-viewed-week');
  response.top10.month = extractTopTen('#top-viewed-month');
  $($genres)
    .find('li')
    .each((i: number, el: Element) => {
      const genre = $(el).find('a').attr('title')?.toLocaleLowerCase() || '';
      response.genres.push(genre);
    });
  return response;
};
