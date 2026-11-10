export const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.readonly']

export class GoogleError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** `invalid_grant` = o acesso foi revogado ou expirou; é preciso conectar de novo. */
    readonly code: string = '',
  ) {
    super(message)
  }
}

export interface OAuthClient {
  clientId: string
  clientSecret: string
}

export function buildAuthUrl(p: { clientId: string; redirectUri: string; state: string }): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: p.state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`
}

async function tokenRequest(body: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(15_000),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new GoogleError(String(data.error_description ?? data.error ?? `HTTP ${res.status}`), res.status, String(data.error ?? ''))
  }
  return data
}

export async function exchangeCode(c: OAuthClient & { code: string; redirectUri: string }) {
  const d = await tokenRequest({
    code: c.code,
    client_id: c.clientId,
    client_secret: c.clientSecret,
    redirect_uri: c.redirectUri,
    grant_type: 'authorization_code',
  })
  return {
    refreshToken: typeof d.refresh_token === 'string' ? d.refresh_token : null,
    accessToken: String(d.access_token ?? ''),
    email: emailFromIdToken(typeof d.id_token === 'string' ? d.id_token : ''),
  }
}

export async function refreshAccessToken(c: OAuthClient & { refreshToken: string }): Promise<string> {
  const d = await tokenRequest({
    refresh_token: c.refreshToken,
    client_id: c.clientId,
    client_secret: c.clientSecret,
    grant_type: 'refresh_token',
  })
  return String(d.access_token ?? '')
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined)
}

/** O id_token vem direto do Google por TLS, então basta ler o e-mail do corpo. */
export function emailFromIdToken(idToken: string): string {
  try {
    const body = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as { email?: string }
    return typeof body.email === 'string' ? body.email : ''
  } catch {
    return ''
  }
}

async function gmail<T>(token: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/${path}?${new URLSearchParams(params)}`
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; status?: string } }
    throw new GoogleError(data.error?.message ?? `Gmail HTTP ${res.status}`, res.status, data.error?.status ?? '')
  }
  return (await res.json()) as T
}

/** IDs das mensagens que batem com a busca, da mais nova para a mais antiga. */
export async function listMessageIds(token: string, q: string, max: number): Promise<string[]> {
  const ids: string[] = []
  let pageToken = ''
  while (ids.length < max) {
    const params: Record<string, string> = { q, maxResults: String(Math.min(100, max - ids.length)) }
    if (pageToken) params.pageToken = pageToken
    const page = await gmail<{ messages?: { id: string }[]; nextPageToken?: string }>(token, 'messages', params)
    for (const m of page.messages ?? []) ids.push(m.id)
    if (!page.nextPageToken) break
    pageToken = page.nextPageToken
  }
  return ids
}

export function getMessage<T>(token: string, id: string): Promise<T> {
  return gmail<T>(token, `messages/${id}`, { format: 'full' })
}

/** Anexo em base64 padrão (a API entrega base64url). */
export async function getAttachmentBase64(token: string, messageId: string, attachmentId: string): Promise<string> {
  const a = await gmail<{ data?: string }>(token, `messages/${messageId}/attachments/${attachmentId}`)
  return Buffer.from(a.data ?? '', 'base64url').toString('base64')
}
