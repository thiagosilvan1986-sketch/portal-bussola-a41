import { adminDb } from '../lib/admin'
import { revokeToken } from '../lib/google'
import { authedUid, errorResponse, json } from '../lib/http'

/** Desconecta: revoga o acesso no Google e apaga o token guardado. */
export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  try {
    const uid = await authedUid(req)
    const db = adminDb()
    const ref = db.doc(`integrations/${uid}`)
    const token = (await ref.get()).get('refreshToken') as string | undefined
    if (token) await revokeToken(token)
    await ref.delete()
    await db.doc(`users/${uid}/settings/gmail`).set(
      { connected: false, needsReconnect: false, lastError: null, pending: 0 },
      { merge: true },
    )
    return json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
