import { deviceLabel } from '../domain/devices'

/**
 * Notificação com o app fechado (Web Push). Este arquivo cuida do aparelho: pedir permissão, inscrever e cancelar.
 * Quem manda a notificação é o servidor (netlify/functions); as chaves dele chegam por `fetchPushConfig`.
 */

const FUNCTIONS = '/.netlify/functions'

export interface PushEnvironment {
  hasServiceWorker: boolean
  hasPush: boolean
  hasNotification: boolean
  isIos: boolean
  isStandalone: boolean
}

export type PushSupport = 'ok' | 'unsupported' | 'install-first'

export function currentEnvironment(): PushEnvironment {
  const nav = typeof navigator === 'undefined' ? undefined : navigator
  const ua = nav?.userAgent ?? ''
  return {
    hasServiceWorker: Boolean(nav && 'serviceWorker' in nav),
    hasPush: typeof window !== 'undefined' && 'PushManager' in window,
    hasNotification: typeof window !== 'undefined' && 'Notification' in window,
    // iPadOS se apresenta como Mac, mas tem tela de toque.
    isIos: /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && (nav?.maxTouchPoints ?? 0) > 1),
    isStandalone:
      (nav as (Navigator & { standalone?: boolean }) | undefined)?.standalone === true ||
      (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches),
  }
}

/** O aparelho recebe aviso com o app fechado? No iPhone só depois de instalar o app na Tela de Início (iOS 16.4 ou mais novo). */
export function pushSupport(env: PushEnvironment = currentEnvironment()): PushSupport {
  if (env.isIos && !env.isStandalone) return 'install-first'
  return env.hasServiceWorker && env.hasPush && env.hasNotification ? 'ok' : 'unsupported'
}

/** `email`: o servidor também tem o envio por e-mail configurado. */
export type ServerState = { status: 'ready'; publicKey: string; email: boolean } | { status: 'unavailable' }

/** Pergunta ao servidor se os avisos estão configurados e pega a chave pública. Qualquer problema vira "indisponível". */
export async function fetchPushConfig(fetcher: typeof fetch = fetch): Promise<ServerState> {
  try {
    const res = await fetcher(`${FUNCTIONS}/push-config`, { headers: { accept: 'application/json' } })
    if (!res.ok) return { status: 'unavailable' }
    const body = (await res.json()) as { publicKey?: unknown; email?: unknown }
    return typeof body.publicKey === 'string' && body.publicKey
      ? { status: 'ready', publicKey: body.publicKey, email: body.email === true }
      : { status: 'unavailable' }
  } catch {
    return { status: 'unavailable' }
  }
}

export class PushError extends Error {
  constructor(
    message: string,
    readonly code: 'denied' | 'not-ready' | 'failed' = 'failed',
  ) {
    super(message)
  }
}

function toBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64Url.length / 4) * 4, '=')
  const raw = atob(padded)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** O app (service worker) só fica pronto depois de instalado; sem isso `ready` nunca responde, então há um prazo. */
async function registration(timeoutMs = 8000): Promise<ServiceWorkerRegistration> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new PushError('O app ainda está terminando de instalar. Recarregue a página e tente de novo.', 'not-ready')), timeoutMs),
  )
  return Promise.race([navigator.serviceWorker.ready, timeout])
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

/** Endereço de aviso deste aparelho, se ele já está inscrito. */
export async function currentEndpoint(): Promise<string | null> {
  if (pushSupport() !== 'ok') return null
  try {
    const sub = await (await registration(3000)).pushManager.getSubscription()
    return sub?.endpoint ?? null
  } catch {
    return null
  }
}

/** Identificador estável do aparelho: o mesmo endereço sempre dá o mesmo id (id de documento não pode ter "/"). */
export async function endpointId(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface DeviceSubscription {
  id: string
  endpoint: string
  keys: { p256dh: string; auth: string }
  label: string
}

/** Pede permissão (precisa vir direto de um toque) e inscreve este aparelho. */
export async function subscribeThisDevice(publicKey: string): Promise<DeviceSubscription> {
  if (pushSupport() !== 'ok') throw new PushError('Este aparelho não recebe avisos com o app fechado.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new PushError('As notificações estão bloqueadas para este site. Libere nas configurações do navegador ou do celular e tente de novo.', 'denied')
  }
  const reg = await registration()
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(publicKey) }).catch(() => {
      throw new PushError('Não foi possível ativar os avisos neste aparelho. Tente de novo em instantes.')
    }))
  const json = sub.toJSON()
  const keys = json.keys
  if (!json.endpoint || !keys?.p256dh || !keys.auth) throw new PushError('O aparelho não devolveu os dados do aviso. Tente de novo.')
  return {
    id: await endpointId(json.endpoint),
    endpoint: json.endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
    label: deviceLabel(navigator.userAgent),
  }
}

/** Cancela a inscrição deste aparelho. Devolve o id para apagar o cadastro, ou null se não estava inscrito. */
export async function unsubscribeThisDevice(): Promise<string | null> {
  const endpoint = await currentEndpoint()
  if (!endpoint) return null
  const sub = await (await registration()).pushManager.getSubscription()
  await sub?.unsubscribe()
  return endpointId(endpoint)
}

/** Manda uma notificação de teste a todos os aparelhos da pessoa. Devolve quantos receberam. */
export async function sendTestPush(idToken: string, fetcher: typeof fetch = fetch): Promise<{ sent: number; total: number }> {
  let res: Response
  try {
    res = await fetcher(`${FUNCTIONS}/send-test`, { method: 'POST', headers: { authorization: `Bearer ${idToken}` } })
  } catch {
    throw new PushError('Sem conexão com o servidor de avisos. Verifique a internet e tente de novo.')
  }
  const body = (await res.json().catch(() => ({}))) as { sent?: number; total?: number; error?: string }
  if (!res.ok) throw new PushError(body.error ?? 'Não foi possível enviar o aviso de teste.')
  return { sent: body.sent ?? 0, total: body.total ?? 0 }
}
