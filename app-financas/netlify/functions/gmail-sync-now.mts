import { authedUid, errorResponse, json } from '../lib/http'
import { NotConnectedError, syncUser } from '../lib/sync'

/** Botão "Verificar agora": lê os e-mails novos da pessoa que chamou (até ~45 s). */
export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  try {
    const uid = await authedUid(req)
    const result = await syncUser(uid, Date.now() + 45_000)
    return json(result)
  } catch (e) {
    if (e instanceof NotConnectedError) return json({ error: 'Conecte o Gmail primeiro.' }, 409)
    return errorResponse(e)
  }
}
