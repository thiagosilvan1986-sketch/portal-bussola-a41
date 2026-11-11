import { describe, expect, it } from 'vitest'
import {
  buildInstallments,
  chargeMessage,
  formatPhone,
  installmentStatus,
  isSettled,
  isValidEmail,
  isValidPhone,
  mailtoUrl,
  summarizePerson,
  summarizeReceivable,
  whatsappNumber,
  whatsappUrl,
  withFirstReceived,
  withPayment,
} from './receivables'
import type { Person, Receivable } from './types'

const nbsp = / /g
const flat = (s: string) => s.replace(nbsp, ' ')

const person: Person = { id: 'p1', name: 'Ana Souza', phone: '11987654321', email: 'ana@exemplo.com' }

const purchase = (over: Partial<Receivable> = {}): Receivable => {
  const installments = buildInstallments(42000, 10, '2026-09-05')
  return {
    id: 'r1',
    personId: 'p1',
    description: 'Tênis',
    totalCents: 42000,
    installmentCount: 10,
    firstDueDate: '2026-09-05',
    installments,
    notes: '',
    ...over,
  }
}

describe('parcelas', () => {
  it('divide o total sem perder centavos e mantém o mesmo dia', () => {
    const list = buildInstallments(10000, 3, '2026-01-31')
    expect(list.map((i) => i.amountCents)).toEqual([3334, 3333, 3333])
    expect(list.reduce((a, i) => a + i.amountCents, 0)).toBe(10000)
    expect(list.map((i) => i.dueDate)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
    expect(list.map((i) => i.number)).toEqual([1, 2, 3])
    expect(list.every((i) => i.paidAt === null)).toBe(true)
  })

  it('vira o ano nos vencimentos', () => {
    const list = buildInstallments(3000, 3, '2026-11-15')
    expect(list.map((i) => i.dueDate)).toEqual(['2026-11-15', '2026-12-15', '2027-01-15'])
  })

  it('marca as primeiras como já recebidas, sem data no futuro', () => {
    const list = withFirstReceived(buildInstallments(30000, 3, '2026-10-20'), 2, '2026-11-09')
    expect(list[0]).toMatchObject({ paidAt: '2026-10-20', paidAmountCents: 10000 })
    expect(list[1]).toMatchObject({ paidAt: '2026-11-09', paidAmountCents: 10000 })
    expect(list[2].paidAt).toBeNull()
  })

  it('dá e desfaz a baixa de uma parcela', () => {
    const base = buildInstallments(2000, 2, '2026-11-05')
    const paid = withPayment(base, 1, { paidAt: '2026-11-06', paidAmountCents: 1000 })
    expect(paid[0]).toMatchObject({ paidAt: '2026-11-06', paidAmountCents: 1000 })
    expect(paid[1].paidAt).toBeNull()
    const undone = withPayment(paid, 1, null)
    expect(undone[0]).toMatchObject({ paidAt: null, paidAmountCents: null })
  })

  it('status: paga, parcial, atrasada, vence em breve e prevista', () => {
    const [a, b, c, d] = buildInstallments(4000, 4, '2026-11-01')
    const today = '2026-11-09'
    expect(installmentStatus({ ...a, paidAt: '2026-11-02', paidAmountCents: 1000 }, today)).toBe('paga')
    expect(installmentStatus({ ...a, paidAt: '2026-11-02', paidAmountCents: 400 }, today)).toBe('parcial')
    expect(installmentStatus(a, today)).toBe('atrasada')
    expect(installmentStatus({ ...b, dueDate: '2026-11-12' }, today)).toBe('vence_em_breve')
    expect(installmentStatus({ ...c, dueDate: '2026-12-30' }, today)).toBe('prevista')
    expect(isSettled({ ...d, paidAt: '2026-11-09', paidAmountCents: 1000 })).toBe(true)
  })
})

describe('resumos', () => {
  const today = '2026-11-09'

  it('conta pagas, recebido, falta e atrasadas de uma compra', () => {
    const r = purchase()
    r.installments = withPayment(r.installments, 1, { paidAt: '2026-09-05', paidAmountCents: 4200 })
    const s = summarizeReceivable(r, today)
    expect(s.settledCount).toBe(1)
    expect(s.receivedCents).toBe(4200)
    expect(s.remainingCents).toBe(37800)
    // parcelas 2 (05/10) e 3 (05/11) venceram
    expect(s.overdueCount).toBe(2)
    expect(s.overdueCents).toBe(8400)
    expect(s.nextDueDate).toBe('2026-10-05')
  })

  it('pagamento parcial continua devendo a diferença', () => {
    const r = purchase()
    r.installments = withPayment(r.installments, 1, { paidAt: '2026-09-05', paidAmountCents: 3000 })
    const s = summarizeReceivable(r, today)
    expect(s.settledCount).toBe(0)
    expect(s.remainingCents).toBe(42000 - 3000)
  })

  it('soma as compras de uma pessoa', () => {
    const a = purchase()
    const b = purchase({ id: 'r2', description: 'Celular', installmentCount: 2, installments: buildInstallments(10000, 2, '2026-12-01') })
    const s = summarizePerson([a, b], today)
    expect(s.purchaseCount).toBe(2)
    expect(s.remainingCents).toBe(52000)
    expect(s.overdueCount).toBe(3)
    expect(s.nextDueDate).toBe('2026-09-05')
  })
})

describe('contato', () => {
  it('valida telefone com DDD, com ou sem +55', () => {
    expect(isValidPhone('')).toBe(true)
    expect(isValidPhone('(11) 98765-4321')).toBe(true)
    expect(isValidPhone('11 3456-7890')).toBe(true)
    expect(isValidPhone('+55 11 98765-4321')).toBe(true)
    expect(isValidPhone('98765-4321')).toBe(false)
    expect(isValidPhone('123')).toBe(false)
  })

  it('formata e prepara o número do WhatsApp', () => {
    expect(formatPhone('11987654321')).toBe('(11) 98765-4321')
    expect(formatPhone('1134567890')).toBe('(11) 3456-7890')
    expect(formatPhone('5511987654321')).toBe('(11) 98765-4321')
    expect(whatsappNumber('(11) 98765-4321')).toBe('5511987654321')
    expect(whatsappNumber('+55 11 98765-4321')).toBe('5511987654321')
    expect(whatsappNumber('')).toBeNull()
    expect(whatsappNumber('123')).toBeNull()
  })

  it('valida e-mail e monta os links', () => {
    expect(isValidEmail('')).toBe(true)
    expect(isValidEmail('ana@exemplo.com')).toBe(true)
    expect(isValidEmail('ana@exemplo')).toBe(false)
    expect(whatsappUrl('11987654321', 'Oi & tudo?\nok')).toBe('https://wa.me/5511987654321?text=Oi%20%26%20tudo%3F%0Aok')
    expect(whatsappUrl('', 'x')).toBeNull()
    expect(mailtoUrl('ana@exemplo.com', 'Assunto', 'Linha 1\nLinha 2')).toBe(
      'mailto:ana@exemplo.com?subject=Assunto&body=Linha%201%0ALinha%202',
    )
    expect(mailtoUrl('', 'a', 'b')).toBeNull()
  })
})

describe('mensagem de cobrança', () => {
  const today = '2026-11-09'

  it('uma parcela vencida: não localizou o pagamento da parcela X de Y', () => {
    const r = purchase()
    r.installments = r.installments.map((i) => (i.number <= 2 ? { ...i, paidAt: i.dueDate, paidAmountCents: i.amountCents } : i))
    const m = chargeMessage(person, [r], today)!
    expect(m.kind).toBe('overdue')
    expect(m.totalCents).toBe(4200)
    expect(flat(m.text)).toBe(
      'Oi, Ana! Tudo bem? Não localizei o pagamento da parcela 3 de 10 (Tênis), no valor de R$ 42,00, que venceu em 05/11/2026. Pode me confirmar se já foi pago ou quando consegue pagar? Obrigado!',
    )
    expect(m.subject).toBe('Parcela em atraso: Tênis')
  })

  it('várias parcelas vencidas da mesma compra somam o valor', () => {
    const m = chargeMessage(person, [purchase()], today)!
    expect(m.totalCents).toBe(12600)
    expect(flat(m.text)).toContain('das parcelas 1, 2 e 3 de 10 (Tênis), que somam R$ 126,00 (a mais antiga venceu em 05/09/2026)')
    expect(m.subject).toBe('Parcelas em atraso: Tênis')
  })

  it('várias compras viram uma lista com o total', () => {
    const celular = purchase({
      id: 'r2',
      description: 'Celular',
      installmentCount: 12,
      installments: buildInstallments(120000, 12, '2026-11-01'),
    })
    const m = chargeMessage(person, [purchase(), celular], today)!
    const text = flat(m.text)
    expect(text).toContain('Não localizei o pagamento destas parcelas:')
    expect(text).toContain('• Tênis: parcelas 1, 2 e 3 de 10, R$ 126,00 (a mais antiga venceu em 05/09/2026)')
    expect(text).toContain('• Celular: parcela 1 de 12, R$ 100,00 (venceu em 01/11/2026)')
    expect(text).toContain('Total: R$ 226,00.')
    expect(m.totalCents).toBe(22600)
  })

  it('sem atraso vira lembrete da próxima parcela', () => {
    const r = purchase({ installments: buildInstallments(42000, 10, '2026-12-05') })
    const m = chargeMessage(person, [r], today)!
    expect(m.kind).toBe('reminder')
    expect(flat(m.text)).toBe(
      'Oi, Ana! Tudo bem? Passando para lembrar da parcela 1 de 10 (Tênis), de R$ 42,00, com vencimento em 05/12/2026. Obrigado!',
    )
  })

  it('não gera mensagem quando tudo foi recebido', () => {
    const r = purchase()
    r.installments = r.installments.map((i) => ({ ...i, paidAt: i.dueDate, paidAmountCents: i.amountCents }))
    expect(chargeMessage(person, [r], today)).toBeNull()
    expect(chargeMessage(person, [], today)).toBeNull()
  })
})
