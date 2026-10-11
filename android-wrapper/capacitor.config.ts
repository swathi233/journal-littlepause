import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.littlepause.journal',
  appName: 'Little Pause',
  webDir: 'www',
  // After deploying your FastAPI app, replace this URL with your Railway HTTPS domain.
  // Example: https://your-app.up.railway.app
  server: {
    url: 'https://REPLACE-WITH-YOUR-RAILWAY-DOMAIN',
    cleartext: false
  }
};

export default config;
