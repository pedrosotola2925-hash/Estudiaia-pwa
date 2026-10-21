import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist-pwa',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@services': path.resolve(__dirname, 'src/services'),
      '@ui': path.resolve(__dirname, 'src/ui'),
    },
  },
  server: {
    port: 5173,
    https: {
      key: path.resolve(__dirname, 'certs/localhost.key'),
      cert: path.resolve(__dirname, 'certs/localhost.crt'),
    },
    strictPort: true,
  },
  preview: {
    port: 4173,
    https: {
      key: path.resolve(__dirname, 'certs/localhost.key'),
      cert: path.resolve(__dirname, 'certs/localhost.crt'),
    },
  },
  plugins: [
    VitePWA({
      injectRegister: false,
      base: '/',
      includeAssets: ['favicon.ico', 'robots.txt'],
      manifest: {
        name: 'EstudiaIA 2',
        short_name: 'EstudiaIA',
        description: 'Tutor educativo con voz mexicana y herramientas de estudio',
        start_url: '/',
        display: 'standalone',
        background_color: '#f1f5f9',
        theme_color: '#3b82f6',
        orientation: 'portrait-primary',
        scope: '/',
        lang: 'es',
        icons: [
          {
            src: '/icon-72.png',
            sizes: '72x72',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icon-96.png',
            sizes: '96x96',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icon-128.png',
            sizes: '128x128',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icon-144.png',
            sizes: '144x144',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icon-152.png',
            sizes: '152x152',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icon-384.png',
            sizes: '384x384',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Nueva práctica',
            short_name: 'Práctica',
            description: 'Crear una nueva práctica de preguntas',
            url: '/#practicas',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Mis materias',
            short_name: 'Materias',
            description: 'Ver y gestionar mis materias',
            url: '/#materias',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Progreso',
            short_name: 'Progreso',
            description: 'Ver mi progreso de aprendizaje',
            url: '/#progreso',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }],
          },
        ],
        categories: ['education', 'productivity'],
        screenshots: [],
      },
      strategies: 'injectManifest',
      injectManifest: {
        swSrc: path.resolve(__dirname, 'public/sw.js'),
        globPatterns: ['**/*.{js,css,html,json,png,svg,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: {
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html',
      },
    }),
  ],
});