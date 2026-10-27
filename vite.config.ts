import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    // The router plugin generates src/routeTree.gen.ts from src/routes, so it must run
    // before the React transform sees the route files.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  // Mirrors the `@/*` path in tsconfig.app.json; without it the type checker resolves
  // imports the bundler cannot.
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    // The watch floor runs on modest workstations and the wall renderer on a controller PC,
    // so the bundle budget is enforced rather than aspirational.
    chunkSizeWarningLimit: 450,
    sourcemap: true,
    rollupOptions: {
      output: {
        // Vendor code changes far less often than screens; separate chunks keep it cached
        // across deployments.
        manualChunks: {
          react: ['react', 'react-dom'],
          tanstack: ['@tanstack/react-router', '@tanstack/react-query'],
          realtime: ['@microsoft/signalr'],
          auth: ['oidc-client-ts'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    css: false,
  },
})
