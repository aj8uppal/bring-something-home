import { defineConfig } from 'vite';
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.SERVER_PORT || 8790}`,
        changeOrigin: false,
      },
      '/socket': {
        target: `ws://127.0.0.1:${process.env.SERVER_PORT || 8790}`,
        ws: true,
        changeOrigin: false,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: { manualChunks: (id: string) => (id.includes('/three/') ? 'three' : undefined) },
    },
  },
});
