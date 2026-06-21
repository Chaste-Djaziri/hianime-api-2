import { Context } from 'hono';
import { extractNextEpisodeSchedule } from '../extractor/extractNextEpisodeSchedule.js';
import { axiosInstance } from '../services/axiosInstance.js';
import { validationError } from '../utils/errors.js';

const nextEpisodeSchaduleController = async (c: Context): Promise<unknown> => {
  const id = c.req.param('id');

  if (!id) throw new validationError('id is required');

  const data = await axiosInstance('/watch/' + id);

  if (!data.success || !data.data)
    throw new validationError(data.message || 'make sure id is correct');

  const response = extractNextEpisodeSchedule(data.data);

  return response;
};

export default nextEpisodeSchaduleController;
