import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore'
import { billAppliesTo, buildEntry, missingEntries } from '../domain/bills'
import { competenceOf } from '../domain/dates'
import { withPayment } from '../domain/receivables'
import type { Bill, Competence, Entry, Installment, IsoDate, Person, Receivable } from '../domain/types'
import { db } from '../firebase'

type Data<T> = Omit<T, 'id'>

function database() {
  if (!db) throw new Error('Firebase não configurado')
  return db
}

const billsCol = (uid: string) => collection(database(), 'users', uid, 'bills')
const entriesCol = (uid: string) => collection(database(), 'users', uid, 'entries')
const peopleCol = (uid: string) => collection(database(), 'users', uid, 'people')
const receivablesCol = (uid: string) => collection(database(), 'users', uid, 'receivables')

function withoutId<T extends { id: string }>(value: T): Data<T> {
  const { id: _id, ...rest } = value
  return rest
}

const BILL_DEFAULTS: Data<Bill> = {
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
  await setDoc(ref, withoutId(bill))

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

/* ---------- A receber (pessoas e compras parceladas) ---------- */

const PERSON_DEFAULTS: Data<Person> = { name: '', phone: '', email: '' }

const RECEIVABLE_DEFAULTS: Data<Receivable> = {
  personId: '',
  description: '',
  totalCents: 0,
  installmentCount: 0,
  firstDueDate: '1970-01-01',
  installments: [],
  notes: '',
}

export function subscribePeople(
  uid: string,
  onData: (people: Person[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    peopleCol(uid),
    (snap) => onData(snap.docs.map((d) => ({ ...PERSON_DEFAULTS, ...d.data(), id: d.id }) as Person)),
    onError,
  )
}

export function subscribeReceivables(
  uid: string,
  onData: (receivables: Receivable[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    receivablesCol(uid),
    (snap) => onData(snap.docs.map((d) => ({ ...RECEIVABLE_DEFAULTS, ...d.data(), id: d.id }) as Receivable)),
    onError,
  )
}

/**
 * Cadastra a compra parcelada e, se a pessoa for nova, a pessoa junto, numa gravação só.
 * Como no resto do app, não espera o servidor: o Firestore guarda no aparelho e sincroniza depois.
 */
export function createReceivable(
  uid: string,
  input: { person: Data<Person> & { id?: string }; receivable: Omit<Data<Receivable>, 'personId'> },
): { personId: string; receivableId: string; done: Promise<void> } {
  const batch = writeBatch(database())
  const personRef = input.person.id ? doc(peopleCol(uid), input.person.id) : doc(peopleCol(uid))
  if (!input.person.id) {
    const { id: _id, ...person } = input.person
    batch.set(personRef, person)
  }
  const receivableRef = doc(receivablesCol(uid))
  batch.set(receivableRef, { ...input.receivable, personId: personRef.id })
  return { personId: personRef.id, receivableId: receivableRef.id, done: batch.commit() }
}

export function updatePerson(uid: string, person: Person) {
  return setDoc(doc(peopleCol(uid), person.id), withoutId(person))
}

/** Dá baixa (ou desfaz, com null) numa parcela. Reescreve a lista de parcelas da compra. */
export function setInstallmentPayment(
  uid: string,
  receivable: Receivable,
  number: number,
  payment: { paidAt: IsoDate; paidAmountCents: number } | null,
) {
  const installments: Installment[] = withPayment(receivable.installments, number, payment)
  return updateDoc(doc(receivablesCol(uid), receivable.id), { installments })
}

export function deleteReceivable(uid: string, receivableId: string) {
  return deleteDoc(doc(receivablesCol(uid), receivableId))
}

export function deletePerson(uid: string, personId: string) {
  return deleteDoc(doc(peopleCol(uid), personId))
}
