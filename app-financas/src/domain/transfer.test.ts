import { describe, expect, it } from 'vitest'
import { decodeCsvBytes, detectDelimiter, parseCsv, protectCell, toCsv, unprotectCell } from './csv'
import {
  MAX_IMPORT_ROWS,
  billsTemplateCsv,
  billsToCsv,
  parseBillsCsv,
  parseDateInput,
  parseMonthInput,
  parseReceivablesCsv,
  receivablesTemplateCsv,
  receivablesToCsv,
} from './transfer'
import { buildInstallments, withPayment } from './receivables'
import { addCategory, addPayment, defaultRegistry, removePayment, renamePayment } from './registry'
import type { Bill, Person, Receivable } from './types'

const TODAY = '2026-11-09'

const bytes = (...values: number[]) => new Uint8Array(values)

describe('csv: leitura', () => {
  it('lê separador ;, aspas, aspas duplas e quebra de linha dentro de aspas', () => {
    const text = 'Nome;Obs\r\n"Luz; água";"disse ""oi""\nde novo"\r\nGás;ok\r\n'
    const { rows, lines, unterminated } = parseCsv(text)
    expect(rows).toEqual([
      ['Nome', 'Obs'],
      ['Luz; água', 'disse "oi"\nde novo'],
      ['Gás', 'ok'],
    ])
    expect(lines).toEqual([1, 2, 4])
    expect(unterminated).toBe(false)
  })

  it('descobre o separador pela primeira linha e ignora BOM e linhas vazias', () => {
    expect(detectDelimiter('Nome,Valor\nLuz,10')).toBe(',')
    expect(detectDelimiter('Nome;Valor\nLuz;10')).toBe(';')
    expect(detectDelimiter('Nome\tValor')).toBe('\t')
    expect(detectDelimiter('"A,B";C')).toBe(';')
    const { rows } = parseCsv('﻿Nome,Valor\n\n\nLuz,"1,5"\n')
    expect(rows).toEqual([
      ['Nome', 'Valor'],
      ['Luz', '1,5'],
    ])
  })

  it('avisa quando as aspas ficam abertas', () => {
    expect(parseCsv('a;b\n"c;d').unterminated).toBe(true)
  })

  it('lê UTF-8 (com BOM) e Windows-1252, o "CSV" do Excel brasileiro', () => {
    expect(decodeCsvBytes(bytes(0xef, 0xbb, 0xbf, 0x53, 0xc3, 0xa7))).toBe('Sç')
    expect(decodeCsvBytes(bytes(0x53, 0x65, 0x72, 0x76, 0x69, 0xe7, 0x6f))).toBe('Serviço')
  })
})

describe('csv: gravação', () => {
  it('usa ;, CRLF e BOM, e coloca aspas só onde precisa', () => {
    const csv = toCsv([
      ['Nome', 'Obs'],
      ['Luz; água', 'disse "oi"'],
      ['Gás', ''],
    ])
    expect(csv).toBe('﻿Nome;Obs\r\n"Luz; água";"disse ""oi"""\r\nGás;\r\n')
  })

  it('protege texto que o Excel executaria como fórmula, e desfaz na leitura', () => {
    expect(protectCell('=SOMA(A1)')).toBe("'=SOMA(A1)")
    expect(protectCell('+55 11')).toBe("'+55 11")
    expect(protectCell('Aluguel')).toBe('Aluguel')
    expect(unprotectCell("'=SOMA(A1)")).toBe('=SOMA(A1)')
    expect(unprotectCell("'Aluguel")).toBe("'Aluguel")
    const { rows } = parseCsv(toCsv([['@alvo'], ['ok']]))
    expect(rows[0].map(unprotectCell)).toEqual(['@alvo'])
  })
})

