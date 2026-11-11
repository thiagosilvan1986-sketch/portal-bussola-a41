import type { Firestore } from 'firebase-admin/firestore'
import { normalizeAlerts } from '../../src/domain/alerts'
import type { Bill, Entry, IsoDate } from '../../src/domain/types'
import { adminDb } from './admin'
import type { AlertsStore, PushSub } from './alerts-run'
import { parseSubscription } from './subscriptions'

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
    async settings(uid) {
      return normalizeAlerts((await user(uid).collection('settings').doc('alerts').get()).data())
    },
    async lastSent(uid) {
      const value = (await user(uid).collection('settings').doc('alertState').get()).data()?.lastSent
      return typeof value === 'string' ? value : null
    },
    async markSent(uid, date: IsoDate) {
      await user(uid).collection('settings').doc('alertState').set({ lastSent: date }, { merge: true })
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
