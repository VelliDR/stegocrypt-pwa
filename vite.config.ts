/// <reference types="vitest/config" />
import { defineConfig, Plugin } from 'vite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function pwaAssetsPlugin(): Plugin {
  return {
    name: 'pwa-assets-plugin',
    apply: 'build',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      const swPath = path.join(distDir, 'sw.js');
      if (!fs.existsSync(swPath)) return;

      const assetsDir = path.join(distDir, 'assets');
      const assetFiles: string[] = [];
      if (fs.existsSync(assetsDir)) {
        const files = fs.readdirSync(assetsDir).sort();
        for (const file of files) {
          if (!file.endsWith('.map')) {
            assetFiles.push(`./assets/${file}`);
          }
        }
      }

      const precacheAssets = [
        './',
        './index.html',
        './manifest.json',
        './favicon.ico',
        './icon-192.png',
        './icon-512.png',
        './live-server-guard.js',
        ...assetFiles
      ];

      // Deterministik içerik tabanlı build hash hesapla
      const hasher = crypto.createHash('sha256');
      for (const rel of precacheAssets) {
        if (rel === './') continue;
        const fullPath = path.join(distDir, rel.replace(/^\.\//, ''));
        if (fs.existsSync(fullPath)) {
          hasher.update(rel);
          hasher.update(fs.readFileSync(fullPath));
        }
      }
      const buildHash = hasher.digest('hex').slice(0, 10);

      let swContent = fs.readFileSync(swPath, 'utf-8');
      const precacheStr = JSON.stringify(precacheAssets, null, 2);
      swContent = swContent.replace(
        /const PRECACHE_ASSETS = \[[\s\S]*?\];/,
        `const PRECACHE_ASSETS = ${precacheStr};`
      );
      swContent = swContent.replace(
        /const CACHE_NAME = 'stegocrypt-v[\w.-]*';/,
        `const CACHE_NAME = 'stegocrypt-v3.1-${buildHash}';`
      );

      fs.writeFileSync(swPath, swContent, 'utf-8');
      console.log(`[PWA Plugin] Successfully injected ${precacheAssets.length} precache assets into dist/sw.js (hash: ${buildHash})`);
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [pwaAssetsPlugin()],
  build: {
    target: 'es2022',
    sourcemap: true
  },
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/worker-[name]-[hash].js',
        chunkFileNames: 'assets/worker-[name]-[hash].js',
        assetFileNames: 'assets/worker-[name]-[hash][extname]'
      }
    }
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
});
