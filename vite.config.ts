import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative paths so the build works when served from any subpath (Hugging Face / Railway / GitHub Pages)
  server: {
    host: true, // expose on LAN so it can be tested from a phone via ngrok/local network during dev
    port: 5173
  },
  build: {
    target: 'es2020',
    sourcemap: true
  }
});
