import { createHmac, timingSafeEqual } from 'node:crypto'

const TEN_MINUTES = 10 * 60 * 1000

/** Assina o "state" do OAuth: guarda quem iniciou a conexão e vence em 10 minutos. */
export function signState(uid: string, secret: string, now: number = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ uid, exp: now + TEN_MINUTES })).toString('base64url')
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

/** Devolve o uid se o "state" é autêntico e não venceu; senão, null. */
export function verifyState(state: string, secret: string, now: number = Date.now()): string | null {
  const [payload, sig, extra] = state.split('.')
  if (!payload || !sig || extra !== undefined) return null
  const expected = createHmac('sha256', secret).update(payload).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { uid?: unknown; exp?: unknown }
    if (typeof data.uid !== 'string' || typeof data.exp !== 'number' || data.exp < now) return null
    return data.uid
  } catch {
    return null
  }
}
