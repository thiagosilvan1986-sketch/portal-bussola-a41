import type { Firestore } from 'firebase-admin/firestore'

/**
 * Par de chaves que identifica o servidor perante os serviços de notificação. O aparelho se inscreve com a chave pública
 * e só aceita avisos assinados pela privada, então o par não pode mudar depois que alguém se inscreveu.
 * Por isso fica guardado no Firestore (coleção appConfig, que as regras fecham para o app): nasce sozinho na primeira vez.
 * Quem preferir pode fixar as chaves nas variáveis VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY do Netlify.
 */
export interface Vapid {
  publicKey: string
  privateKey: string
}

export interface VapidStore {
  read(): Promise<Vapid | null>
  /** Grava só se ainda não existe; devolve false se outra chamada gravou antes. */
  create(vapid: Vapid): Promise<boolean>
}

export async function loadVapid(
  store: VapidStore,
  generate: () => Vapid,
  env: Record<string, string | undefined> = process.env,
): Promise<Vapid> {
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }
  const existing = await store.read()
  if (existing) return existing
  const fresh = generate()
  if (await store.create(fresh)) return fresh
  const winner = await store.read()
  if (winner) return winner
  throw new Error('Não foi possível obter as chaves de aviso.')
}

export function firestoreVapidStore(db: Firestore): VapidStore {
  const ref = db.collection('appConfig').doc('vapid')
  return {
    async read() {
      const data = (await ref.get()).data()
      return typeof data?.publicKey === 'string' && typeof data.privateKey === 'string'
        ? { publicKey: data.publicKey, privateKey: data.privateKey }
        : null
    },
    async create(vapid) {
      try {
        await ref.create(vapid)
        return true
      } catch (e) {
        // 6 = ALREADY_EXISTS
        if ((e as { code?: number }).code === 6) return false
        throw e
      }
    },
  }
}
