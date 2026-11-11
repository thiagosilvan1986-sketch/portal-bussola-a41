// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { MoneyInput } from './MoneyInput'

function Holder({ start = '' }: { start?: string }) {
  const [v, setV] = useState(start)
  return <MoneyInput aria-label="Valor" value={v} onChange={setV} />
}
afterEach(cleanup)

describe('Campo de valor com máscara', () => {
  it('mostra o valor inicial já com a máscara e usa o teclado numérico', () => {
    render(<Holder start="1234,56" />)
    const input = screen.getByLabelText('Valor') as HTMLInputElement
    expect(input.value).toBe('1.234,56')
    expect(input.getAttribute('inputmode')).toBe('numeric')
  })
  it('digitar só números monta o valor', () => {
    render(<Holder />)
    const input = screen.getByLabelText('Valor') as HTMLInputElement
    fireEvent.change(input, { target: { value: '9' } })
    expect(input.value).toBe('0,09')
    fireEvent.change(input, { target: { value: '0,096' } })
    expect(input.value).toBe('0,96')
  })
  it('colar um valor completo vale como está', () => {
    render(<Holder />)
    const input = screen.getByLabelText('Valor') as HTMLInputElement
    fireEvent.paste(input, { clipboardData: { getData: () => 'R$ 238,40' } })
    expect(input.value).toBe('238,40')
    fireEvent.paste(input, { clipboardData: { getData: () => '1.234,5' } })
    expect(input.value).toBe('1.234,50')
  })
})
