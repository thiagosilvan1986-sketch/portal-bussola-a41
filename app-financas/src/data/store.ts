import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore'
import { billAppliesTo, buildEntry, missingEntries } from '../domain/bills'
import { competenceOf } from '../domain/dates'
import type { MailRecord, Suggestion } from '../domain/suggestions'
import type { Bill, Competence, Entry, IsoDate } from '../domain/types'
import { db } from '../firebase'

type Data<T> = Omit<T, 'id'>

function database() {
  if (!db) throw new Error('Firebase não configurado')
  return db
}

const billsCol = (uid: string) => collection(database(), 'users', uid, 'bills')
const entriesCol = (uid: string) => collection(database(), 'users', uid, 'entries')

function withoutId<T extends { id: string }>(value: T): Data<T> {
  const { id: _id, ...rest } = value
  return rest
}

const BILL_DEFAULTS: Data<Bill> = {
  name: '',
  category: 'Outros',
  supplier: '',
  cnpj: '',
  valueType: 'fixed',
  expectedAmountCents: 0,
  dueDay: 1,
  recurrence: 'monthly',
  startMonth: '1970-01',
  paymentMethod: 'boleto',
  notes: '',
  active: true,
}

const ENTRY_DEFAULTS: Data<Entry> = {
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

export function subscribeBills(
  uid: string,
  onData: (bills: Bill[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    billsCol(uid),
    (snap) => onData(snap.docs.map((d) => ({ ...BILL_DEFAULTS, ...d.data(), id: d.id }) as Bill)),
    onError,
  )
}

export function subscribeEntries(
  uid: string,
  competence: Competence,
  onData: (entries: Entry[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(entriesCol(uid), where('competence', '==', competence)),
    (snap) => onData(snap.docs.map((d) => ({ ...ENTRY_DEFAULTS, ...d.data(), id: d.id }) as Entry)),
    onError,
  )
}

/**
 * Cria os lançamentos que faltam. O id é determinístico (`contaId_AAAA-MM`),
 * então rodar duas vezes, ou em dois aparelhos, nunca duplica.
 */
export async function ensureEntries(uid: string, bills: Bill[], competences: Competence[]): Promise<number> {
  if (bills.length === 0 || competences.length === 0) return 0
  const snap = await getDocs(query(entriesCol(uid), where('competence', 'in', competences)))
  const missing = missingEntries(bills, new Set(snap.docs.map((d) => d.id)), competences)
  if (missing.length === 0) return 0
  const batch = writeBatch(database())
  for (const entry of missing) batch.set(doc(entriesCol(uid), entry.id), withoutId(entry))
  await batch.commit()
  return missing.length
}

/** Cria ou atualiza uma conta e propaga a mudança aos lançamentos futuros ainda não pagos. */
export async function saveBill(
  uid: string,
  input: Data<Bill> & { id?: string },
  today: IsoDate,
): Promise<string> {
  const ref = input.id ? doc(billsCol(uid), input.id) : doc(billsCol(uid))
  const bill: Bill = { ...input, id: ref.id }
  // merge: campos que o formulário não conhece (como os remetentes aprendidos pelo Gmail) não são apagados.
  await setDoc(ref, withoutId(bill), { merge: true })

  const from = competenceOf(today)
  const snap = await getDocs(query(entriesCol(uid), where('billId', '==', bill.id)))
  const batch = writeBatch(database())
  let changed = false
  for (const d of snap.docs) {
    const e = d.data() as Data<Entry>
    if (e.paidAt !== null || e.competence < from) continue
    changed = true
    if (!billAppliesTo(bill, e.competence)) {
      batch.delete(d.ref)
    } else {
      batch.update(d.ref, {
        billName: bill.name,
        category: bill.category,
        expectedAmountCents: bill.expectedAmountCents,
        dueDate: buildEntry(bill, e.competence).dueDate,
      })
    }
  }
  if (changed) await batch.commit()
  return ref.id
}

export function payEntry(uid: string, entryId: string, amountCents: number, paidAt: IsoDate) {
  return updateDoc(doc(entriesCol(uid), entryId), { paidAmountCents: amountCents, paidAt })
}

export function undoPayment(uid: string, entryId: string) {
  return updateDoc(doc(entriesCol(uid), entryId), { paidAmountCents: null, paidAt: null })
}

export function updateEntryDetails(
  uid: string,
  entryId: string,
  patch: Pick<Entry, 'chargedAmountCents' | 'barcode' | 'note'>,
) {
  return updateDoc(doc(entriesCol(uid), entryId), patch)
}

/* -------------------------------------------------------------------------- */
/* Gmail e sugestões (Fase 2)                                                 */
/* -------------------------------------------------------------------------- */

export interface GmailStatus {
  connected: boolean
  needsReconnect: boolean
  email: string
  lastSyncAt: string | null
  lastError: string | null
  pending: number
}

export interface Prefs {
  onlySuggest: boolean
  ignoredSenders: string[]
}

const settingsDoc = (uid: string, name: string) => doc(database(), 'users', uid, 'settings', name)
const suggestionsCol = (uid: string) => collection(database(), 'users', uid, 'suggestions')

export function subscribeSuggestions(
  uid: string,
  onData: (items: Suggestion[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(suggestionsCol(uid), where('status', '==', 'pending')),
    (snap) =>
      onData(
        snap.docs
          .map((d) => ({ ...d.data(), id: d.id }) as Suggestion)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      ),
    onError,
  )
}

export function subscribeGmailStatus(uid: string, onData: (s: GmailStatus) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    settingsDoc(uid, 'gmail'),
    (snap) => {
      const d = snap.data() ?? {}
      onData({
        connected: d.connected === true,
        needsReconnect: d.needsReconnect === true,
        email: typeof d.email === 'string' ? d.email : '',
        lastSyncAt: typeof d.lastSyncAt === 'string' ? d.lastSyncAt : null,
        lastError: typeof d.lastError === 'string' ? d.lastError : null,
        pending: typeof d.pending === 'number' ? d.pending : 0,
      })
    },
    onError,
  )
}

export function subscribePrefs(uid: string, onData: (p: Prefs) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    settingsDoc(uid, 'prefs'),
    (snap) => {
      const d = snap.data() ?? {}
      onData({
        onlySuggest: d.onlySuggest === true,
        ignoredSenders: Array.isArray(d.ignoredSenders) ? (d.ignoredSenders as string[]) : [],
      })
    },
    onError,
  )
}

export function subscribeRecentMail(uid: string, onData: (items: MailRecord[]) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    query(collection(database(), 'users', uid, 'emails'), orderBy('processedAt', 'desc'), limit(15)),
    (snap) => onData(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as MailRecord)),
    onError,
  )
}

