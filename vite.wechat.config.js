import { defineConfig } from 'vite';
import { resolve } from 'path';

// 微信小游戏构建: 输出目录结构与小程序要求一致
export default defineConfig({
  build: {
    outDir: 'dist-wechat',
    rollupOptions: {
      input: resolve(__dirname, 'game.js'),
      output: {
        entryFileNames: 'game.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
        format: 'es',
      },
    },
    sourcemap: false,
    minify: true,
    target: 'es2015',
  },
});
