import { describe, expect, it } from 'vitest'
import {
  FALLBACK_CATEGORY,
  addCategory,
  addPayment,
  addSupplier,
  availableTemplates,
  countBills,
  defaultRegistry,
  missingDefaultTemplates,
  normalizeRegistry,
  paymentLabel,
  removeCategory,
  removePayment,
  removeSupplier,
  removeTemplate,
  renameCategory,
  renamePayment,
  renameSupplier,
  saveTemplate,
  supplierSuggestions,
  type Registry,
  type Result,
  type TemplateInput,
} from './registry'
import type { Bill } from './types'

/** Desembrulha o resultado esperado como sucesso. */
function good(result: Result<Registry>): Registry {
  if (!result.ok) throw new Error(`esperava sucesso, veio: ${result.error}`)
  return result.value
}
function bad(result: Result<Registry>): string {
  if (result.ok) throw new Error('esperava erro')
  return result.error
}

const bill = (over: Partial<Bill> = {}): Bill => ({
  id: 'b1',
  name: 'Luz',
  category: 'Contas de consumo',
  supplier: '',
  valueType: 'fixed',
  expectedAmountCents: 100,
  dueDay: 5,
  recurrence: 'monthly',
  startMonth: '2026-01',
  paymentMethod: 'boleto',
  notes: '',
  active: true,
  ...over,
})

const input = (over: Partial<TemplateInput> = {}): TemplateInput => ({
  name: 'Clube',
  category: 'Lazer',
  amountCents: 0,
  dueDay: null,
  recurrence: 'monthly',
  valueType: 'fixed',
  paymentMethod: 'boleto',
  supplier: '',
  ...over,
})

describe('padrões', () => {
  it('traz as categorias de antes mais Transporte, Financiamentos e empréstimos, Pets e Lazer, com Outros por último', () => {
    const { categories } = defaultRegistry()
    expect(categories).toHaveLength(14)
    for (const c of ['Transporte', 'Financiamentos e empréstimos', 'Pets', 'Lazer', 'Moradia', 'Impostos']) expect(categories).toContain(c)
    expect(categories[categories.length - 1]).toBe(FALLBACK_CATEGORY)
  })

  it('mantém os códigos das formas de pagamento que as contas antigas já usam', () => {
    expect(defaultRegistry().payments).toEqual([
      { id: 'boleto', label: 'Boleto' },
      { id: 'debito_automatico', label: 'Débito automático' },
      { id: 'pix', label: 'PIX' },
      { id: 'cartao', label: 'Cartão' },
    ])
  })

  it('traz os 10 atalhos de antes e cerca de 20 novos, todos em categorias que existem', () => {
    const reg = defaultRegistry()
    const names = reg.templates.map((t) => t.name)
    for (const n of ['Energia elétrica', 'Água e esgoto', 'Internet', 'Celular', 'Aluguel', 'Condomínio', 'Cartão de crédito', 'Plano de saúde', 'Escola', 'IPTU']) {
      expect(names).toContain(n)
    }
    for (const n of ['Gás', 'Financiamento do imóvel', 'Diarista', 'Seguro residencial', 'Streaming', 'TV por assinatura', 'Academia', 'IPVA', 'Seguro do carro', 'Parcela do carro', 'Estacionamento', 'DAS do MEI', 'Imposto de Renda (cota)', 'Plano odontológico', 'Faculdade ou curso', 'Idiomas', 'Previdência privada', 'Consórcio', 'Empréstimo', 'Pet', 'Contador']) {
      expect(names).toContain(n)
    }
    expect(reg.templates.length).toBeGreaterThanOrEqual(30)
    expect(new Set(reg.templates.map((t) => t.id)).size).toBe(reg.templates.length)
    for (const t of reg.templates) {
      expect(reg.categories).toContain(t.category)
      expect(reg.payments.map((p) => p.id)).toContain(t.paymentMethod)
    }
  })

  it('cada chamada devolve uma cópia nova', () => {
    const a = defaultRegistry()
    a.categories.push('X')
    expect(defaultRegistry().categories).not.toContain('X')
  })
})

