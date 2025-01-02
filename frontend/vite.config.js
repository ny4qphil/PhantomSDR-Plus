import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import legacy from '@vitejs/plugin-legacy'
import { visualizer } from 'rollup-plugin-visualizer'
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    wasm(),
    svelte(),
    topLevelAwait(),
    legacy({
      targets: ['ie >= 11'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime']
    })
  ],
  server: {
    proxy: {
      '/audio': {
        target: 'http://localhost:9002',
        ws: true
      },
      '/waterfall': {
        target: 'http://localhost:9002',
        ws: true
      },
      '/events': {
        target: 'http://localhost:9002',
        ws: true
      },
      '/signal': {
        target: 'http://localhost:9002',
        ws: true
      }
    }
  },
  define: {
    __filename: JSON.stringify('')
  },
  build: {
    minify: true,
    rollupOptions: {
      output: {
      },
      plugins: [visualizer()]
    }
  }
})