describe('datas e meses', () => {
  it('aceita os formatos de planilha e recusa data que não existe', () => {
    expect(parseDateInput('05/09/2026')).toBe('2026-09-05')
    expect(parseDateInput('5/9/26')).toBe('2026-09-05')
    expect(parseDateInput('2026-09-05')).toBe('2026-09-05')
    expect(parseDateInput('05/09/2026 00:00')).toBe('2026-09-05')
    expect(parseDateInput('29/02/2028')).toBe('2028-02-29')
    expect(parseDateInput('31/02/2026')).toBeNull()
    expect(parseDateInput('32/01/2026')).toBeNull()
    expect(parseDateInput('abc')).toBeNull()
  })

  it('aceita mês em vários formatos, inclusive o que o Excel devolve', () => {
    expect(parseMonthInput('11/2026')).toBe('2026-11')
    expect(parseMonthInput('2026-11')).toBe('2026-11')
    expect(parseMonthInput('nov/2026')).toBe('2026-11')
    expect(parseMonthInput('nov/26')).toBe('2026-11')
    expect(parseMonthInput('Março/2027')).toBe('2027-03')
    expect(parseMonthInput('01/11/2026')).toBe('2026-11')
    expect(parseMonthInput('13/2026')).toBeNull()
    expect(parseMonthInput('xyz/2026')).toBeNull()
  })
})

const luz: Bill = {
  id: 'b1',
  name: 'Energia elétrica',
  category: 'Contas de consumo',
  supplier: 'Companhia; Luz',
  valueType: 'variable',
  expectedAmountCents: 18000,
  dueDay: 10,
  recurrence: 'monthly',
  startMonth: '2026-01',
  paymentMethod: 'boleto',
  notes: 'Conferir "bandeira"',
  active: true,
  skippedMonths: [],
}
const seguro: Bill = {
  id: 'b2',
  name: 'Seguro do carro',
  category: 'Seguros',
  supplier: '',
  valueType: 'fixed',
  expectedAmountCents: 123456,
  dueDay: 31,
  recurrence: 'yearly',
  startMonth: '2026-03',
  paymentMethod: 'debito_automatico',
  notes: '',
  active: false,
  skippedMonths: [],
}

const withoutId = ({ id: _id, ...rest }: Bill) => rest

