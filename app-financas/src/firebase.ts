import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

const env = import.meta.env

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
}

/** Falso até as variáveis VITE_FIREBASE_* serem configuradas (.env local ou painel do Netlify). */
export const isFirebaseConfigured = Boolean(
  config.apiKey && config.authDomain && config.projectId && config.appId,
)

const app = isFirebaseConfigured ? initializeApp(config) : null

export const auth = app ? getAuth(app) : null
// E-mails do Firebase (redefinição de senha) saem em português.
if (auth) auth.languageCode = 'pt-BR'

// Cache local persistente: o app abre e mostra os dados mesmo sem internet.
export const db = app
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  : null