describe('leitura do que veio do banco', () => {
  it('sem nada, vale o padrão', () => {
    expect(normalizeRegistry(undefined)).toEqual(defaultRegistry())
    expect(normalizeRegistry(null)).toEqual(defaultRegistry())
    expect(normalizeRegistry({})).toEqual(defaultRegistry())
    expect(normalizeRegistry('lixo')).toEqual(defaultRegistry())
  })

  it('lista de atalhos vazia, salva de propósito, continua vazia', () => {
    const reg = normalizeRegistry({ ...defaultRegistry(), templates: [] })
    expect(reg.templates).toEqual([])
  })

  it('limpa duplicados e vazios, e garante a categoria Outros', () => {
    const reg = normalizeRegistry({ categories: ['Viagens', ' viagens ', '', 'Casa', 42] })
    expect(reg.categories).toEqual(['Viagens', 'Casa', FALLBACK_CATEGORY])
  })

  it('formas de pagamento inválidas ou vazias voltam ao padrão', () => {
    expect(normalizeRegistry({ payments: [{ id: '', label: 'x' }, 7] }).payments).toEqual(defaultRegistry().payments)
    expect(normalizeRegistry({ payments: [{ id: 'p_x', label: 'X' }, { id: 'p_x', label: 'Y' }] }).payments).toEqual([{ id: 'p_x', label: 'X' }])
  })

  it('conserta atalho com categoria ou forma que não existe mais e dia/valor fora do limite', () => {
    const reg = normalizeRegistry({
      categories: ['Casa'],
      payments: [{ id: 'pix', label: 'PIX' }],
      templates: [{ id: 'a', name: 'Luz', category: 'Sumiu', paymentMethod: 'sumiu', dueDay: 40, amountCents: -5, recurrence: 'x', valueType: 'x' }],
    })
    expect(reg.templates[0]).toMatchObject({ category: FALLBACK_CATEGORY, paymentMethod: 'pix', dueDay: null, amountCents: 0, recurrence: 'monthly', valueType: 'fixed' })
  })
})

describe('categorias', () => {
  it('adiciona antes de Outros e recusa vazio, repetido (sem ligar para acento ou caixa) e nome longo', () => {
    const reg = good(addCategory(defaultRegistry(), '  Viagens  '))
    expect(reg.categories.slice(-2)).toEqual(['Viagens', FALLBACK_CATEGORY])
    expect(bad(addCategory(reg, '   '))).toBe('Escreva um nome.')
    expect(bad(addCategory(reg, '***'))).toBe('Use letras ou números no nome.')
    expect(bad(addCategory(reg, 'viagens'))).toBe('Já existe “viagens”.')
    expect(bad(addCategory(reg, 'EDUCACAO'))).toContain('Já existe')
    expect(bad(addCategory(reg, 'x'.repeat(41)))).toBe('Use até 40 letras.')
  })

  it('renomeia e leva junto os atalhos que usavam o nome antigo', () => {
    const reg = good(renameCategory(defaultRegistry(), 'Moradia', 'Casa'))
    expect(reg.categories).toContain('Casa')
    expect(reg.categories).not.toContain('Moradia')
    expect(reg.templates.find((t) => t.name === 'Aluguel')?.category).toBe('Casa')
  })

  it('aceita mudar só a caixa do próprio nome, mas não repetir o de outra categoria', () => {
    expect(good(renameCategory(defaultRegistry(), 'Saúde', 'SAÚDE')).categories).toContain('SAÚDE')
    expect(bad(renameCategory(defaultRegistry(), 'Saúde', 'Seguros'))).toBe('Já existe “Seguros”.')
  })

  it('Outros não muda nem sai', () => {
    expect(bad(renameCategory(defaultRegistry(), FALLBACK_CATEGORY, 'Diversos'))).toContain('categoria padrão')
    expect(bad(removeCategory(defaultRegistry(), FALLBACK_CATEGORY, 'Saúde'))).toContain('categoria padrão')
  })

  it('exclui movendo os atalhos para a categoria escolhida', () => {
    const reg = good(removeCategory(defaultRegistry(), 'Pets', FALLBACK_CATEGORY))
    expect(reg.categories).not.toContain('Pets')
    expect(reg.templates.find((t) => t.name === 'Pet')?.category).toBe(FALLBACK_CATEGORY)
  })

  it('exclusão exige um destino que exista e seja outro', () => {
    expect(bad(removeCategory(defaultRegistry(), 'Pets', 'Pets'))).toBe('Escolha para qual categoria mover.')
    expect(bad(removeCategory(defaultRegistry(), 'Pets', 'Nada'))).toBe('Escolha para qual categoria mover.')
    expect(bad(removeCategory(defaultRegistry(), 'Nada', 'Saúde'))).toContain('não existe mais')
    expect(bad(renameCategory(defaultRegistry(), 'Nada', 'X'))).toContain('não existe mais')
  })
})

