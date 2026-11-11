// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authErrorMessage } from '../auth'

const auth = {
  signIn: vi.fn(),
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  resetPassword: vi.fn(),
  clearMessages: vi.fn(),
  error: null as string | null,
  info: null as string | null,
}
vi.mock('../auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth')>()),
  useAuth: () => auth,
}))

import Login from './Login'

beforeEach(() => {
  auth.error = null
  auth.info = null
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: password } })
}

describe('Entrada', () => {
  it('mostra o logo com o nome do app e o botão de entrar com Google', () => {
    render(<Login />)
    expect(screen.getByRole('heading', { level: 1, name: 'Contas em Dia' })).toBeTruthy()
    expect(screen.getByAltText('Contas em Dia').getAttribute('src')).toBe('/logo-login.webp')
    fireEvent.click(screen.getByRole('button', { name: 'Entrar com Google' }))
    expect(auth.signIn).toHaveBeenCalledOnce()
  })

  it('apresenta as funcionalidades do app na própria tela de entrada', () => {
    render(<Login />)
    const section = screen.getByRole('region', { name: 'Funcionalidades do Contas em Dia' })
    expect(within(section).getByRole('heading', { name: 'Tudo o que você precisa, num só lugar' })).toBeTruthy()
    for (const t of [
      'Nenhuma conta esquecida',
      'Pago em um toque',
      'Quem te deve, na ponta do lápis',
      'Cobrança sem climão',
      'Relatórios para decidir',
      'Sua planilha, sem retrabalho',
      'Privacidade num toque',
      'Você no controle',
      'Tudo à vista, logo na entrada',
    ]) {
      expect(within(section).getByText(t)).toBeTruthy()
    }
    expect(within(section).getByText(/Seus dados são só seus/)).toBeTruthy()
  })

  it('entra com e-mail e senha', () => {
    render(<Login />)
    fill('ana@exemplo.com', 'segredo1')
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(auth.signInWithEmail).toHaveBeenCalledWith('ana@exemplo.com', 'segredo1')
    expect(auth.signUpWithEmail).not.toHaveBeenCalled()
  })

  it('cria conta com e-mail e senha depois de trocar para "Criar conta"', () => {
    render(<Login />)
    fireEvent.click(screen.getByRole('button', { name: 'Não tenho conta. Criar conta' }))
    expect(auth.clearMessages).toHaveBeenCalled()
    fill('novo@exemplo.com', 'segredo1')
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    expect(auth.signUpWithEmail).toHaveBeenCalledWith('novo@exemplo.com', 'segredo1')
    expect(screen.queryByRole('button', { name: 'Esqueci minha senha' })).toBeNull()
  })

  it('não envia com senha curta nem sem e-mail', () => {
    render(<Login />)
    fill('ana@exemplo.com', '123')
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(screen.getByRole('alert').textContent).toContain('pelo menos 6 caracteres')
    fill('', 'segredo1')
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(screen.getByRole('alert').textContent).toContain('Digite seu e-mail')
    expect(auth.signInWithEmail).not.toHaveBeenCalled()
  })

  it('pede o e-mail antes de enviar o link de nova senha e depois envia', () => {
    render(<Login />)
    fireEvent.click(screen.getByRole('button', { name: 'Esqueci minha senha' }))
    expect(auth.resetPassword).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('Digite seu e-mail')
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@exemplo.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Esqueci minha senha' }))
    expect(auth.resetPassword).toHaveBeenCalledWith('ana@exemplo.com')
  })

  it('mostra o erro e o aviso vindos do login', () => {
    auth.error = 'E-mail ou senha incorretos.'
    const { unmount } = render(<Login />)
    expect(screen.getByRole('alert').textContent).toBe('E-mail ou senha incorretos.')
    unmount()
    auth.error = null
    auth.info = 'Enviamos o link.'
    render(<Login />)
    expect(screen.getByRole('status').textContent).toBe('Enviamos o link.')
  })

  it('alterna a visibilidade da senha', () => {
    render(<Login />)
    const field = screen.getByLabelText('Senha') as HTMLInputElement
    expect(field.type).toBe('password')
    fireEvent.click(screen.getByLabelText('Mostrar senha'))
    expect(field.type).toBe('text')
  })
})

describe('mensagens de erro de login', () => {
  it('traduz os códigos do Firebase', () => {
    expect(authErrorMessage({ code: 'auth/email-already-in-use' })).toContain('Já existe uma conta')
    expect(authErrorMessage({ code: 'auth/invalid-credential' })).toContain('E-mail ou senha incorretos')
    expect(authErrorMessage({ code: 'auth/weak-password' })).toContain('6 caracteres')
    expect(authErrorMessage({ code: 'auth/operation-not-allowed' })).toContain('E-mail/senha')
    expect(authErrorMessage({ code: 'auth/popup-closed-by-user' })).toBeNull()
    expect(authErrorMessage(new Error('x'))).toBe('Não foi possível entrar. Tente novamente.')
  })
})
