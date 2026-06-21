import { describe, it, expect } from 'vitest';
import { extractHomepage } from '../../../../src/extractor/extractHomepage';
import {
  extractDetailpage,
  extractDetailpageFromApi,
} from '../../../../src/extractor/extractDetailpage';
import { extractListPage } from '../../../../src/extractor/extractListpage';
import { extractCharacters } from '../../../../src/extractor/extractCharacters';
import { extractNews } from '../../../../src/extractor/extractNews';
import { extractSchedule } from '../../../../src/extractor/extractSchedule';
import { extractEpisodes, extractEpisodesFromApi } from '../../../../src/extractor/extractEpisodes';
import { extractCharacterDetail } from '../../../../src/extractor/extractCharacterDetail';
import { extractSuggestions } from '../../../../src/extractor/extractSuggestions';
import { extractTopSearch } from '../../../../src/extractor/extractTopSearch';
import { extractNextEpisodeSchedule } from '../../../../src/extractor/extractNextEpisodeSchedule';
import { mockHtmlData } from '../../data/mocks';

describe('Extractors Comprehensive Suite', () => {
  describe('extractHomepage', () => {
    it('should extract spotlight items', () => {
      const result = extractHomepage(mockHtmlData.homepage);
      expect(result.spotlight).toHaveLength(1);
      expect(result.spotlight[0].title).toBe('Spotlight Anime');
    });

    it('should extract the current Next.js homepage payload', () => {
      const result = extractHomepage(mockHtmlData.nextHomepage);
      expect(result.spotlight).toHaveLength(1);
      expect(result.spotlight[0]).toMatchObject({
        id: 'one-piece-12',
        title: 'One Piece',
        poster: 'https://example.com/one-piece.jpg',
      });
    });
  });

  describe('extractDetailpage', () => {
    it('should extract detail info', () => {
      const result = extractDetailpage(mockHtmlData.detail);
      expect(result.title).toBe('Detail Anime');
      expect(result.is18Plus).toBe(true);
    });

    it('should map the current anime details JSON API', () => {
      const result = extractDetailpageFromApi({
        id: 12,
        slug: 'one-piece-12',
        titles: { english: 'One Piece', romaji: 'One Piece', native: 'ONE PIECE' },
        synopsis: 'A pirate adventure.',
        type: 'TV',
        status: 'RELEASING',
        duration_min: 24,
        episode: { episodes: 1166, sub: 1166, dub: 1130 },
        images: { poster: 'https://example.com/one-piece.jpg' },
        genres: ['Action'],
      });

      expect(result).toMatchObject({
        id: 'one-piece-12',
        title: 'One Piece',
        episodes: { eps: 1166, sub: 1166, dub: 1130 },
      });
    });
  });

  describe('extractListPage', () => {
    it('should extract results from list page', () => {
      const result = extractListPage(mockHtmlData.search);
      expect(result.response).toHaveLength(1);
      expect(result.response[0].title).toBe('Search Result');
    });
  });

  describe('extractCharacters', () => {
    it('should extract characters', () => {
      const result = extractCharacters(mockHtmlData.characters);
      expect(result.response).toHaveLength(1);
      expect(result.response[0].name).toBe('Character Name');
    });
  });

  describe('extractNews', () => {
    it('should extract news items', () => {
      const result = extractNews(mockHtmlData.news);
      expect(result.news).toHaveLength(1);
      expect(result.news[0].title).toBe('News Title');
    });
  });

  describe('extractSchedule', () => {
    it('should extract schedule', () => {
      const result = extractSchedule(mockHtmlData.schedule);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Scheduled Anime');
    });
  });

  describe('extractEpisodes', () => {
    it('should extract episodes', () => {
      const result = extractEpisodes(mockHtmlData.episodes);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Episode 1');
    });

    it('should extract episodes and player URLs from the current anime payload', () => {
      const result = extractEpisodes(mockHtmlData.nextAnime, 'one-piece-12');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        episodeNumber: 1,
        animeId: 12,
        embedId: '2142',
        sub: true,
        dub: true,
        embedUrl: 'https://cdn.4animo.xyz/embed/hd-1/12/1/sub?k=1',
        dubEmbedUrl: 'https://cdn.4animo.xyz/embed/hd-1/12/1/dub?k=1',
      });
    });

    it('should map the current episodes JSON API', () => {
      const result = extractEpisodesFromApi(
        {
          anime_id: 12,
          total: 1,
          sub_count: '1',
          dub_count: '1',
          data: [
            {
              id: 1,
              anime_id: 12,
              number: 1,
              titles: { en: "I'm Luffy!", romaji: 'Ore wa Luffy!' },
              filler: false,
              thumbnail: 'https://example.com/episode-1.jpg',
              sub: true,
              dub: true,
              embed_id: '2142',
            },
          ],
        },
        'one-piece-12'
      );

      expect(result[0].embedUrl).toBe('https://cdn.4animo.xyz/embed/hd-1/12/1/sub?k=1');
    });
  });

  describe('extractCharacterDetail', () => {
    it('should extract character detail', () => {
      const result = extractCharacterDetail(mockHtmlData.characterDetail);
      expect(result.name).toBe('Character Full Name');
    });
  });

  describe('extractSuggestions', () => {
    it('should extract suggestions', () => {
      const result = extractSuggestions(mockHtmlData.suggestions);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('S1');
    });
  });

  describe('extractTopSearch', () => {
    it('should extract top search', () => {
      const result = extractTopSearch(mockHtmlData.topSearch);
      expect(result).toHaveLength(3);
      expect(result[2].title).toBe('Top Title');
    });
  });

  describe('extractNextEpisodeSchedule', () => {
    it('should extract next episode schedule', () => {
      const result = extractNextEpisodeSchedule(mockHtmlData.scheduleNext);
      expect(result).toBe('10:00');
    });
  });
});
