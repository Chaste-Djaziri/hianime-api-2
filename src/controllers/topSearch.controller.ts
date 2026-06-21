import { Context } from 'hono';
import { axiosInstance } from '../services/axiosInstance.js';
import { validationError } from '../utils/errors.js';
import { extractTopSearch, TopSearchAnime } from '../extractor/extractTopSearch.js';

const topSearchController = async (_c: Context): Promise<TopSearchAnime[]> => {
  console.log('Fetching top search data from external API...');
  const result = await axiosInstance('/');

  if (!result.success || !result.data) {
    console.error('Top search fetch failed:', result.message);
    throw new validationError(result.message || 'Failed to fetch top search');
  }

  return extractTopSearch(result.data);
};

export default topSearchController;
