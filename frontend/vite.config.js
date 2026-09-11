import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * RailMind AI — Vite Configuration
 * Dev server runs on :5173, proxies /api → FastAPI backend on :8000
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // All /api/* requests forwarded to FastAPI backend
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  // Expose the backend API URL to the React app (optional override)
  define: {
    __APP_VERSION__: JSON.stringify('2.5.0'),
  },
});
