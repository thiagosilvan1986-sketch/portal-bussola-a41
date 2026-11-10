import { adminDb } from '../lib/admin'
import { exchangeCode } from '../lib/google'
import { appOrigin, env } from '../lib/http'
import { verifyState } from '../lib/state'

/** Passo 2: o Google devolve o usuário para cá com um código; trocamos por um acesso de longa duração. */
export default async (req: Request): Promise<Response> => {
  const origin = appOrigin(req)
  const back = (status: string, motivo = '') =>
    Response.redirect(`${origin}/ajustes?gmail=${status}${motivo ? `&motivo=${encodeURIComponent(motivo)}` : ''}`, 302)

  const url = new URL(req.url)
  if (url.searchParams.get('error')) return back('erro', 'Você não autorizou o acesso ao Gmail.')

  try {
    const uid = verifyState(url.searchParams.get('state') ?? '', env('OAUTH_STATE_SECRET'))
    const code = url.searchParams.get('code')
    if (!uid || !code) return back('erro', 'O pedido de conexão expirou. Tente de novo.')

    const tokens = await exchangeCode({
      code,
      clientId: env('GOOGLE_CLIENT_ID'),
      clientSecret: env('GOOGLE_CLIENT_SECRET'),
      redirectUri: `${origin}/.netlify/functions/gmail-callback`,
    })
    if (!tokens.refreshToken) {
      return back('erro', 'O Google não liberou o acesso permanente. Remova o app em myaccount.google.com/connections e conecte de novo.')
    }

    const db = adminDb()
    // O acesso fica numa coleção que as regras do Firestore fecham para o navegador.
    await db.doc(`integrations/${uid}`).set({
      refreshToken: tokens.refreshToken,
      email: tokens.email,
      connectedAt: new Date().toISOString(),
    })
    await db.doc(`users/${uid}/settings/gmail`).set(
      { connected: true, needsReconnect: false, email: tokens.email, connectedAt: new Date().toISOString(), lastError: null, pending: 0 },
      { merge: true },
    )
    return back('ok')
  } catch (e) {
    console.error(e)
    return back('erro', 'Não foi possível concluir a conexão. Confira as chaves do Google no Netlify.')
  }
}
