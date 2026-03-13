import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { renameSync, existsSync } from 'fs';
import { resolve } from 'path';

/** Rename the output index.html → ui.html after build */
function renameOutput(): Plugin {
  return {
    name: 'rename-to-ui-html',
    closeBundle() {
      const outDir = resolve(__dirname, '../dist');
      const src = resolve(outDir, 'index.html');
      const dest = resolve(outDir, 'ui.html');
      if (existsSync(src)) {
        renameSync(src, dest);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), viteSingleFile(), renameOutput()],
  build: {
    outDir: '../dist',
    emptyOutDir: false,
    target: 'es2020',
    rollupOptions: {
      input: 'index.html',
    },
  },
});
