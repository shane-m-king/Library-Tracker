import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // In dev, forward any /api/* request to the Express server on :4000. This
    // makes the React app and the API look like ONE origin to the browser, so the
    // httpOnly auth cookie is sent and received with no CORS friction - the app
    // fetches relative URLs like `/api/auth/me`. In production both would sit
    // behind a single origin (or use the real CORS config we set on the server),
    // so this proxy is purely a dev-time convenience.
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
