import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.obostores.customer',
  appName: 'OBO Stores',
  webDir: 'dist',
  android: {
    path: '../android',
  },
  plugins: {
    FirebaseMessaging: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
