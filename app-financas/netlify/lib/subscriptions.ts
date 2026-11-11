import type { PushSub } from './alerts-run'

/**
 * Só endereços de serviços de notificação conhecidos (Google/Chrome/Edge no Android, Firefox, Apple, Windows).
 * O endereço vem do aparelho da pessoa; sem esta checagem, alguém logado poderia fazer o servidor chamar qualquer site.
 */
const PUSH_HOST_SUFFIXES = ['googleapis.com', 'mozilla.com', 'push.apple.com', 'windows.com', 'microsoft.com']

export function isPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 2000) return false
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '') return false
  const host = url.hostname.toLowerCase()
  return PUSH_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
}

/** Documento gravado pelo app (users/{uid}/pushSubscriptions/{id}) em inscrição válida, ou null se estiver incompleto ou suspeito. */
export function parseSubscription(id: string, data: Record<string, unknown> | undefined): PushSub | null {
  const keys = data?.keys as Record<string, unknown> | undefined
  if (!data || !isPushEndpoint(data.endpoint) || typeof keys?.p256dh !== 'string' || typeof keys.auth !== 'string') return null
  if (!keys.p256dh || !keys.auth) return null
  return { id, endpoint: data.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }
}
