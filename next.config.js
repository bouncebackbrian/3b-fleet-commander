const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
    disableDevLogs: true,
    // Cache strategies
    runtimeCaching: [
      // Open-Meteo weather API — network first, 5-min cache
      {
        urlPattern: /^https:\/\/api\.open-meteo\.com\/.*/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'weather-cache',
          expiration: { maxEntries: 10, maxAgeSeconds: 300 },
        },
      },
      // Nominatim geocoding — cache first, 1 hour
      {
        urlPattern: /^https:\/\/nominatim\.openstreetmap\.org\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'geocode-cache',
          expiration: { maxEntries: 50, maxAgeSeconds: 3600 },
        },
      },
      // OSRM routing — cache first, 2 hours
      {
        urlPattern: /^https:\/\/router\.project-osrm\.org\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'route-cache',
          expiration: { maxEntries: 20, maxAgeSeconds: 7200 },
        },
      },
      // App API routes — network first, fallback to cache
      {
        urlPattern: /^\/api\/.*/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'api-cache',
          expiration: { maxEntries: 50, maxAgeSeconds: 60 },
        },
      },
    ],
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {}

module.exports = withPWA(nextConfig)