export function setOnlySuggest(uid: string, value: boolean) {
  return setDoc(settingsDoc(uid, 'prefs'), { onlySuggest: value }, { merge: true })
}

function markSuggestion(uid: string, id: string, status: 'accepted' | 'dismissed') {
  return updateDoc(doc(suggestionsCol(uid), id), { status, resolvedAt: new Date().toISOString() })
}

/** "Cadastrar": cria a conta e o lançamento do mês com o que veio no e-mail. */
export async function acceptNewBill(uid: string, s: Suggestion, today: IsoDate): Promise<string> {
  const d = s.draft
  if (!d) throw new Error('Sugestão sem dados da conta')
  const bill: Data<Bill> = {
    name: d.name,
    category: d.category,
    supplier: d.supplier,
    cnpj: d.cnpj,
    valueType: d.valueType,
    expectedAmountCents: d.expectedAmountCents,
    dueDay: d.dueDay,
    recurrence: d.recurrence,
    startMonth: d.startMonth,
    paymentMethod: d.paymentMethod,
    notes: '',
    active: true,
    emailSenders: [s.senderKey],
  }
  const billId = await saveBill(uid, bill, today)
  const entry = {
    ...withoutId(buildEntry({ ...bill, id: billId }, d.startMonth)),
    chargedAmountCents: d.amountCents,
    barcode: d.barcode,
    ...(d.dueDate ? { dueDate: d.dueDate } : {}),
  }
  await setDoc(doc(entriesCol(uid), `${billId}_${d.startMonth}`), entry)
  await markSuggestion(uid, s.id, 'accepted')
  return billId
}

/** "Atualizar" / "Confirmar": aplica o valor, o vencimento e o código ao lançamento e aprende o remetente. */
export async function acceptApplyCharge(uid: string, s: Suggestion, bills: Bill[]): Promise<void> {
  const bill = bills.find((b) => b.id === s.billId)
  if (!bill || !s.entryId || !s.competence) throw new Error('A conta desta sugestão não existe mais')
  const ref = doc(entriesCol(uid), s.entryId)
  const patch = s.patch ?? {}
  if ((await getDoc(ref)).exists()) {
    await updateDoc(ref, patch as Record<string, unknown>)
  } else {
    await setDoc(ref, { ...withoutId(buildEntry(bill, s.competence)), ...patch })
  }
  await updateDoc(doc(billsCol(uid), bill.id), {
    emailSenders: arrayUnion(s.senderKey),
    ...(s.cnpj && !bill.cnpj ? { cnpj: s.cnpj } : {}),
  })
  await markSuggestion(uid, s.id, 'accepted')
}

/** Alerta de golpe: "é legítimo" passa a aceitar esse remetente para a conta. */
export async function trustSender(uid: string, s: Suggestion): Promise<void> {
  if (s.billId) await updateDoc(doc(billsCol(uid), s.billId), { emailSenders: arrayUnion(s.senderKey) })
  await markSuggestion(uid, s.id, 'accepted')
}

export async function dismissSuggestion(uid: string, s: Suggestion, neverFromSender = false): Promise<void> {
  if (neverFromSender) await setDoc(settingsDoc(uid, 'prefs'), { ignoredSenders: arrayUnion(s.senderKey) }, { merge: true })
  await markSuggestion(uid, s.id, 'dismissed')
}
