export type Recurrence = 'monthly' | 'bimonthly' | 'quarterly' | 'yearly'
export type ValueType = 'fixed' | 'variable'
/** Código da forma de pagamento cadastrada (os padrões: boleto, debito_automatico, pix, cartao; as da pessoa ganham código próprio). */
export type PaymentMethod = string

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
  /** Quantas parcelas a conta tem; depois da última ela para de gerar lançamentos. Vazio (ou ausente, em contas antigas) = sem fim. */
  installmentCount?: number | null
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
  /** Presentes só em lançamentos de conta parcelada: "Parcela 3 de 10". */
  installmentNumber?: number
  installmentTotal?: number
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
 * - rateio: a parte da pessoa numa conta a pagar dividida (aluguel, energia); sempre ligada à conta, todo mês.
 */
export type ReceivableKind = 'cartao' | 'servico' | 'rateio'

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
  /** Conta a pagar a que este reembolso se refere (opcional). Vazio ou ausente = sem ligação. No rateio, obrigatória. */
  billId?: string | null
  /**
   * Rateio sem número de parcelas: repete todo mês, com `monthlyCents`, até `endMonth` (vazio = sem fim).
   * As parcelas gravadas são só as já geradas; o app acrescenta os meses seguintes ao ler (veja `extendRecurring`).
   */
  recurring?: boolean
  /** Valor da parte da pessoa a cada mês (rateio). */
  monthlyCents?: number
  /** Último mês do rateio sem fim, quando ele for encerrado. */
  endMonth?: Competence | null
}
