import { afterEach, describe, expect, it, vi } from 'vitest'
import { classifyEmail, ClaudeError, describeClaudeError } from './claude'
import { buildAuthUrl, emailFromIdToken } from './google'
import { htmlToText, parseGmailMessage, splitFrom, type GmailMessage } from './mime'
import { signState, verifyState } from './state'

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url')

describe('state do OAuth', () => {
  it('ida e volta devolve o uid', () => {
    const s = signState('u1', 'segredo', 1_000)
    expect(verifyState(s, 'segredo', 2_000)).toBe('u1')
  })

  it('recusa assinatura errada, adulterada ou vencida', () => {
    const s = signState('u1', 'segredo', 1_000)
    expect(verifyState(s, 'outro-segredo', 2_000)).toBeNull()
    const [payload, sig] = s.split('.')
    const forged = `${b64(JSON.stringify({ uid: 'u2', exp: 9e15 }))}.${sig}`
    expect(verifyState(forged, 'segredo', 2_000)).toBeNull()
    expect(verifyState(`${payload}.${sig}`, 'segredo', 1_000 + 11 * 60 * 1000)).toBeNull()
    expect(verifyState('lixo', 'segredo')).toBeNull()
    expect(verifyState('a.b.c', 'segredo')).toBeNull()
  })
})

describe('mensagem do Gmail', () => {
  const msg: GmailMessage = {
    id: 'm1',
    internalDate: '1793000000000',
    payload: {
      mimeType: 'multipart/mixed',
      headers: [
        { name: 'From', value: '"Vivo Fatura" <Fatura@Vivo.com.br>' },
        { name: 'Subject', value: 'Sua fatura vence dia 10' },
      ],
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            { mimeType: 'text/plain', body: { data: b64('Olá! Sua fatura de R$ 129,90 vence em 10/12. Pague pelo app ou boleto.') } },
            { mimeType: 'text/html', body: { data: b64('<p>Olá!</p><a href="https://vivo.com.br/fatura">ver</a>') } },
          ],
        },
        { mimeType: 'application/pdf', filename: 'fatura.pdf', body: { attachmentId: 'att1', size: 52_000 } },
      ],
    },
  }

  it('lê remetente, assunto, texto e o PDF anexo', () => {
    const p = parseGmailMessage(msg)
    expect(p.fromEmail).toBe('fatura@vivo.com.br')
    expect(p.fromName).toBe('Vivo Fatura')
    expect(p.subject).toBe('Sua fatura vence dia 10')
    expect(p.text).toContain('R$ 129,90')
    expect(p.linkDomains).toEqual(['vivo.com.br'])
    expect(p.pdf).toEqual({ attachmentId: 'att1', filename: 'fatura.pdf', size: 52_000 })
  })

  it('ignora PDF grande demais', () => {
    const big = structuredClone(msg)
    big.payload!.parts![1].body!.size = 9_000_000
    expect(parseGmailMessage(big).pdf).toBeNull()
  })

  it('usa o HTML quando não há texto simples', () => {
    const html = { id: 'm2', payload: { mimeType: 'text/html', headers: [], body: { data: b64('<div>Valor:&nbsp;R$&nbsp;10,00</div><script>x()</script><br>Vence amanhã</div>') } } }
    const p = parseGmailMessage(html)
    expect(p.text).toBe('Valor: R$ 10,00\n\nVence amanhã')
  })

  it('separa nome e endereço', () => {
    expect(splitFrom('Maria <maria@x.com>')).toEqual({ name: 'Maria', email: 'maria@x.com' })
    expect(splitFrom('solo@x.com')).toEqual({ name: '', email: 'solo@x.com' })
  })

  it('htmlToText troca entidades numéricas', () => {
    expect(htmlToText('a&#233;b&#x41;')).toBe('aébA')
  })
})

describe('Google', () => {
  it('monta a URL pedindo acesso offline e somente leitura', () => {
    const u = new URL(buildAuthUrl({ clientId: 'cid', redirectUri: 'https://x/cb', state: 's' }))
    expect(u.searchParams.get('access_type')).toBe('offline')
    expect(u.searchParams.get('prompt')).toBe('consent')
    expect(u.searchParams.get('scope')).toContain('gmail.readonly')
    expect(u.searchParams.get('scope')).not.toContain('gmail.modify')
  })

  it('lê o e-mail do id_token', () => {
    const token = `x.${b64(JSON.stringify({ email: 'a@b.com' }))}.y`
    expect(emailFromIdToken(token)).toBe('a@b.com')
    expect(emailFromIdToken('quebrado')).toBe('')
  })
})

describe('chamada ao Claude', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  const input = {
    today: '2026-11-10',
    receivedAt: '2026-11-09',
    from: 'Vivo <fatura@vivo.com.br>',
    subject: 'Fatura',
    text: 'Valor R$ 129,90',
    linkDomains: ['vivo.com.br'],
    pdfBase64: 'AAAA',
    timeoutMs: 5_000,
  }

  it('força a ferramenta, manda o PDF como documento e devolve a leitura', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-teste')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'registrar_leitura', input: { kind: 'charge' } }] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(classifyEmail(input)).resolves.toEqual({ kind: 'charge' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-teste')
    const body = JSON.parse(init.body as string)
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'registrar_leitura' })
    expect(body.messages[0].content[0]).toMatchObject({ type: 'document' })
    expect(body.messages[0].content.at(-1).text).toContain('<email>')
    expect(body.system).toContain('NÃO é confiável')
  })

  it('se o PDF der erro 400, tenta de novo só com o texto', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-teste')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'invalid pdf' } }), { status: 400 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'registrar_leitura', input: { kind: 'other' } }] }), { status: 200 }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(classifyEmail(input)).resolves.toEqual({ kind: 'other' })
    const second = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string)
    expect(second.messages[0].content).toHaveLength(1)
  })

  it('sem crédito não tenta de novo e explica em português', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-teste')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Your credit balance is too low' } }), { status: 400 })),
    )
    const err = await classifyEmail(input).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ClaudeError)
    expect(describeClaudeError(err as ClaudeError)).toContain('sem crédito')
  })

  it('classifica falha temporária', () => {
    expect(new ClaudeError('x', 529).transient).toBe(true)
    expect(new ClaudeError('x', 401).transient).toBe(false)
  })

  it('sem chave configurada, avisa', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    await expect(classifyEmail(input)).rejects.toMatchObject({ status: 401 })
  })
})
