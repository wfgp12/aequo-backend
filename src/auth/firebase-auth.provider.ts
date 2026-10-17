import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export const FIREBASE_AUTH = Symbol('FIREBASE_AUTH');

export const firebaseAuthProvider: Provider = {
  provide: FIREBASE_AUTH,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const app =
      getApps()[0] ??
      initializeApp({
        credential: cert({
          projectId: config.getOrThrow<string>('FIREBASE_PROJECT_ID'),
          clientEmail: config.getOrThrow<string>('FIREBASE_CLIENT_EMAIL'),
          // En Render y en .env la clave llega con los saltos de línea escritos como "\n" literales.
          privateKey: config
            .getOrThrow<string>('FIREBASE_PRIVATE_KEY')
            .replace(/\\n/g, '\n'),
        }),
      });
    return getAuth(app);
  },
};
