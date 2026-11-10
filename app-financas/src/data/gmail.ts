import { auth } from '../firebase'

export interface SyncSummary {
  processed: number
  autoApplied: number
  suggested: number
  scams: number
  remaining: number
  error: string | null
}

async function call<T>(name: string): Promise<T> {
  const token = await auth?.currentUser?.getIdToken()
  if (!token) throw new Error('Entre de novo para continuar.')
  let res: Response
  try {
    res = await fetch(`/.netlify/functions/${name}`, { method: 'POST', headers: { authorization: `Bearer ${token}` } })
  } catch {
    throw new Error('Sem conexão com o servidor. Tente de novo.')
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  if (!res.ok) {
    if (res.status === 404 || !data) throw new Error('O servidor do app ainda não está publicado (funções do Netlify).')
    throw new Error(data.error ?? 'Não foi possível concluir.')
  }
  return data as T
}

/** Endereço do Google onde a pessoa autoriza a leitura do Gmail. */
export async function startGmailConnect(): Promise<string> {
  return (await call<{ url: string }>('gmail-auth-start')).url
}

export function syncGmailNow(): Promise<SyncSummary> {
  return call<SyncSummary>('gmail-sync-now')
}

export async function disconnectGmail(): Promise<void> {
  await call<{ ok: true }>('gmail-disconnect')
}