describe('contas a pagar (CSV)', () => {
  it('exporta e importa de volta sem perder nada', () => {
    const plan = parseBillsCsv(billsToCsv([luz, seguro]), [], TODAY)
    expect(plan.fileError).toBeNull()
    expect(plan.errors).toEqual([])
    expect(plan.warnings).toEqual([])
    expect(plan.bills).toEqual([withoutId(luz), withoutId(seguro)])
  })

  it('importar de novo o que já existe não duplica', () => {
    const plan = parseBillsCsv(billsToCsv([luz, seguro]), [luz, seguro], TODAY)
    expect(plan.bills).toEqual([])
    expect(plan.duplicates).toBe(2)
  })

  it('repetida dentro do próprio arquivo conta uma vez só', () => {
    const csv = 'Nome;Valor;Dia do vencimento\nInternet;99,90;5\ninternet;99,90;5\nInternet;99,90;20\n'
    const plan = parseBillsCsv(csv, [], TODAY)
    expect(plan.bills.map((b) => `${b.name}/${b.dueDay}`)).toEqual(['Internet/5', 'Internet/20'])
    expect(plan.duplicates).toBe(1)
  })

  it('lê o CSV do Excel brasileiro: ordem livre, milhar, acento e caixa', () => {
    const csv = [
      'dia do vencimento;NOME;valor;forma de pagamento;periodicidade;categoria;Início',
      '7;Escola;"1.234,56";Débito Automático;mensal;educação;fev/26',
    ].join('\r\n')
    const plan = parseBillsCsv(csv, [], TODAY)
    expect(plan.errors).toEqual([])
    expect(plan.bills).toEqual([
      {
        name: 'Escola',
        category: 'Educação',
        supplier: '',
        valueType: 'fixed',
        expectedAmountCents: 123456,
        dueDay: 7,
        recurrence: 'monthly',
        startMonth: '2026-02',
        paymentMethod: 'debito_automatico',
        notes: '',
        active: true,
        skippedMonths: [],
      },
    ])
  })

  it('lê o CSV do Google Planilhas (separado por vírgula)', () => {
    const plan = parseBillsCsv('Nome,Valor,Dia do vencimento\nLuz,"180,5",10\n', [], TODAY)
    expect(plan.errors).toEqual([])
    expect(plan.bills[0]).toMatchObject({ name: 'Luz', expectedAmountCents: 18050, dueDay: 10 })
  })

  it('preenche o que faltou: mês atual, mensal, boleto, ativa; tipo pelo valor', () => {
    const plan = parseBillsCsv('Nome;Valor;Dia do vencimento\nAluguel;1500;5\nÁgua;;12\n', [], TODAY)
    expect(plan.bills[0]).toMatchObject({
      valueType: 'fixed',
      startMonth: '2026-11',
      recurrence: 'monthly',
      paymentMethod: 'boleto',
      active: true,
      category: 'Outros',
    })
    expect(plan.bills[1]).toMatchObject({ valueType: 'variable', expectedAmountCents: 0 })
  })

  it('categoria desconhecida vira Outros, com aviso', () => {
    const plan = parseBillsCsv('Nome;Categoria;Dia do vencimento;Valor\nPasseio;Viagens;3;80\n', [], TODAY)
    expect(plan.bills[0].category).toBe('Outros')
    expect(plan.warnings).toEqual([{ line: 2, message: 'categoria “Viagens” não existe; usei “Outros”' }])
  })

  it('aceita as categorias e formas de pagamento que a pessoa cadastrou', () => {
    let reg = defaultRegistry()
    const withTrips = addCategory(reg, 'Viagens')
    const withTransfer = withTrips.ok ? addPayment(withTrips.value, 'Transferência') : withTrips
    if (!withTransfer.ok) throw new Error(withTransfer.error)
    reg = withTransfer.value
    const csv = 'Nome;Categoria;Forma de pagamento;Dia do vencimento;Valor\nPasseio;viagens;transferencia;3;80\nLuz;Pets;PIX;5;10\n'
    const plan = parseBillsCsv(csv, [], TODAY, reg)
    expect(plan.errors).toEqual([])
    expect(plan.bills[0]).toMatchObject({ category: 'Viagens', paymentMethod: 'p_transferencia' })
    expect(plan.bills[1]).toMatchObject({ category: 'Pets', paymentMethod: 'pix' })
  })

  it('sem o cadastro da pessoa, vale o padrão; e uma forma que ela apagou deixa de ser aceita', () => {
    const removed = removePayment(defaultRegistry(), 'cartao', 'boleto')
    if (!removed.ok) throw new Error(removed.error)
    const plan = parseBillsCsv('Nome;Forma de pagamento;Dia do vencimento;Valor\nLuz;Cartão;5;10\n', [], TODAY, removed.value)
    expect(plan.bills).toEqual([])
    expect(plan.errors[0].message).toContain('forma de pagamento “Cartão” não reconhecida (Boleto, Débito automático ou PIX)')
  })

  it('o apelido "débito" continua valendo e a exportação usa o nome cadastrado da forma de pagamento', () => {
    const plan = parseBillsCsv('Nome;Forma de pagamento;Dia do vencimento;Valor\nLuz;débito;5;10\n', [], TODAY)
    expect(plan.bills[0].paymentMethod).toBe('debito_automatico')
    const renamed = renamePayment(defaultRegistry(), 'pix', 'Pix instantâneo')
    if (!renamed.ok) throw new Error(renamed.error)
    const csv = billsToCsv([{ ...luz, paymentMethod: 'pix' }], renamed.value)
    expect(csv).toContain('Pix instantâneo')
  })

  it('recusa linhas com problema e diz qual linha e por quê', () => {
    const csv = [
      'Nome;Valor;Dia do vencimento;Periodicidade;Início;Forma de pagamento;Tipo de valor;Ativa',
      ';10;5;;;;;',
      'Luz;abc;5;;;;;',
      'Gás;10;40;;;;;',
      'Net;10;5;quinzenal;;;;',
      'Tel;10;5;;13/2026;;;',
      'Cel;10;5;;;ouro;;',
      'Seguro;0;5;;;;Fixo;',
      'Água;10;5;;;;;talvez',
      'Certa;10;5;;;;;',
    ].join('\n')
    const plan = parseBillsCsv(csv, [], TODAY)
    expect(plan.total).toBe(9)
    expect(plan.bills.map((b) => b.name)).toEqual(['Certa'])
    expect(plan.errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6, 7, 8, 9])
    const text = Object.fromEntries(plan.errors.map((e) => [e.line, e.message]))
    expect(text[2]).toContain('nome vazio')
    expect(text[3]).toContain('valor inválido “abc”')
    expect(text[4]).toContain('deve ser de 1 a 31')
    expect(text[5]).toContain('periodicidade “quinzenal”')
    expect(text[6]).toContain('início “13/2026” inválido')
    expect(text[7]).toContain('forma de pagamento “ouro”')
    expect(text[8]).toContain('valor fixo precisa de valor maior que zero')
    expect(text[9]).toContain('“Ativa” deve ser Sim ou Não')
  })

  it('informa quando falta coluna, arquivo vazio, só cabeçalho e arquivo grande demais', () => {
    expect(parseBillsCsv('Nome;Valor\nLuz;10\n', [], TODAY).fileError).toContain('“Dia do vencimento”')
    expect(parseBillsCsv('', [], TODAY).fileError).toBe('O arquivo está vazio.')
    expect(parseBillsCsv('Nome;Dia do vencimento\n', [], TODAY).fileError).toContain('só o cabeçalho')
    const many = ['Nome;Valor;Dia do vencimento']
    for (let i = 0; i <= MAX_IMPORT_ROWS; i += 1) many.push(`Conta ${i};10;5`)
    expect(parseBillsCsv(many.join('\n'), [], TODAY).fileError).toContain(`${MAX_IMPORT_ROWS}`)
    expect(parseBillsCsv('Nome;Dia do vencimento\n"Luz;5', [], TODAY).fileError).toContain('aspas abertas')
  })

  it('aceita o dia do vencimento como data completa', () => {
    const plan = parseBillsCsv('Nome;Valor;Dia do vencimento\nLuz;10;15/11/2026\n', [], TODAY)
    expect(plan.bills[0].dueDay).toBe(15)
  })

  it('o modelo para baixar é válido e tem exemplos', () => {
    const plan = parseBillsCsv(billsTemplateCsv(), [], TODAY)
    expect(plan.errors).toEqual([])
    expect(plan.fileError).toBeNull()
    expect(plan.bills).toHaveLength(2)
  })

  it('texto com fórmula sobrevive à ida e volta', () => {
    const risky: Bill = { ...luz, name: '=Aluguel', notes: '-ok' }
    const csv = billsToCsv([risky])
    expect(csv).toContain("'=Aluguel")
    const plan = parseBillsCsv(csv, [], TODAY)
    expect(plan.bills[0]).toMatchObject({ name: '=Aluguel', notes: '-ok' })
  })
})

