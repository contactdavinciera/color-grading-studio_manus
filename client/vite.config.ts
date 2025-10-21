import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    watch: {
      ignored: ["**/node_modules/**"],
      usePolling: true,
      interval: 1000, // Aumentar o intervalo de polling
    },
  },
});
