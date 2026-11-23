import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

const PRODUCTION_CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self' https://huggingface.co https://cdn-lfs.huggingface.co https://cdn-lfs-us-1.huggingface.co https://cas-bridge.xethub.hf.co https://raw.githubusercontent.com https://tessdata.projectnaptha.com; object-src 'none'; base-uri 'self'; form-action 'self';";

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'strict-production-csp',
        apply: 'build' as const,
        transformIndexHtml(html: string): string {
          return html.replace(
            /<meta\s+http-equiv="Content-Security-Policy"\s+content="[^"]*"\s*\/>/i,
            `<meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />`,
          );
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
          'pdf.worker.min.mjs',
          'tesseract/worker.min.js',
          'tesseract/tesseract-core-simd-lstm.wasm.js',
          'tesseract/tesseract-core-simd-lstm.wasm',
          'tesseract/tesseract-core-lstm.wasm.js',
          'tesseract/tesseract-core-lstm.wasm',
        ],
        manifest: {
          id: '/',
          name: 'Veil — On-Device Private AI',
          short_name: 'Veil',
          description:
            'Privacy-first, on-device AI workspace with an encrypted Private Journal and Smart Document Scanner.',
          theme_color: '#15191E',
          background_color: '#15191E',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 35 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,mjs,wasm}'],
          globIgnores: ['**/opencv/**'],
          runtimeCaching: [
            {
              urlPattern: /\/opencv\/opencv\.js$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'veil-opencv-cache',
                expiration: {
                  maxEntries: 2,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/(huggingface\.co|cdn-lfs\.huggingface\.co|cdn-lfs-us-1\.huggingface\.co|cas-bridge\.xethub\.hf\.co|raw\.githubusercontent\.com|tessdata\.projectnaptha\.com)\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'veil-models-v1',
                expiration: {
                  maxEntries: 64,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build' as const,
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(import.meta.dirname, 'dist');
          const srcAssets = path.resolve(import.meta.dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    worker: {
      format: 'es' as const,
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