describe('formas de pagamento', () => {
  it('cria com código próprio e sem repetir códigos', () => {
    let reg = good(addPayment(defaultRegistry(), 'Transferência'))
    expect(reg.payments[4]).toEqual({ id: 'p_transferencia', label: 'Transferência' })
    reg = good(removePayment(reg, 'p_transferencia', 'pix'))
    reg = good(addPayment(reg, 'Transferência'))
    expect(reg.payments[4].id).toBe('p_transferencia')
    expect(bad(addPayment(reg, 'transferencia'))).toContain('Já existe')
  })

  it('renomear muda só o nome; o código das contas continua valendo', () => {
    const reg = good(renamePayment(defaultRegistry(), 'cartao', 'Cartão de crédito'))
    expect(paymentLabel(reg, 'cartao')).toBe('Cartão de crédito')
    expect(bad(renamePayment(reg, 'pix', 'boleto'))).toBe('Já existe “boleto”.')
  })

  it('exclui movendo os atalhos; sempre sobra pelo menos uma', () => {
    const reg = good(removePayment(defaultRegistry(), 'cartao', 'pix'))
    expect(reg.payments.map((p) => p.id)).toEqual(['boleto', 'debito_automatico', 'pix'])
    expect(reg.templates.find((t) => t.name === 'Streaming')?.paymentMethod).toBe('pix')
    const one: Registry = { ...defaultRegistry(), payments: [{ id: 'pix', label: 'PIX' }] }
    expect(bad(removePayment(one, 'pix', 'pix'))).toBe('Precisa sobrar pelo menos uma forma de pagamento.')
    expect(bad(removePayment(defaultRegistry(), 'cartao', 'cartao'))).toBe('Escolha para qual forma mover.')
  })

  it('mostra o próprio código quando a forma não existe mais', () => {
    expect(paymentLabel(defaultRegistry(), 'pix')).toBe('PIX')
    expect(paymentLabel(defaultRegistry(), 'sumiu')).toBe('sumiu')
  })
})

describe('fornecedores', () => {
  it('cria, renomeia (nos atalhos também) e exclui', () => {
    let reg = good(addSupplier(defaultRegistry(), 'Enel'))
    expect(reg.suppliers).toEqual(['Enel'])
    expect(bad(addSupplier(reg, 'enel'))).toBe('Já existe “enel”.')
    reg = good(saveTemplate(reg, input({ name: 'Luz', supplier: 'Enel' })))
    reg = good(renameSupplier(reg, 'Enel', 'Enel SP'))
    expect(reg.suppliers).toEqual(['Enel SP'])
    expect(reg.templates.find((t) => t.name === 'Luz')?.supplier).toBe('Enel SP')
    reg = good(removeSupplier(reg, 'Enel SP'))
    expect(reg.suppliers).toEqual([])
    expect(bad(removeSupplier(reg, 'Enel SP'))).toContain('não existe mais')
  })

  it('as sugestões juntam os cadastrados e os já usados nas contas, sem repetir', () => {
    const reg = good(addSupplier(defaultRegistry(), 'Sabesp'))
    const list = supplierSuggestions(reg, [bill({ supplier: 'Enel' }), bill({ supplier: 'sabesp' }), bill({ supplier: '' })])
    expect(list).toEqual(['Enel', 'Sabesp'])
  })
})

