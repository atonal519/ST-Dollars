import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': path.resolve(root, 'src') } },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'esnext',
    commonjsOptions: { include: [/node_modules/, /src\/vendor\/cytoscape\.min\.cjs$/] },
    rollupOptions: {
      input: path.resolve(root, 'src/index.ts'),
      output: { format: 'es', entryFileNames: '[name].js', assetFileNames: '[name].[ext]' },
    },
  },
});
