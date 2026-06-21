import { Hono, Context } from 'hono';
import { cors } from 'hono/cors';
import hiAnimeRoutes from './routes/routes.js';
import { AppError } from './utils/errors.js';
import { fail } from './utils/response.js';
import { logger } from 'hono/logger';
import config from './config/config.js';
import { watchRelayRoute } from './watchRelay.js';

const app = new Hono();
const origins = config.origin.includes(',')
  ? config.origin.split(',').map(o => o.trim())
  : config.origin === '*'
    ? '*'
    : [config.origin];

app.use('*', async (c, next) => {
  if (new URL(c.req.url).pathname === '/internal/watch-relay') {
    await next();
    return;
  }
  return cors({
    origin: origins,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposeHeaders: ['Content-Length', 'X-Request-Id'],
    maxAge: 600,
    credentials: true,
  })(c, next);
});

if (!config.isProduction || config.enableLogging) {
  app.use('/api/v2/*', logger());
}

app.get('/ping', (c: Context) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.isVercel ? 'vercel' : 'self-hosted',
  });
});

app.get('/favicon.ico', (c: Context) => {
  return c.body(null, 204);
});

app.post('/internal/watch-relay', watchRelayRoute);

app.route('/api/v2', hiAnimeRoutes);
app.onError((err, c) => {
  if (err instanceof AppError) {
    return fail(c, err.message, err.statusCode, err.details);
  }

  console.error('Unexpected Error:', err.message);
  if (!config.isProduction) {
    console.error('Stack:', err.stack);
  }

  return fail(c, 'Internal server error', 500);
});

app.notFound((c: Context) => {
  return fail(c, 'Route not found', 404);
});

export default app;
