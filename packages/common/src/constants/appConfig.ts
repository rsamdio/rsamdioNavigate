import { FirebaseConfig, R2Config } from '../types/demo';

/**
 * Static NAVIGATE Production Configuration
 * Public client-side parameters for Rotaract South Asia MDIO
 */
export const APP_FIREBASE_CONFIG: FirebaseConfig = {
  apiKey: 'AIzaSyBsFT-cXWv7Sk1FDBHVtQt7C5Ip2-o3kPo',
  authDomain: 'rsanavigate.firebaseapp.com',
  projectId: 'rsanavigate',
  storageBucket: 'rsanavigate.firebasestorage.app',
  messagingSenderId: '35916318000',
  appId: '1:35916318000:web:23f17167f017147150b4f5'
};

export const APP_R2_CONFIG: Pick<R2Config, 'publicUrl' | 'bucketName'> = {
  publicUrl: 'https://nav.rsamdio.org',
  bucketName: 'navigate'
};

export const APP_PRODUCTION_URL = 'https://navigate.rsamdio.org';
export const APP_R2_PUBLIC_URL = 'https://nav.rsamdio.org';

export const APP_GA_MEASUREMENT_ID = 'G-QZDYH5YMXH';

export const APP_INDEXNOW_CONFIG = {
  key: 'e4b54e7e62a343df89961d1ea009e530',
  host: 'navigate.rsamdio.org',
  keyLocation: 'https://navigate.rsamdio.org/e4b54e7e62a343df89961d1ea009e530.txt'
};
