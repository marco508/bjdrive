import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Config Vite + PWA. L'appli est une base web installable (PWA),
// pensée pour être portée en React Native plus tard (logique métier isolée dans src/services).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Zémi Market',
        short_name: 'Zémi',
        description: 'Commandez dans votre supermarché au Bénin et faites-vous livrer à domicile.',
        theme_color: '#0a7d3c',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  server: { host: true, port: 5173 }
})
