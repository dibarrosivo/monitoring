import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.monitoring.clientes',
  appName: 'Mi Alarma',
  webDir: 'dist',
  server: {
    // Permite hablar con el servidor por http mientras no haya VPS con TLS
    cleartext: true,
  },
};

export default config;
