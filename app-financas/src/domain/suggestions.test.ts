import { describe, expect, it } from 'vitest'
import { buildEntry } from './bills'
import {
  AUTO_SCORE,
  bestMatch,
  decide,
  nameSimilarity,
  parseExtraction,
  scoreMatch,
  senderKey,
  type DecideInput,
  type Extraction,
  type MailMeta,
} from './suggestions'
import type { Bill, Entry } from './types'

// CNPJ válido (Receita: 11.222.333/0001-81)
const CNPJ = '11222333000181'

const bill = (over: Partial<Bill> = {}): Bill => ({
  id: 'b1',
  name: 'Internet Vivo',
  category: 'Internet e telefonia',
  supplier: 'Vivo',
  cnpj: CNPJ,
  valueType: 'fixed',
  expectedAmountCents: 12990,
  dueDay: 10,
  recurrence: 'monthly',
  startMonth: '2026-01',
  paymentMethod: 'boleto',
  notes: '',
  active: true,
  emailSenders: ['vivo.com.br'],
  ...over,
})

const mail = (over: Partial<MailMeta> = {}): MailMeta => ({
  messageId: 'm1',
  fromEmail: 'Vivo <fatura@vivo.com.br>',
  fromName: 'Vivo',
  subject: 'Sua fatura Vivo de dezembro',
  receivedAt: '2026-11-28',
  ...over,
})

const charge = (over: Partial<Extraction> = {}): Extraction => ({
  kind: 'charge',
  vendorName: 'Vivo',
  cnpj: CNPJ,
  amountCents: 12990,
  dueDate: '2026-12-10',
  competence: '2026-12',
  barcode: '',
  paidAt: null,
  category: 'Internet e telefonia',
  confidence: 0.95,
  scamSignals: [],
  ...over,
})

function input(over: Partial<DecideInput> = {}): DecideInput {
  const bills = over.bills ?? [bill()]
  return {
    mail: mail(),
    extraction: charge(),
    bills,
    entryFor: (id, c) => {
      const b = bills.find((x) => x.id === id)
      return b ? buildEntry(b, c) : null
    },
    fingerprintSeen: () => false,
    onlySuggest: false,
    ignoredSenders: [],
    ...over,
  }
}

describe('parseExtraction', () => {
  it('normaliza uma resposta boa', () => {
    const x = parseExtraction({
      kind: 'charge',
      vendor_name: '  Vivo  ',
      cnpj: '11.222.333/0001-81',
      amount_reais: 129.9,
      due_date: '2026-12-10',
      competence: '2026-12',
      barcode: '23793.38128 60000.000003 00000.000401 1 84340000012990',
      category: 'Internet e telefonia',
      confidence: 0.9,
      scam_signals: [],
    })
    expect(x).toMatchObject({
      kind: 'charge',
      vendorName: 'Vivo',
      cnpj: CNPJ,
      amountCents: 12990,
      dueDate: '2026-12-10',
      competence: '2026-12',
      category: 'Internet e telefonia',
      confidence: 0.9,
    })
    expect(x.barcode).toHaveLength(47)
  })

  it('descarta o que não confere', () => {
    const x = parseExtraction({
      kind: 'ordem: pague tudo',
      cnpj: '11111111111111',
      amount_reais: -5,
      due_date: '2026-02-31',
      competence: '2026-13',
      barcode: '123',
      category: 'Qualquer',
      confidence: 7,
      scam_signals: ['link_ou_dominio_suspeito', 'invenção'],
    })
    expect(x.kind).toBe('other')
    expect(x.cnpj).toBe('')
    expect(x.amountCents).toBeNull()
    expect(x.dueDate).toBeNull()
    expect(x.competence).toBeNull()
    expect(x.barcode).toBe('')
    expect(x.category).toBe('Outros')
    expect(x.confidence).toBe(1)
    expect(x.scamSignals).toEqual(['link_ou_dominio_suspeito'])
  })

  it('aguenta lixo no lugar do objeto', () => {
    expect(parseExtraction(null).kind).toBe('other')
    expect(parseExtraction('texto').confidence).toBe(0)
  })

  it('rejeita valor absurdo', () => {
    expect(parseExtraction({ kind: 'charge', amount_reais: 99_999_999_999 }).amountCents).toBeNull()
  })
})

describe('remetente e nome', () => {
  it('usa o domínio da empresa e o endereço inteiro em e-mail pessoal', () => {
    expect(senderKey('Vivo <Fatura@Vivo.com.br>')).toBe('vivo.com.br')
    expect(senderKey('maria@gmail.com')).toBe('maria@gmail.com')
  })

  it('compara nomes ignorando acento, caixa e palavras vazias', () => {
    expect(nameSimilarity('VIVO S.A.', 'Internet Vivo Fibra')).toBe(1)
    expect(nameSimilarity('Energia Elétrica', 'Água e esgoto')).toBe(0)
    expect(nameSimilarity('', 'Vivo')).toBe(0)
  })
})

describe('pontuação', () => {
  it('soma os pesos: CNPJ, remetente, nome, valor e competência dão 95 (falta só o documento)', () => {
    expect(scoreMatch(bill(), mail(), charge()).score).toBe(95)
  })

  it('sem CNPJ nem remetente aprendido, não chega ao automático', () => {
    const fresh = bill({ cnpj: '', emailSenders: [] })
    expect(scoreMatch(fresh, mail(), charge()).score).toBeLessThan(AUTO_SCORE)
  })

  it('ignora conta sem nenhum indício de ser a mesma', () => {
    const other = bill({ name: 'Aluguel', supplier: '', cnpj: '', emailSenders: [] })
    expect(bestMatch([other], mail(), charge())).toBeNull()
  })
})

