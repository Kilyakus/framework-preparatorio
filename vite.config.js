import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const webRoot = fileURLToPath(new URL('./src/web/', import.meta.url));
export default defineConfig({
  root: webRoot,
  publicDir: false,
  server: { host:'0.0.0.0', allowedHosts:true, fs:{ allow:[projectRoot] } },
  preview: { host:'0.0.0.0', allowedHosts:true },
  build: { outDir: fileURLToPath(new URL('./dist/', import.meta.url)), emptyOutDir:true },
});
