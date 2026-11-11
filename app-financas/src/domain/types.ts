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
  /** Meses cujo lançamento foi excluído: o app não os recria. Ausente em contas antigas. */
  skippedMonths?: Competence[]
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

/** Por onde a cobrança foi aberta. O app não sabe se a mensagem foi mesmo enviada: registra o toque. */
export type ChargeChannel = 'whatsapp' | 'email' | 'copia'

/** Uma cobrança feita a uma pessoa. */
export interface ChargeLog {
  date: IsoDate
  channel: ChargeChannel
  totalCents: number
  /** true se havia parcela vencida; false se foi só um lembrete. */
  overdue: boolean
}

/** Jeito de falar na mensagem de cobrança. */
export type MessageTone = 'amigavel' | 'profissional'

/** Pessoa que nos deve. Telefone guardado só com dígitos. */
export interface Person {
  id: string
  name: string
  phone: string
  email: string
  /** Histórico das últimas cobranças (as mais antigas saem depois de 30). */
  charges: ChargeLog[]
  /** Tom da mensagem de cobrança. Ausente (pessoas antigas) vale como amigável. */
  tone?: MessageTone
}

/** Uma parcela a receber. Valores em centavos. */
export interface Installment {
  number: number
  dueDate: IsoDate
  amountCents: number
  paidAt: IsoDate | null
  paidAmountCents: number | null
}

/**
 * O que a compra representa.
 * - cartao: compra ou parcelamento passado no nosso cartão para outra pessoa; o valor é só reembolso (cobre a fatura), não é receita.
 * - servico: serviço prestado; é dinheiro a receber de verdade.
 */
export type ReceivableKind = 'cartao' | 'servico'

/** Compra parcelada para alguém (o que a pessoa nos deve). */
export interface Receivable {
  id: string
  personId: string
  kind: ReceivableKind
  description: string
  totalCents: number
  installmentCount: number
  firstDueDate: IsoDate
  installments: Installment[]
  notes: string
}
