import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nakamuratwins.studio',
  appName: 'Nakamura Twins Studio',
  webDir: 'dist',
  android: {
    backgroundColor: '#0e0c14',
  },
  plugins: {
    Media: { androidGalleryMode: false },
  },
};

export default config;
