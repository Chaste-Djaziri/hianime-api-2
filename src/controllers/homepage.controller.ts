import { axiosInstance } from '../services/axiosInstance.js';
import { validationError } from '../utils/errors.js';
import { extractHomepage } from '../extractor/extractHomepage.js';
import { HomePage } from '../types/anime.js';

const homepageController = async (): Promise<HomePage> => {
  console.log('Fetching homepage data from external API...');
  const result = await axiosInstance('/home');

  if (!result.success || !result.data) {
    console.error('Homepage fetch failed:', result.message);
    throw new validationError(result.message || 'Failed to fetch homepage');
  }

  return extractHomepage(result.data);
};

export default homepageController;
