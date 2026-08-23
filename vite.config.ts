import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import { defineConfig } from 'vite';

const relSt = path.relative(
  path.join(__dirname, 'dist'),
  __dirname.substring(0, __dirname.lastIndexOf('public') + 'public'.length),
);
const globals: Record<string, string> = { jquery: '$', lodash: '_', toastr: 'toastr' };

export default defineConfig(({ mode }) => ({
  plugins: [
    vue(),
    {
      name: 'sillytavern-resolver',
      enforce: 'pre',
      resolveId(id) {
        if (id.startsWith('@sillytavern/'))
          return { id: path.join(relSt, id.replace('@sillytavern/', '')).replaceAll('\\', '/') + '.js', external: true };
        if (id in globals) return { id, external: true };
      },
    },
  ],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: {
    rollupOptions: { input: 'src/index.ts', output: { format: 'es', entryFileNames: '[name].js', chunkFileNames: '[name].[hash].chunk.js', assetFileNames: '[name].[ext]', globals }, external: id => id in globals },
    outDir: 'dist', emptyOutDir: false, sourcemap: mode === 'production' ? true : 'inline', minify: mode === 'production', target: 'esnext',
  },
}));
