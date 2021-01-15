const PROXY_CONFIG = [
  {
    context: ['/**'],
    target: 'http://localhost:8000',
    secure: false,
    logLevel: 'debug',
    changeOrigin: true,
  },
];

module.exports = PROXY_CONFIG;
