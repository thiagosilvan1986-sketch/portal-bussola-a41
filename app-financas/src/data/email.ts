import { sendEmailVerification, type User } from 'firebase/auth'

/**
 * Aviso por e-mail: o servidor só manda ao e-mail do login depois de confirmado. Este arquivo cuida da confirmação
 * (pelo Firebase) e do botão "Enviar e-mail de teste".
 */

const FUNCTIONS = '/.netlify/functions'

export class EmailError extends Error {}

/** Manda o link de confirmação para o e-mail do login. */
export async function sendVerificationEmail(user: User): Promise<void> {
  try {
    await sendEmailVerification(user)
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === 'auth/too-many-requests') throw new EmailError('Muitos pedidos seguidos. Aguarde alguns minutos e tente de novo.')
    if (code === 'auth/network-request-failed') throw new EmailError('Sem conexão com a internet. Verifique e tente de novo.')
    throw new EmailError('Não foi possível enviar o e-mail de confirmação. Tente de novo em instantes.')
  }
}

/** Pergunta de novo ao Firebase se o e-mail já foi confirmado (depois de a pessoa abrir o link). */
export async function checkEmailVerified(user: User): Promise<boolean> {
  try {
    await user.reload()
  } catch {
    throw new EmailError('Sem conexão com a internet. Verifique e tente de novo.')
  }
  return user.emailVerified
}

/** Manda um e-mail de teste ao e-mail do login. */
export async function sendTestEmail(idToken: string, fetcher: typeof fetch = fetch): Promise<void> {
  let res: Response
  try {
    res = await fetcher(`${FUNCTIONS}/send-test-email`, { method: 'POST', headers: { authorization: `Bearer ${idToken}` } })
  } catch {
    throw new EmailError('Sem conexão com o servidor de avisos. Verifique a internet e tente de novo.')
  }
  if (res.ok) return
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  throw new EmailError(body.error ?? 'Não foi possível enviar o e-mail de teste.')
}
