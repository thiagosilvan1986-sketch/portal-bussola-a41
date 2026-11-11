import { beforeEach, describe, expect, it, vi } from 'vitest'

const firebase = vi.hoisted(() => ({ sendEmailVerification: vi.fn() }))
vi.mock('firebase/auth', () => firebase)

import { EmailError, checkEmailVerified, sendTestEmail, sendVerificationEmail } from './email'

const user = (over: Record<string, unknown> = {}) => ({ emailVerified: false, reload: vi.fn().mockResolvedValue(undefined), ...over }) as never

beforeEach(() => vi.clearAllMocks())

describe('sendVerificationEmail', () => {
  it('pede ao Firebase o link de confirmação', async () => {
    firebase.sendEmailVerification.mockResolvedValue(undefined)
    const u = user()
    await sendVerificationEmail(u)
    expect(firebase.sendEmailVerification).toHaveBeenCalledWith(u)
  })

  it.each([
    ['auth/too-many-requests', /Muitos pedidos/],
    ['auth/network-request-failed', /Sem conexão/],
    ['auth/outro', /Não foi possível enviar/],
  ])('erro %s vira mensagem em português', async (code, message) => {
    firebase.sendEmailVerification.mockRejectedValue({ code })
    await expect(sendVerificationEmail(user())).rejects.toThrow(message)
  })
})

describe('checkEmailVerified', () => {
  it('recarrega o usuário e devolve se já confirmou', async () => {
    const u = user()
    expect(await checkEmailVerified(u)).toBe(false)
    expect((u as { reload: () => void }).reload).toHaveBeenCalled()
    expect(await checkEmailVerified(user({ emailVerified: true }))).toBe(true)
  })

  it('sem conexão, avisa em vez de dizer que não confirmou', async () => {
    await expect(checkEmailVerified(user({ reload: vi.fn().mockRejectedValue(new Error('rede')) }))).rejects.toBeInstanceOf(EmailError)
  })
})

describe('sendTestEmail', () => {
  it('chama a função com o token da pessoa', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"sent":true}', { status: 200 }))
    await sendTestEmail('tok', fetcher)
    expect(fetcher).toHaveBeenCalledWith('/.netlify/functions/send-test-email', { method: 'POST', headers: { authorization: 'Bearer tok' } })
  })

  it('mostra a mensagem que o servidor mandou', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"error":"Confirme o seu e-mail primeiro."}', { status: 409 }))
    await expect(sendTestEmail('tok', fetcher)).rejects.toThrow('Confirme o seu e-mail primeiro.')
  })

  it('erro sem corpo usa a mensagem padrão; sem rede, avisa da conexão', async () => {
    await expect(sendTestEmail('tok', vi.fn().mockResolvedValue(new Response('x', { status: 500 })))).rejects.toThrow(/Não foi possível enviar o e-mail de teste/)
    await expect(sendTestEmail('tok', vi.fn().mockRejectedValue(new Error('x')))).rejects.toThrow(/Sem conexão/)
  })
})
