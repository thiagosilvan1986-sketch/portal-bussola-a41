import { describe, expect, it } from 'vitest'
import {
  buildInstallments,
  chargeMessage,
  addCharge,
  channelVia,
  daysAgoText,
  editReceivable,
  forecastByMonth,
  formatPhone,
  installmentStatus,
  isSettled,
  isValidEmail,
  isValidPhone,
  lastChargeText,
  lastPaidNumber,
  listPath,
  mailtoUrl,
  ofKind,
  personTone,
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

const person: Person = { id: 'p1', name: 'Ana Souza', phone: '11987654321', email: 'ana@exemplo.com', charges: [] }

const purchase = (over: Partial<Receivable> = {}): Receivable => {
  const installments = buildInstallments(42000, 10, '2026-09-05')
  return {
    id: 'r1',
    personId: 'p1',
    kind: 'cartao',
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

describe('tipos e edição da compra', () => {
  it('separa a lista por tipo e aponta a aba de cada um', () => {
    const a = purchase()
    const b = purchase({ id: 'r2', kind: 'servico', description: 'Instalação' })
    expect(ofKind([a, b], 'cartao').map((r) => r.id)).toEqual(['r1'])
    expect(ofKind([a, b], 'servico').map((r) => r.id)).toEqual(['r2'])
    expect(listPath('cartao')).toBe('/receber')
    expect(listPath('servico')).toBe('/receber?aba=servicos')
  })

  it('acha a última parcela com baixa', () => {
    const r = purchase()
    expect(lastPaidNumber(r.installments)).toBe(0)
    const paid = withPayment(withPayment(r.installments, 2, { paidAt: '2026-10-05', paidAmountCents: 4200 }), 4, {
      paidAt: '2026-11-01',
      paidAmountCents: 1000,
    })
    expect(lastPaidNumber(paid)).toBe(4)
  })

  const same = (r: Receivable) => ({
    kind: r.kind,
    description: r.description,
    totalCents: r.totalCents,
    installmentCount: r.installmentCount,
    firstDueDate: r.firstDueDate,
    notes: r.notes,
  })

  it('mudar só descrição, tipo ou observação não mexe nas parcelas', () => {
    const r = purchase()
    r.installments = withPayment(r.installments, 1, { paidAt: '2026-09-06', paidAmountCents: 1000 })
    const out = editReceivable(r, { ...same(r), kind: 'servico', description: 'Calçado', notes: 'combinado' })
    expect(out).toMatchObject({ id: 'r1', personId: 'p1', kind: 'servico', description: 'Calçado', notes: 'combinado' })
    expect(out.installments).toBe(r.installments)
  })

  it('mudar valor, parcelas ou vencimento refaz as parcelas e mantém as baixas pelo número', () => {
    const r = purchase()
    r.installments = withPayment(r.installments, 1, { paidAt: '2026-09-06', paidAmountCents: 4200 })
    const out = editReceivable(r, { ...same(r), totalCents: 60000, installmentCount: 6, firstDueDate: '2026-09-10' })
    expect(out.installments).toHaveLength(6)
    expect(out.installments.reduce((a, i) => a + i.amountCents, 0)).toBe(60000)
    expect(out.installments[0]).toMatchObject({ number: 1, dueDate: '2026-09-10', amountCents: 10000, paidAt: '2026-09-06', paidAmountCents: 4200 })
    expect(out.installments[1]).toMatchObject({ number: 2, dueDate: '2026-10-10', paidAt: null })
    expect(summarizeReceivable(out, '2026-11-09').remainingCents).toBe(60000 - 4200)
  })

  it('aumentar o número de parcelas acrescenta parcelas sem baixa', () => {
    const r = purchase({ installmentCount: 2, totalCents: 2000, installments: buildInstallments(2000, 2, '2026-12-01') })
    const out = editReceivable(r, { ...same(r), installmentCount: 4, totalCents: 4000 })
    expect(out.installments.map((i) => i.number)).toEqual([1, 2, 3, 4])
    expect(out.installments.every((i) => i.paidAt === null)).toBe(true)
  })
})

describe('previsão por mês', () => {
  const today = '2026-11-09'

  it('agrupa pelo mês de vencimento: atrasado de antes, meses à frente e o que vem depois', () => {
    // 10 parcelas de R$ 42,00 de 05/09/2026 a 05/06/2027; a 1ª foi recebida
    const r = purchase()
    r.installments = withPayment(r.installments, 1, { paidAt: '2026-09-05', paidAmountCents: 4200 })
    const f = forecastByMonth([r], today)
    expect(f.earlierCents).toBe(4200) // parcela 2 (05/10) ficou para trás; a de setembro foi paga
    expect(f.months.map((m) => m.competence)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04'])
    expect(f.months.every((m) => m.totalCents === 4200)).toBe(true)
    expect(f.months[0]).toMatchObject({ receivedCents: 0, remainingCents: 4200 })
    expect(f.laterCents).toBe(8400) // maio e junho de 2027
    expect(f.laterFrom).toBe('2027-05')
    const sum = f.earlierCents + f.months.reduce((a, m) => a + m.remainingCents, 0) + f.laterCents
    expect(sum).toBe(summarizeReceivable(r, today).remainingCents)
  })

  it('mostra o quanto já voltou e o quanto falta no mês', () => {
    const r = purchase({ installments: buildInstallments(20000, 2, '2026-11-20') })
    r.installments = withPayment(r.installments, 1, { paidAt: '2026-11-05', paidAmountCents: 4000 })
    const m = forecastByMonth([r], today).months[0]
    expect(m).toMatchObject({ competence: '2026-11', totalCents: 10000, receivedCents: 4000, remainingCents: 6000 })
  })

  it('soma compras diferentes e vira o ano', () => {
    const a = purchase({ installments: buildInstallments(1000, 1, '2026-12-31') })
    const b = purchase({ id: 'r2', installments: buildInstallments(2000, 1, '2027-01-01') })
    const f = forecastByMonth([a, b], '2026-12-15', 3)
    expect(f.months.map((m) => [m.competence, m.totalCents])).toEqual([['2026-12', 1000], ['2027-01', 2000], ['2027-02', 0]])
  })
})

describe('histórico de cobranças', () => {
  const log = (date: string, channel: 'whatsapp' | 'email' | 'copia' = 'whatsapp') => ({ date, channel, totalCents: 8400, overdue: true })

  it('guarda só as últimas 30 cobranças', () => {
    let list = addCharge(undefined, log('2026-01-01'))
    expect(list).toHaveLength(1)
    for (let i = 0; i < 35; i++) list = addCharge(list, log(`2026-02-${String((i % 28) + 1).padStart(2, '0')}`))
    expect(list).toHaveLength(30)
  })

  it('diz há quanto tempo foi a última cobrança e por onde', () => {
    expect(lastChargeText([], '2026-11-09')).toBeNull()
    expect(lastChargeText(undefined, '2026-11-09')).toBeNull()
    const list = [log('2026-11-01', 'email'), log('2026-11-06', 'whatsapp')]
    expect(lastChargeText(list, '2026-11-09')).toBe('Última cobrança: há 3 dias por WhatsApp')
    expect(lastChargeText([log('2026-11-08', 'email')], '2026-11-09')).toBe('Última cobrança: ontem por e-mail')
    expect(lastChargeText([log('2026-11-09', 'copia')], '2026-11-09')).toBe('Última cobrança: hoje com a mensagem copiada')
    expect(daysAgoText(1)).toBe('ontem')
    expect(channelVia('email')).toBe('por e-mail')
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
      'Oi, Ana! Tudo bem? 😊 Não achei aqui o pagamento da parcela 3 de 10 (Tênis), de R$ 42,00, que venceu em 05/11/2026. Se você já pagou, me avisa que eu dou baixa por aqui! Se ainda não deu, me conta quando consegue? Valeu!',
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
    expect(text).toContain('Oi, Ana! Tudo bem? 😊 Não achei aqui o pagamento destas parcelas:')
    expect(text).toContain('• Tênis: parcelas 1, 2 e 3 de 10, R$ 126,00 (a mais antiga venceu em 05/09/2026)')
    expect(text).toContain('• Celular: parcela 1 de 12, R$ 100,00 (venceu em 01/11/2026)')
    expect(text).toContain('Total: R$ 226,00. Se você já pagou, me avisa que eu dou baixa por aqui!')
    expect(m.totalCents).toBe(22600)
  })

  it('sem atraso vira lembrete da próxima parcela', () => {
    const r = purchase({ installments: buildInstallments(42000, 10, '2026-12-05') })
    const m = chargeMessage(person, [r], today)!
    expect(m.kind).toBe('reminder')
    expect(flat(m.text)).toBe(
      'Oi, Ana! Tudo bem? 😊 Só passando pra lembrar da parcela 1 de 10 (Tênis), de R$ 42,00, que vence em 05/12/2026. Valeu!',
    )
  })

  const servicoVencido = () => {
    const r = purchase({
      kind: 'servico',
      description: 'Instalação',
      installmentCount: 3,
      totalCents: 30000,
      installments: buildInstallments(30000, 3, '2026-10-01'),
    })
    r.installments = r.installments.map((i) => (i.number === 1 ? { ...i, paidAt: i.dueDate, paidAmountCents: i.amountCents } : i))
    return r
  }

  it('o tom padrão é amigável, também para serviço, que diz "do serviço"', () => {
    expect(personTone(person)).toBe('amigavel')
    expect(flat(chargeMessage(person, [servicoVencido()], today)!.text)).toBe(
      'Oi, Ana! Tudo bem? 😊 Não achei aqui o pagamento da parcela 2 de 3 do serviço (Instalação), de R$ 100,00, que venceu em 01/11/2026. Se você já pagou, me avisa que eu dou baixa por aqui! Se ainda não deu, me conta quando consegue? Valeu!',
    )
  })

  it('tom profissional, escolhido para a pessoa, usa a mensagem mais formal', () => {
    const formal: Person = { ...person, tone: 'profissional' }
    expect(personTone(formal)).toBe('profissional')
    expect(flat(chargeMessage(formal, [servicoVencido()], today)!.text)).toBe(
      'Oi, Ana! Tudo bem? Não localizei o pagamento da parcela 2 de 3 do serviço (Instalação), no valor de R$ 100,00, que venceu em 01/11/2026. Pode me confirmar se já foi pago ou quando consegue pagar? Obrigado!',
    )
    const futuro = purchase({ installments: buildInstallments(42000, 10, '2026-12-05') })
    expect(flat(chargeMessage(formal, [futuro], today)!.text)).toBe(
      'Oi, Ana! Tudo bem? Passando para lembrar da parcela 1 de 10 (Tênis), de R$ 42,00, com vencimento em 05/12/2026. Obrigado!',
    )
    const duas = chargeMessage(formal, [purchase(), purchase({ id: 'r2', description: 'Celular' })], today)!
    expect(flat(duas.text)).toContain('Não localizei o pagamento destas parcelas:')
    expect(flat(duas.text)).not.toContain('😊')
  })

  it('não gera mensagem quando tudo foi recebido', () => {
    const r = purchase()
    r.installments = r.installments.map((i) => ({ ...i, paidAt: i.dueDate, paidAmountCents: i.amountCents }))
    expect(chargeMessage(person, [r], today)).toBeNull()
    expect(chargeMessage(person, [], today)).toBeNull()
  })
})
