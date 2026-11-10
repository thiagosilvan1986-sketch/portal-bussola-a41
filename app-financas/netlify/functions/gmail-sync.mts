import type { Config } from '@netlify/functions'
import { syncAll } from '../lib/sync'

/** Roda sozinha a cada 10 minutos e lê os e-mails novos de todo mundo que conectou o Gmail (limite de 30 s). */
export default async (): Promise<void> => {
  const { users } = await syncAll(Date.now() + 26_000)
  console.log(`gmail-sync: ${users} usuário(s) conectado(s)`)
}

export const config: Config = { schedule: '*/10 * * * *' }
