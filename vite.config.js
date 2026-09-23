import { defineConfig } from 'vite';

export default defineConfig({
  // Caminhos relativos: o build funciona em qualquer subpasta/host.
  base: './',
  build: {
    rollupOptions: {
      output: {
        // Nomes estáveis facilitam republicar no mesmo endereço.
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/app.[ext]',
      },
    },
  },
});
