import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: Number(process.env.IT_PORT ?? 5173),
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'index.html',
    },
  },
});
