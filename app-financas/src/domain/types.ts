export type Recurrence = 'monthly' | 'bimonthly' | 'quarterly' | 'yearly'
export type ValueType = 'fixed' | 'variable'
export type PaymentMethod = 'boleto' | 'debito_automatico' | 'pix' | 'cartao'

/** Competência no formato AAAA-MM. */
export type Competence = string
/** Data no formato AAAA-MM-DD. */
export type IsoDate = string

/** Conta recorrente (o molde). Valores sempre em centavos. */
export interface Bill {
  id: string
  name: string
  category: string
  supplier: string
  valueType: ValueType
  expectedAmountCents: number
  dueDay: number
  recurrence: Recurrence
  startMonth: Competence
  paymentMethod: PaymentMethod
  notes: string
  active: boolean
}

/** Lançamento do mês (a ocorrência). O id é `${billId}_${competence}`. */
export interface Entry {
  id: string
  billId: string
  billName: string
  category: string
  competence: Competence
  dueDate: IsoDate
  expectedAmountCents: number
  chargedAmountCents: number | null
  paidAmountCents: number | null
  paidAt: IsoDate | null
  barcode: string
  note: string
}

export type DisplayStatus =
  | 'paga'
  | 'parcial'
  | 'atrasada'
  | 'vence_em_breve'
  | 'cobranca_recebida'
  | 'prevista'
