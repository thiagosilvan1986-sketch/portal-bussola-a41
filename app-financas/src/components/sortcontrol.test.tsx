// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSortChoice } from '../data/sortPrefs'
import { choiceOf, type SortChoice, type SortOption } from '../domain/sorting'
import { SortControl } from './SortControl'

type Key = 'nome' | 'valor' | 'regra'
const OPTIONS: SortOption<Key>[] = [
  { key: 'regra', label: 'Situação', dir: 'asc', directional: false },
  { key: 'nome', label: 'Nome', dir: 'asc' },
  { key: 'valor', label: 'Valor', dir: 'desc' },
]
const FALLBACK = choiceOf(OPTIONS[0])
const STORAGE_KEY = 'contas-em-dia:ordem:teste'

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

function Harness({ start = FALLBACK, onChange }: { start?: SortChoice<Key>; onChange?: (c: SortChoice<Key>) => void }) {
  const [value, setValue] = useState(start)
  return (
    <SortControl
      options={OPTIONS}
      value={value}
      label="Ordenação de teste"
      onChange={(c) => {
        setValue(c)
        onChange?.(c)
      }}
    />
  )
}

describe('SortControl', () => {
  it('mostra "Ordenar por" e os critérios com texto visível', () => {
    render(<Harness />)
    expect(screen.getByRole('group', { name: 'Ordenação de teste' })).toBeTruthy()
    const select = screen.getByLabelText('Ordenar por') as HTMLSelectElement
    expect([...select.options].map((o) => o.textContent)).toEqual(['Situação', 'Nome', 'Valor'])
    expect(select.value).toBe('regra')
  })

  it('critério de regra fechada não tem o botão de sentido', () => {
    render(<Harness />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('ao trocar o critério, usa o sentido padrão dele e o botão diz o sentido em texto', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const select = screen.getByLabelText('Ordenar por')
    fireEvent.change(select, { target: { value: 'valor' } })
    expect(onChange).toHaveBeenLastCalledWith({ key: 'valor', dir: 'desc' })
    expect(screen.getByRole('button').textContent).toContain('Decrescente')
    fireEvent.change(select, { target: { value: 'nome' } })
    expect(onChange).toHaveBeenLastCalledWith({ key: 'nome', dir: 'asc' })
    expect(screen.getByRole('button').textContent).toContain('Crescente')
  })

  it('o botão inverte o sentido, com texto e descrição para leitor de tela', () => {
    const onChange = vi.fn()
    render(<Harness start={{ key: 'nome', dir: 'asc' }} onChange={onChange} />)
    const btn = screen.getByRole('button', { name: 'Ordem crescente. Toque para inverter' })
    expect(btn.textContent).toMatch(/Crescente/)
    fireEvent.click(btn)
    expect(onChange).toHaveBeenLastCalledWith({ key: 'nome', dir: 'desc' })
    const back = screen.getByRole('button', { name: 'Ordem decrescente. Toque para inverter' })
    expect(back.textContent).toMatch(/Decrescente/)
    fireEvent.click(back)
    expect(onChange).toHaveBeenLastCalledWith({ key: 'nome', dir: 'asc' })
  })

  it('com um critério que a tela não oferece mais, mostra o primeiro da lista', () => {
    render(<Harness start={{ key: 'sumiu' as Key, dir: 'asc' }} />)
    expect((screen.getByLabelText('Ordenar por') as HTMLSelectElement).value).toBe('regra')
  })
})

describe('useSortChoice (escolha guardada neste aparelho)', () => {
  it('sem nada guardado, usa o padrão', () => {
    const { result } = renderHook(() => useSortChoice('teste', OPTIONS, FALLBACK))
    expect(result.current[0]).toEqual(FALLBACK)
  })

  it('guarda a escolha e a retoma numa próxima visita', () => {
    const first = renderHook(() => useSortChoice('teste', OPTIONS, FALLBACK))
    act(() => first.result.current[1]({ key: 'valor', dir: 'asc' }))
    expect(first.result.current[0]).toEqual({ key: 'valor', dir: 'asc' })
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual({ key: 'valor', dir: 'asc' })
    first.unmount()

    const second = renderHook(() => useSortChoice('teste', OPTIONS, FALLBACK))
    expect(second.result.current[0]).toEqual({ key: 'valor', dir: 'asc' })
  })

  it('cada tela guarda a sua própria ordem', () => {
    const a = renderHook(() => useSortChoice('tela-a', OPTIONS, FALLBACK))
    act(() => a.result.current[1]({ key: 'nome', dir: 'desc' }))
    const b = renderHook(() => useSortChoice('tela-b', OPTIONS, FALLBACK))
    expect(b.result.current[0]).toEqual(FALLBACK)
  })

  it('valor guardado estragado ou de um critério que não existe mais cai no padrão', () => {
    for (const raw of ['{não é json', '42', 'null', '{"key":"apagado","dir":"asc"}', '{"key":7,"dir":"asc"}']) {
      localStorage.setItem(STORAGE_KEY, raw)
      const { result, unmount } = renderHook(() => useSortChoice('teste', OPTIONS, FALLBACK))
      expect(result.current[0]).toEqual(FALLBACK)
      unmount()
    }
  })

  it('sentido guardado inválido usa o sentido padrão do critério', () => {
    localStorage.setItem(STORAGE_KEY, '{"key":"valor","dir":"torto"}')
    const { result } = renderHook(() => useSortChoice('teste', OPTIONS, FALLBACK))
    expect(result.current[0]).toEqual({ key: 'valor', dir: 'desc' })
  })

  it('critério guardado que some de vista não é apagado e volta a valer quando reaparece', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ key: 'valor', dir: 'asc' }))
    const reduced = OPTIONS.filter((o) => o.key !== 'valor')
    const hidden = renderHook(() => useSortChoice('teste', reduced, FALLBACK))
    expect(hidden.result.current[0]).toEqual(FALLBACK)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual({ key: 'valor', dir: 'asc' })
    hidden.unmount()
    const full = renderHook(() => useSortChoice('teste', OPTIONS, FALLBACK))
    expect(full.result.current[0]).toEqual({ key: 'valor', dir: 'asc' })
  })

  it('se o navegador bloquear o armazenamento, o app segue funcionando com a escolha da visita', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    const { result } = renderHook(() => useSortChoice('teste', OPTIONS, FALLBACK))
    expect(result.current[0]).toEqual(FALLBACK)
    act(() => result.current[1]({ key: 'nome', dir: 'desc' }))
    expect(result.current[0]).toEqual({ key: 'nome', dir: 'desc' })
  })
})
