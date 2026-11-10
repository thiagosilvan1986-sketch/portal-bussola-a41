import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Contas em Dia',
        short_name: 'Contas',
        description: 'Controle das contas a pagar todo mês.',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // /__/ é o caminho reservado do Firebase Auth; o service worker não pode interceptá-lo
      workbox: { navigateFallback: '/index.html', navigateFallbackDenylist: [/^\/__\//] },
    }),
  ],
  test: { include: ['src/**/*.test.{ts,tsx}'] },
})