const ana: Person = { id: 'p1', name: 'Ana Souza', phone: '11987654321', email: 'ana@exemplo.com', charges: [], tone: 'amigavel' }

const tenis = (): Receivable => ({
  id: 'r1',
  personId: 'p1',
  kind: 'cartao',
  description: 'Tênis',
  totalCents: 42000,
  installmentCount: 10,
  firstDueDate: '2026-09-05',
  installments: withPayment(buildInstallments(42000, 10, '2026-09-05'), 1, { paidAt: '2026-09-05', paidAmountCents: 4200 }),
  notes: 'Nike',
})

const instalacao = (): Receivable => ({
  id: 'r2',
  personId: 'p1',
  kind: 'servico',
  description: 'Instalação',
  totalCents: 90000,
  installmentCount: 3,
  firstDueDate: '2026-10-15',
  installments: buildInstallments(90000, 3, '2026-10-15'),
  notes: '',
})

describe('a receber (CSV)', () => {
  it('exporta uma linha por compra, com o que já foi recebido', () => {
    const { rows } = parseCsv(receivablesToCsv([tenis(), instalacao()], [ana], TODAY))
    expect(rows[0]).toEqual([
      'Pessoa',
      'Telefone',
      'E-mail',
      'Tipo',
      'Descrição',
      'Valor total',
      'Parcelas',
      'Primeiro vencimento',
      'Parcelas recebidas',
      'Observações',
      'Recebido',
      'A receber',
      'Situação',
    ])
    expect(rows[1].slice(3)).toEqual(['Cartão', 'Tênis', '420,00', '10', '05/09/2026', '1', 'Nike', '42,00', '378,00', 'Atrasada'])
    expect(rows[2]).toEqual([
      'Ana Souza',
      '(11) 98765-4321',
      'ana@exemplo.com',
      'Serviço',
      'Instalação',
      '900,00',
      '3',
      '15/10/2026',
      '0',
      '',
      '0,00',
      '900,00',
      'Atrasada',
    ])
  })

  it('importa de volta: pessoa nova com contato, parcelas e baixa das primeiras', () => {
    const plan = parseReceivablesCsv(receivablesToCsv([tenis(), instalacao()], [ana], TODAY), [], [], TODAY)
    expect(plan.errors).toEqual([])
    expect(plan.newPeople).toEqual([
      {
        key: 'anasouza',
        person: { name: 'Ana Souza', phone: '11987654321', email: 'ana@exemplo.com', charges: [], tone: 'amigavel' },
      },
    ])
    expect(plan.items).toHaveLength(2)
    expect(plan.items.every((i) => i.personId === null && i.personKey === 'anasouza')).toBe(true)
    const [cartao, servico] = plan.items.map((i) => i.receivable)
    expect(servico.kind).toBe('servico')
    expect(cartao.kind).toBe('cartao')
    expect(cartao.installments).toHaveLength(10)
    expect(cartao.installments[0]).toMatchObject({ paidAt: '2026-09-05', paidAmountCents: 4200 })
    expect(cartao.installments[1].paidAt).toBeNull()
    expect(cartao.installments.reduce((s, i) => s + i.amountCents, 0)).toBe(42000)
    expect(cartao.notes).toBe('Nike')
  })

  it('reconhece a pessoa já cadastrada, sem acento nem caixa, e não mexe no contato dela', () => {
    const csv = 'Pessoa;Telefone;Descrição;Valor total;Parcelas;Primeiro vencimento\nana souza;21999998888;Bolsa;300;3;01/12/2026\n'
    const plan = parseReceivablesCsv(csv, [ana], [], TODAY)
    expect(plan.newPeople).toEqual([])
    expect(plan.items[0].personId).toBe('p1')
    expect(plan.items[0].receivable).toMatchObject({ kind: 'cartao', totalCents: 30000, installmentCount: 3 })
  })

  it('importar de novo o que já existe não duplica', () => {
    const existing = [tenis(), instalacao()]
    const plan = parseReceivablesCsv(receivablesToCsv(existing, [ana], TODAY), [ana], existing, TODAY)
    expect(plan.items).toEqual([])
    expect(plan.newPeople).toEqual([])
    expect(plan.duplicates).toBe(2)
  })

  it('uma pessoa nova em várias linhas é criada uma vez, com o primeiro contato informado', () => {
    const csv = [
      'Pessoa;Telefone;E-mail;Descrição;Valor total;Parcelas;Primeiro vencimento',
      'Carla;;;Mochila;100;2;10/12/2026',
      'carla;(11) 91234-5678;carla@exemplo.com;Fone;50;1;10/12/2026',
    ].join('\n')
    const plan = parseReceivablesCsv(csv, [], [], TODAY)
    expect(plan.newPeople).toHaveLength(1)
    expect(plan.newPeople[0].person).toMatchObject({ name: 'Carla', phone: '11912345678', email: 'carla@exemplo.com' })
    expect(plan.items.map((i) => i.personKey)).toEqual(['carla', 'carla'])
  })

  it('aceita o tipo de várias formas e assume cartão quando não vem', () => {
    const csv = [
      'Pessoa;Tipo;Descrição;Valor total;Primeiro vencimento',
      'A;Reembolso do cartão;x;10;01/12/2026',
      'B;serviços prestados;y;10;01/12/2026',
      'C;;z;10;01/12/2026',
    ].join('\n')
    const plan = parseReceivablesCsv(csv, [], [], TODAY)
    expect(plan.items.map((i) => i.receivable.kind)).toEqual(['cartao', 'servico', 'cartao'])
    expect(plan.items[0].receivable.installmentCount).toBe(1)
  })

  it('recusa linhas com problema e avisa de contato inválido', () => {
    const csv = [
      'Pessoa;Telefone;E-mail;Tipo;Descrição;Valor total;Parcelas;Primeiro vencimento;Parcelas recebidas',
      ';;;;x;10;1;01/12/2026;',
      'A;;;;;10;1;01/12/2026;',
      'B;;;;y;0;1;01/12/2026;',
      'C;;;;z;10;61;01/12/2026;',
      'D;;;;w;10;3;31/02/2026;',
      'E;;;;v;10;3;01/12/2026;4',
      'F;;;ouro;u;10;3;01/12/2026;',
      'G;123;g@;;t;10;2;01/12/2026;1',
    ].join('\n')
    const plan = parseReceivablesCsv(csv, [], [], TODAY)
    expect(plan.total).toBe(8)
    expect(plan.errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6, 7, 8])
    const text = Object.fromEntries(plan.errors.map((e) => [e.line, e.message]))
    expect(text[2]).toContain('pessoa vazia')
    expect(text[3]).toContain('descrição vazia')
    expect(text[4]).toContain('maior que zero')
    expect(text[5]).toContain('de 1 a 60')
    expect(text[6]).toContain('primeiro vencimento “31/02/2026” inválido')
    expect(text[7]).toContain('maior que o número de parcelas')
    expect(text[8]).toContain('tipo “ouro”')
    expect(plan.items).toHaveLength(1)
    expect(plan.newPeople.map((p) => p.person.name)).toEqual(['G'])
    expect(plan.newPeople[0].person).toMatchObject({ phone: '', email: '' })
    expect(plan.warnings).toEqual([
      { line: 9, message: 'telefone “123” inválido; deixei em branco; e-mail “g@” inválido; deixei em branco' },
    ])
  })

  it('não cria pessoa para linha que foi recusada ou repetida', () => {
    const csv = [
      'Pessoa;Descrição;Valor total;Primeiro vencimento',
      'Zeca;Boné;abc;01/12/2026',
      'Ana Souza;Tênis;420;05/09/2026',
    ].join('\n')
    const plan = parseReceivablesCsv(csv, [ana], [{ ...tenis(), installmentCount: 10 }], TODAY)
    expect(plan.newPeople).toEqual([])
    expect(plan.errors).toHaveLength(1)
    expect(plan.duplicates).toBe(1)
  })

  it('informa quando falta coluna obrigatória', () => {
    expect(parseReceivablesCsv('Pessoa;Descrição\nA;b\n', [], [], TODAY).fileError).toContain('“Valor total” e “Primeiro vencimento”')
  })

  it('o modelo para baixar é válido e tem exemplos', () => {
    const plan = parseReceivablesCsv(receivablesTemplateCsv(), [], [], TODAY)
    expect(plan.errors).toEqual([])
    expect(plan.fileError).toBeNull()
    expect(plan.items).toHaveLength(2)
    expect(plan.newPeople).toHaveLength(2)
  })
})
