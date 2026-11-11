import { describe, expect, it } from 'vitest'
import { centsToMasked, maskMoney, parseBRLToCents } from './money'

describe('máscara de valor', () => {
  it('a vírgula entra sozinha, da direita para a esquerda', () => {
    expect(maskMoney('9')).toBe('0,09')
    expect(maskMoney('96')).toBe('0,96')
    expect(maskMoney('960')).toBe('9,60')
    expect(maskMoney('9606')).toBe('96,06')
    expect(maskMoney('123456')).toBe('1.234,56')
    expect(maskMoney('123456789')).toBe('1.234.567,89')
  })
  it('ignora tudo que não é número e limita o tamanho', () => {
    expect(maskMoney('R$ 12a3')).toBe('1,23')
    expect(maskMoney('abc')).toBe('')
    expect(maskMoney('1'.repeat(20))).toBe('111.111.111,11') // até R$ 999.999.999,99
  })
  it('um zero digitado mostra 0,00 e apagar até zerar deixa o campo vazio', () => {
    expect(maskMoney('0', '')).toBe('0,00')
    expect(maskMoney('0,000', '0,00')).toBe('0,00')
    expect(maskMoney('0,0', '0,00')).toBe('') // apagou
    expect(maskMoney('1,2', '1,23')).toBe('0,12') // apagar tira o último dígito
    expect(maskMoney('', '0,01')).toBe('')
  })
  it('o texto da máscara é lido de volta sem perder centavos', () => {
    for (const cents of [0, 1, 99, 100, 9606, 123456, 99999999999]) {
      expect(parseBRLToCents(centsToMasked(cents))).toBe(cents)
    }
    expect(centsToMasked(123456)).toBe('1.234,56')
  })
})