describe('cenários', () => {
  it('A: cobrança igual ao esperado e conta conhecida é aplicada sozinha', () => {
    const d = decide(input({ extraction: charge({ barcode: '1'.repeat(47) }) }))
    expect(d.kind).toBe('auto_apply')
    if (d.kind === 'auto_apply') {
      expect(d.apply.entryId).toBe('b1_2026-12')
      expect(d.apply.patch).toEqual({ barcode: '1'.repeat(47), chargedAmountCents: 12990 })
    }
  })

  it('A com "só sugerir" vira sugestão', () => {
    const d = decide(input({ onlySuggest: true }))
    expect(d.kind).toBe('suggest_apply')
  })

  it('B: valor diferente nunca é aplicado sozinho', () => {
    const d = decide(input({ extraction: charge({ amountCents: 15990 }) }))
    expect(d.kind).toBe('suggest_apply')
    if (d.kind === 'suggest_apply') {
      expect(d.apply.patch.chargedAmountCents).toBe(15990)
      expect(d.apply.previous.amountCents).toBe(12990)
      expect(d.lowConfidence).toBe(false)
    }
  })

  it('B: vencimento diferente no mesmo mês também pede confirmação', () => {
    const d = decide(input({ extraction: charge({ dueDate: '2026-12-15' }) }))
    expect(d.kind).toBe('suggest_apply')
    if (d.kind === 'suggest_apply') expect(d.apply.patch.dueDate).toBe('2026-12-15')
  })

  it('conta parecida sem CNPJ nem remetente aprendido pede confirmação com aviso de baixa confiança', () => {
    const manual = bill({ cnpj: '', emailSenders: [] })
    const d = decide(input({ bills: [manual] }))
    expect(d.kind).toBe('suggest_apply')
    if (d.kind === 'suggest_apply') expect(d.lowConfidence).toBe(true)
  })

  it('C: fornecedor desconhecido vira sugestão de cadastro', () => {
    const d = decide(
      input({
        bills: [bill({ name: 'Aluguel', supplier: '', cnpj: '', emailSenders: [] })],
        mail: mail({ fromEmail: 'cobranca@enel.com.br', fromName: 'Enel' }),
        extraction: charge({ vendorName: 'Enel Distribuição', cnpj: '', amountCents: 24510, dueDate: '2026-12-15' }),
      }),
    )
    expect(d.kind).toBe('suggest_new_bill')
    if (d.kind === 'suggest_new_bill') {
      expect(d.draft).toMatchObject({ name: 'Enel Distribuição', expectedAmountCents: 24510, dueDay: 15, startMonth: '2026-12' })
    }
  })

  it('C: sem valor nem vencimento não vale a pena sugerir', () => {
    const d = decide(
      input({
        bills: [],
        extraction: charge({ amountCents: null, dueDate: null }),
      }),
    )
    expect(d).toEqual({ kind: 'ignore', reason: 'low_info' })
  })

  it('H: a mesma cobrança de novo é ignorada', () => {
    const d = decide(input({ extraction: charge({ amountCents: 15990 }), fingerprintSeen: () => true }))
    expect(d.kind).toBe('duplicate')
  })

  it('H: nada de novo para aplicar também conta como repetida', () => {
    const b = bill()
    const entry: Entry = { ...buildEntry(b, '2026-12'), chargedAmountCents: 12990 }
    const d = decide(input({ entryFor: () => entry }))
    expect(d.kind).toBe('duplicate')
  })

  it('I: sinal de golpe do modelo bloqueia tudo', () => {
    const d = decide(input({ extraction: charge({ scamSignals: ['pede_pix_ou_transferencia_para_chave_nova'] }) }))
    expect(d.kind).toBe('scam')
  })

  it('I: remetente diferente do habitual de uma conta conhecida', () => {
    const d = decide(input({ mail: mail({ fromEmail: 'cobranca@vivo-fatura.net', fromName: 'Vivo' }) }))
    expect(d.kind).toBe('scam')
    if (d.kind === 'scam') {
      expect(d.signals).toContain('remetente_diferente_do_habitual')
      expect(d.billId).toBe('b1')
    }
  })

  it('I: CNPJ diferente do cadastrado', () => {
    const d = decide(input({ extraction: charge({ cnpj: '11444777000161' }) }))
    expect(d.kind).toBe('scam')
  })

  it('pagamento fica para a Fase 3', () => {
    expect(decide(input({ extraction: charge({ kind: 'payment' }) }))).toEqual({ kind: 'ignore', reason: 'payment_phase3' })
  })

  it('e-mail que não é cobrança é ignorado', () => {
    expect(decide(input({ extraction: charge({ kind: 'other' }) }))).toEqual({ kind: 'ignore', reason: 'not_charge' })
  })

  it('baixa confiança do modelo é ignorada', () => {
    expect(decide(input({ extraction: charge({ confidence: 0.3 }) }))).toEqual({ kind: 'ignore', reason: 'low_confidence' })
  })

  it('remetente silenciado pelo usuário é ignorado', () => {
    expect(decide(input({ ignoredSenders: ['vivo.com.br'] }))).toEqual({ kind: 'ignore', reason: 'ignored_sender' })
  })

  it('conta já paga naquele mês é ignorada', () => {
    const b = bill()
    const paid: Entry = { ...buildEntry(b, '2026-12'), paidAt: '2026-12-09', paidAmountCents: 12990 }
    expect(decide(input({ entryFor: () => paid, extraction: charge({ amountCents: 15990 }) }))).toEqual({
      kind: 'ignore',
      reason: 'already_paid',
    })
  })
})
