import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the same build runs inside the Android app and from any web path.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173 },
});
