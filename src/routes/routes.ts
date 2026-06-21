import { Hono } from 'hono';
import handler from '../utils/handler.js';

import homepageController from '../controllers/homepage.controller.js';
import detailpageController from '../controllers/detailpage.controller.js';
import listpageController from '../controllers/listpage.controller.js';
import searchController from '../controllers/search.controller.js';
import suggestionController from '../controllers/suggestion.controller.js';
import charactersController from '../controllers/characters.controller.js';
import characterDetailConroller from '../controllers/characterDetail.controller.js';
import episodesController from '../controllers/episodes.controller.js';
import allGenresController from '../controllers/allGenres.controller.js';
import nextEpisodeScheduleController from '../controllers/nextEpisodeSchedule.controller.js';
import filterController from '../controllers/filter.controller.js';
import filterOptions from '../utils/filter.js';
import newsController from '../controllers/news.controller.js';
import randomController from '../controllers/random.controller.js';
import schedulesController from '../controllers/schedules.controller.js';
import topSearchController from '../controllers/topSearch.controller.js';
import playerController from '../controllers/player.controller.js';

const router = new Hono();

router.get('/home', handler(homepageController));
router.get('/top-search', handler(topSearchController));
router.get('/schedules', handler(schedulesController));
router.get('/schedule/next/:id', handler(nextEpisodeScheduleController));
router.get('/anime/:id', handler(detailpageController));
router.get('/animes/:query/:category?', handler(listpageController));
router.get('/search', handler(searchController));
router.get(
  '/filter/options',
  handler(async () => filterOptions)
);
router.get('/filter', handler(filterController));
router.get('/suggestion', handler(suggestionController));
router.get('/characters/:id', handler(charactersController));
router.get('/character/:id', handler(characterDetailConroller));
router.get('/episodes/:id', handler(episodesController));
router.get('/player/:id/:episode', handler(playerController));
router.get('/genres', handler(allGenresController));
router.get('/news', handler(newsController));
router.get('/random', handler(randomController));

export default router;
