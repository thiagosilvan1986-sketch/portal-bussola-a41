import type { Firestore } from 'firebase-admin/firestore'
import { normalizeAlerts } from '../../src/domain/alerts'
import type { Bill, Entry, IsoDate } from '../../src/domain/types'
import { adminAuth, adminDb } from './admin'
import type { AlertsStore, Channel, PushSub } from './alerts-run'
import { parseSubscription } from './subscriptions'

/** Campo de `settings/alertState` com o último dia avisado em cada canal (a notificação mantém o nome original). */
const SENT_FIELD: Record<Channel, string> = { push: 'lastSent', email: 'lastSentEmail' }

const BILL_DEFAULTS = {
  name: '',
  category: 'Outros',
  supplier: '',
  valueType: 'fixed',
  expectedAmountCents: 0,
  dueDay: 1,
  recurrence: 'monthly',
  startMonth: '1970-01',
  paymentMethod: 'boleto',
  notes: '',
  active: true,
  skippedMonths: [],
  installmentCount: null,
}

const ENTRY_DEFAULTS = {
  billId: '',
  billName: '',
  category: 'Outros',
  competence: '1970-01',
  dueDate: '1970-01-01',
  expectedAmountCents: 0,
  chargedAmountCents: null,
  paidAmountCents: null,
  paidAt: null,
  barcode: '',
  note: '',
}

/** Lê e grava no Firestore com a conta de serviço (que ignora as regras de segurança; por isso só o servidor usa isto). */
export function firestoreStore(db: Firestore = adminDb()): AlertsStore {
  const user = (uid: string) => db.collection('users').doc(uid)
  return {
    async allSubscriptions() {
      const snap = await db.collectionGroup('pushSubscriptions').get()
      const byUser = new Map<string, PushSub[]>()
      for (const doc of snap.docs) {
        const uid = doc.ref.parent.parent?.id
        const sub = parseSubscription(doc.id, doc.data())
        if (!uid || !sub) continue
        byUser.set(uid, [...(byUser.get(uid) ?? []), sub])
      }
      return byUser
    },
    async subscriptionsOf(uid) {
      const snap = await user(uid).collection('pushSubscriptions').get()
      return snap.docs.flatMap((doc) => parseSubscription(doc.id, doc.data()) ?? [])
    },
    async removeSubscription(uid, id) {
      await user(uid).collection('pushSubscriptions').doc(id).delete()
    },
    async emailUsers() {
      // Sem filtro, a consulta não exige índice; só lê as configurações e guarda quem marcou o e-mail.
      const snap = await db.collectionGroup('settings').select('email').get()
      return snap.docs.flatMap((doc) => {
        const uid = doc.ref.parent.parent?.id
        return doc.id === 'alerts' && doc.get('email') === true && uid ? [uid] : []
      })
    },
    async recipient(uid) {
      try {
        const account = await adminAuth().getUser(uid)
        return account.email && account.emailVerified && !account.disabled ? account.email : null
      } catch (e) {
        if ((e as { code?: string }).code === 'auth/user-not-found') return null
        throw e
      }
    },
    async settings(uid) {
      return normalizeAlerts((await user(uid).collection('settings').doc('alerts').get()).data())
    },
    async lastSent(uid, channel) {
      const value = (await user(uid).collection('settings').doc('alertState').get()).data()?.[SENT_FIELD[channel]]
      return typeof value === 'string' ? value : null
    },
    async markSent(uid, date: IsoDate, channel) {
      await user(uid).collection('settings').doc('alertState').set({ [SENT_FIELD[channel]]: date }, { merge: true })
    },
    async lastTestEmail(uid) {
      const value = (await user(uid).collection('settings').doc('alertState').get()).data()?.lastTestEmailAt
      return typeof value === 'number' ? value : null
    },
    async markTestEmail(uid, at) {
      await user(uid).collection('settings').doc('alertState').set({ lastTestEmailAt: at }, { merge: true })
    },
    async bills(uid) {
      const snap = await user(uid).collection('bills').get()
      return snap.docs.map((d) => ({ ...BILL_DEFAULTS, ...d.data(), id: d.id }) as Bill)
    },
    async entries(uid, competences) {
      const snap = await user(uid).collection('entries').where('competence', 'in', competences).get()
      return snap.docs.map((d) => ({ ...ENTRY_DEFAULTS, ...d.data(), id: d.id }) as Entry)
    },
  }
}
