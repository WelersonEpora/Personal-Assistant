import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// Backend roda em outra porta em dev (npm run dev, fora do Docker) - mesmo
// principio de mesma origem sem CORS já usado no AgroMind.
export default defineConfig({
  plugins: [
    vue(),
    // docs/adr/0003-frontend-unico-pwa.md: só precache do app shell (JS/CSS/
    // HTML) - nunca das respostas de API. Os dados offline vivem no
    // IndexedDB (src/offline/db.js), não no cache do Service Worker.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // ECharts (~200KB gzip) só é usado na tela de Avaliações Físicas →
        // Comparar (admin, online). Fica fora do precache do shell - carrega
        // sob demanda na 1ª visita e o próprio navegador cacheia depois.
        globIgnores: ['**/vendor-echarts-*.js'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024
      },
      manifest: {
        name: 'Personal Assistant',
        short_name: 'Personal Assistant',
        description: 'Captura de treinos e avaliações para Personal Trainers.',
        start_url: '/captura',
        scope: '/',
        display: 'standalone',
        background_color: '#f4f5f9',
        theme_color: '#4f46e5',
        icons: [
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' }
        ]
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        // ECharts (+ zrender + vue-echarts) num chunk próprio: só é baixado
        // quando o usuário abre a tela de Avaliações Físicas → Comparar, e aí
        // fica em cache, em vez de inflar o chunk daquela view. Não entra em
        // nenhum outro caminho do app (nem no PWA de captura offline).
        manualChunks(id) {
          if (/node_modules\/(echarts|zrender|vue-echarts)\//.test(id)) {
            return 'vendor-echarts'
          }
        }
      }
    }
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/health': 'http://localhost:3000'
    }
  }
})
