import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

let app: App | null = null
let configured: Firestore | null = null

/** Aceita o JSON da conta de serviço puro ou em base64. */
function credentials(): Record<string, unknown> {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT não configurada')
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')
  const json = JSON.parse(text) as Record<string, unknown>
  if (typeof json.private_key === 'string') json.private_key = json.private_key.replace(/\\n/g, '\n')
  return json
}

function firebase(): App {
  if (app) return app
  app = getApps()[0] ?? initializeApp({ credential: cert(credentials() as never) })
  return app
}

export function adminDb(): Firestore {
  if (configured) return configured
  const db = getFirestore(firebase())
  db.settings({ ignoreUndefinedProperties: true })
  configured = db
  return db
}

export function adminAuth() {
  return getAuth(firebase())
}
