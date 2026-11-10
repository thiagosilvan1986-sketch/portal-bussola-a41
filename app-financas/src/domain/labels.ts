import type { PaymentMethod } from './types'

export const CATEGORIES = [
  'Moradia',
  'Contas de consumo',
  'Internet e telefonia',
  'Cartão de crédito',
  'Educação',
  'Saúde',
  'Seguros',
  'Assinaturas',
  'Impostos',
  'Outros',
] as const

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  boleto: 'Boleto',
  debito_automatico: 'Débito automático',
  pix: 'PIX',
  cartao: 'Cartão',
}

/** Atalhos para o cadastro: nome já preenchido e categoria sugerida. */
export const QUICK_BILLS: { name: string; category: (typeof CATEGORIES)[number] }[] = [
  { name: 'Energia elétrica', category: 'Contas de consumo' },
  { name: 'Água e esgoto', category: 'Contas de consumo' },
  { name: 'Internet', category: 'Internet e telefonia' },
  { name: 'Celular', category: 'Internet e telefonia' },
  { name: 'Aluguel', category: 'Moradia' },
  { name: 'Condomínio', category: 'Moradia' },
  { name: 'Cartão de crédito', category: 'Cartão de crédito' },
  { name: 'Plano de saúde', category: 'Saúde' },
  { name: 'Escola', category: 'Educação' },
  { name: 'IPTU', category: 'Impostos' },
]
