// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const signIn = vi.fn()
vi.mock('../auth', () => ({ useAuth: () => ({ signIn, error: null }) }))

import Login from './Login'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Entrada', () => {
  it('mostra o logo com o nome do app e o botão de entrar com Google', () => {
    render(<Login />)
    expect(screen.getByRole('heading', { level: 1, name: 'Contas em Dia' })).toBeTruthy()
    expect(screen.getByAltText('Contas em Dia').getAttribute('src')).toBe('/logo.webp')
    fireEvent.click(screen.getByRole('button', { name: 'Entrar com Google' }))
    expect(signIn).toHaveBeenCalledOnce()
  })
})
