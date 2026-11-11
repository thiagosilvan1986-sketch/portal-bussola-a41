import { afterEach, describe, expect, it, vi } from 'vitest'
import { alertEmail, escapeHtml, testEmail } from './email-content'
import { brevoMailer, mailerConfig } from './mailer'
import { DEFAULT_SITE_URL, siteUrl } from './site'

const MAIL = { subject: 'Assunto', html: '<p>Oi</p>' }
const CONFIG = { apiKey: 'xkeysib-segredo', from: 'avisos@exemplo.com', fromName: 'Contas em Dia' }

afterEach(() => vi.restoreAllMocks())

describe('mailerConfig', () => {
  it('lê a chave e o remetente das variáveis', () => {
    expect(mailerConfig({ BREVO_API_KEY: ' k ', MAIL_FROM: ' a@b.com ' })).toEqual({ apiKey: 'k', from: 'a@b.com', fromName: 'Contas em Dia' })
    expect(mailerConfig({ BREVO_API_KEY: 'k', MAIL_FROM: 'a@b.com', MAIL_FROM_NAME: 'Meu App' })?.fromName).toBe('Meu App')
  })

  it('sem a chave, sem remetente ou com remetente inválido, o e-mail fica desligado', () => {
    expect(mailerConfig({})).toBeNull()
    expect(mailerConfig({ MAIL_FROM: 'a@b.com' })).toBeNull()
    expect(mailerConfig({ BREVO_API_KEY: 'k' })).toBeNull()
    expect(mailerConfig({ BREVO_API_KEY: 'k', MAIL_FROM: 'sem-arroba' })).toBeNull()
    expect(mailerConfig({ BREVO_API_KEY: 'k', MAIL_FROM: 'Nome <a@b.com>' })).toBeNull()
  })
})

describe('brevoMailer', () => {
  it('chama a API do Brevo com a chave no cabeçalho e o corpo certo', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"messageId":"x"}', { status: 201 }))
    expect(await brevoMailer(CONFIG, fetcher).send('ana@exemplo.com', MAIL)).toBe('ok')
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('https://api.brevo.com/v3/smtp/email')
    expect(init.method).toBe('POST')
    expect(init.headers['api-key']).toBe('xkeysib-segredo')
    expect(JSON.parse(init.body)).toEqual({
      sender: { name: 'Contas em Dia', email: 'avisos@exemplo.com' },
      to: [{ email: 'ana@exemplo.com' }],
      subject: 'Assunto',
      htmlContent: '<p>Oi</p>',
    })
  })

  it('resposta de erro vira "error" e o log não traz a chave', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const fetcher = vi.fn().mockResolvedValue(new Response('{"code":"invalid_parameter","message":"sender email is invalid"}', { status: 400 }))
    expect(await brevoMailer(CONFIG, fetcher).send('ana@exemplo.com', MAIL)).toBe('error')
    expect(JSON.stringify(log.mock.calls)).toContain('sender email is invalid')
    expect(JSON.stringify(log.mock.calls)).not.toContain('xkeysib-segredo')
  })

  it('falha de rede vira "error"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const fetcher = vi.fn().mockRejectedValue(new Error('timeout'))
    expect(await brevoMailer(CONFIG, fetcher).send('ana@exemplo.com', MAIL)).toBe('error')
  })
})

describe('conteúdo do e-mail', () => {
  it('escapeHtml neutraliza os caracteres do HTML', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
  })

  it('o aviso agrupa por prazo, no singular e no plural', () => {
    const one = alertEmail([{ billId: 'a', name: 'Luz', dueDate: '2026-11-10', daysLeft: 1 }], 'https://x.app')
    expect(one.subject).toBe('Uma conta está perto de vencer')
    expect(one.html).toContain('<strong>Amanhã:</strong> Luz')
    const many = alertEmail(
      [
        { billId: 'a', name: 'Luz', dueDate: '2026-11-10', daysLeft: 1 },
        { billId: 'b', name: 'Água', dueDate: '2026-11-10', daysLeft: 1 },
        { billId: 'c', name: 'Internet', dueDate: '2026-11-12', daysLeft: 3 },
      ],
      'https://x.app',
    )
    expect(many.subject).toBe('3 contas estão perto de vencer')
    expect(many.html).toContain('<strong>Amanhã:</strong> Luz, Água')
    expect(many.html).toContain('<strong>Em 3 dias:</strong> Internet')
  })

  it('tem o botão com texto, a explicação de como parar e o idioma', () => {
    const { html } = testEmail('https://x.app')
    expect(html).toContain('lang="pt-BR"')
    expect(html).toContain('>Abrir o Contas em Dia</a>')
    expect(html).toContain('desmarque essa opção no app')
  })
})

describe('siteUrl', () => {
  it('prefere APP_URL, depois URL, depois o endereço padrão, sem barra no fim', () => {
    expect(siteUrl({ APP_URL: 'https://meu.com.br/', URL: 'https://x.netlify.app' })).toBe('https://meu.com.br')
    expect(siteUrl({ URL: 'https://x.netlify.app' })).toBe('https://x.netlify.app')
    expect(siteUrl({})).toBe(DEFAULT_SITE_URL)
  })
})
