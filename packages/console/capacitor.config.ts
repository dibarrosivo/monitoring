import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.falconseguridadtotal.alarma',
  appName: 'Falcon Alarma',
  webDir: 'dist',
  android: {
    // La app habla solo con el servidor de la central, por TLS
    allowMixedContent: false,
  },
};

export default config;
