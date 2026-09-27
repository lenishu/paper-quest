import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: {
    // `root` is `client`, so this resolves to the directory Netlify publishes.
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          katex: ['katex', 'rehype-katex', 'remark-math'],
          markdown: ['react-markdown', 'remark-gfm'],
          'force-graph': ['3d-force-graph']
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
});
