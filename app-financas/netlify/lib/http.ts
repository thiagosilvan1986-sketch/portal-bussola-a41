import { adminAuth } from './admin'

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

/** Uid de quem chamou, a partir do token do Firebase no cabeçalho Authorization. */
export async function authedUid(req: Request): Promise<string> {
  const m = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')
  if (!m) throw new HttpError('Faça login de novo.', 401)
  try {
    return (await adminAuth().verifyIdToken(m[1])).uid
  } catch {
    throw new HttpError('Sessão inválida. Entre de novo.', 401)
  }
}

export function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new HttpError(`Falta configurar ${name} no Netlify.`, 500)
  return v
}

export function appOrigin(req: Request): string {
  return (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, '')
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: e.message }, e.status)
  console.error(e)
  return json({ error: 'Erro inesperado no servidor.' }, 500)
}
