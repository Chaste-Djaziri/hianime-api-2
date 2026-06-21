const config = {
  baseurl: 'https://4animo.xyz',
  baseurl2: 'https://4animo.xyz',
  dataApiBaseurl: 'https://api.kryzox.xyz',
  playerBaseurl: 'https://cdn.4animo.xyz',
  origin: '*',
  port: Number(process.env.PORT) || 5001,

  headers: {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:122.0) Gecko/20100101 Firefox/122.0',
  },

  logLevel: 'INFO',
  enableLogging: false,
  isProduction: true,
  isDevelopment: false,
  isVercel: false,
};

export default config;
