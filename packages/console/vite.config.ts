import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';

const version = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  /*
   * __CANAL_DIRECTO__ separa los dos destinos de la app y existe por la
   * política de Google Play (Device and Network Abuse): una app distribuida
   * por la tienda no puede actualizarse bajando un APK por fuera. El build
   * normal es el que va a Play y no lleva el aviso de versión nueva; el de
   * `build:directo` es el APK que se instala a mano desde el servidor de la
   * central y sí lo lleva.
   */
  define: {
    __VERSION_APP__: JSON.stringify(version),
    __CANAL_DIRECTO__: JSON.stringify(process.env.CANAL_DIRECTO === '1'),
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
});