describe('atalhos de conta', () => {
  it('cria com valor e dia opcionais', () => {
    const reg = good(saveTemplate(defaultRegistry(), input({ name: 'Clube', amountCents: 15000, dueDay: 10 })))
    const t = reg.templates[reg.templates.length - 1]
    expect(t).toMatchObject({ name: 'Clube', category: 'Lazer', amountCents: 15000, dueDay: 10 })
    expect(t.id).toBeTruthy()
  })

  it('edita o atalho pelo código e permite manter o próprio nome', () => {
    let reg = good(saveTemplate(defaultRegistry(), input()))
    const id = reg.templates[reg.templates.length - 1].id
    reg = good(saveTemplate(reg, input({ id, amountCents: 9000, supplier: ' Clube X ' })))
    const edited = reg.templates.find((t) => t.id === id)
    expect(edited).toMatchObject({ amountCents: 9000, supplier: 'Clube X' })
    expect(reg.templates.filter((t) => t.name === 'Clube')).toHaveLength(1)
  })

  it('valida nome, repetição, categoria, forma, valor e dia', () => {
    const reg = defaultRegistry()
    expect(bad(saveTemplate(reg, input({ name: '' })))).toBe('Escreva um nome.')
    expect(bad(saveTemplate(reg, input({ name: 'energia eletrica' })))).toContain('Já existe')
    expect(bad(saveTemplate(reg, input({ name: 'x'.repeat(61) })))).toBe('Use até 60 letras.')
    expect(bad(saveTemplate(reg, input({ category: 'Nada' })))).toBe('Escolha uma categoria da lista.')
    expect(bad(saveTemplate(reg, input({ paymentMethod: 'nada' })))).toBe('Escolha uma forma de pagamento da lista.')
    expect(bad(saveTemplate(reg, input({ amountCents: -1 })))).toBe('O valor não pode ser negativo.')
    expect(bad(saveTemplate(reg, input({ dueDay: 32 })))).toBe('O dia do vencimento deve ser de 1 a 31.')
    expect(bad(saveTemplate(reg, input({ dueDay: 0 })))).toBe('O dia do vencimento deve ser de 1 a 31.')
    expect(bad(saveTemplate(reg, input({ id: 'nao-existe' })))).toBe('Esse atalho não existe mais.')
  })

  it('exclui e recupera os atalhos padrão que faltam, sem duplicar nem mexer nos da pessoa', () => {
    let reg = removeTemplate(defaultRegistry(), 'padrao-gas')
    reg = good(saveTemplate(reg, input({ name: 'Meu atalho' })))
    expect(reg.templates.find((t) => t.name === 'Gás')).toBeUndefined()
    const missing = missingDefaultTemplates(reg)
    expect(missing.map((t) => t.name)).toEqual(['Gás'])
    expect(missingDefaultTemplates(defaultRegistry())).toEqual([])
  })

  it('recuperar um padrão cuja categoria foi apagada o coloca em Outros', () => {
    let reg = good(removeCategory(defaultRegistry(), 'Pets', FALLBACK_CATEGORY))
    reg = removeTemplate(reg, 'padrao-pet')
    expect(missingDefaultTemplates(reg)[0]).toMatchObject({ name: 'Pet', category: FALLBACK_CATEGORY })
  })

  it('o atalho some da lista de "Nova conta" quando a conta já está cadastrada (sem ligar para acento ou caixa)', () => {
    const reg = defaultRegistry()
    const shown = availableTemplates(reg.templates, [bill({ name: 'energia ELETRICA' }), bill({ name: 'Condomínio' })])
    const names = shown.map((t) => t.name)
    expect(names).not.toContain('Energia elétrica')
    expect(names).not.toContain('Condomínio')
    expect(names).toContain('Aluguel')
    expect(shown).toHaveLength(reg.templates.length - 2)
  })
})

describe('uso', () => {
  it('conta quantas contas usam a categoria, a forma e o fornecedor', () => {
    const bills = [
      bill({ id: '1', category: 'Pets', paymentMethod: 'pix', supplier: 'Petz' }),
      bill({ id: '2', category: 'Pets', paymentMethod: 'boleto', supplier: ' PETZ ' }),
      bill({ id: '3' }),
    ]
    expect(countBills(bills, 'category', 'Pets')).toBe(2)
    expect(countBills(bills, 'paymentMethod', 'pix')).toBe(1)
    expect(countBills(bills, 'supplier', 'petz')).toBe(2)
    expect(countBills(bills, 'supplier', '')).toBe(0)
  })
})
