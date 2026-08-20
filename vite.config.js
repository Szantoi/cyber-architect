import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules[\\/](?:react|react-dom|react-router|react-router-dom|scheduler)[\\/]/,
              priority: 30,
              minSize: 20_000,
            },
            {
              name: 'markdown-vendor',
              test: /node_modules[\\/](?:react-markdown|remark-[^\\/]+|rehype-[^\\/]+|unified|parse5|hast-util-[^\\/]+|mdast-util-[^\\/]+|micromark(?:-[^\\/]+)?|unist-util-[^\\/]+|vfile(?:-[^\\/]+)?|entities|property-information|space-separated-tokens|comma-separated-tokens|html-void-elements)[\\/]/,
              priority: 20,
              minSize: 20_000,
            },
            {
              name: 'motion-vendor',
              test: /node_modules[\\/](?:framer-motion|motion-dom|motion-utils)[\\/]/,
              priority: 10,
              minSize: 20_000,
            },
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  }
})
