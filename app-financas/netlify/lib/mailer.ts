import type { Mail } from './email-content'

/** Envio de e-mail. A versão de verdade usa o Brevo; nos testes entra uma de mentira. */
export interface Mailer {
  send(to: string, mail: Mail): Promise<'ok' | 'error'>
}

export interface MailerConfig {
  apiKey: string
  /** Endereço remetente. No Brevo, precisa estar confirmado em Remetentes e IPs. */
  from: string
  fromName: string
}

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

/** Lê as variáveis do Netlify. Sem a chave ou sem um remetente válido, o e-mail fica desligado. */
export function mailerConfig(env: Record<string, string | undefined> = process.env): MailerConfig | null {
  const apiKey = env.BREVO_API_KEY?.trim()
  const from = env.MAIL_FROM?.trim()
  if (!apiKey || !from || !EMAIL.test(from)) return null
  return { apiKey, from, fromName: env.MAIL_FROM_NAME?.trim() || 'Contas em Dia' }
}

const ENDPOINT = 'https://api.brevo.com/v3/smtp/email'

export function brevoMailer(config: MailerConfig, fetcher: typeof fetch = fetch): Mailer {
  return {
    async send(to, mail) {
      try {
        const res = await fetcher(ENDPOINT, {
          method: 'POST',
          headers: { 'api-key': config.apiKey, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({
            sender: { name: config.fromName, email: config.from },
            to: [{ email: to }],
            subject: mail.subject,
            htmlContent: mail.html,
          }),
          signal: AbortSignal.timeout(10_000),
        })
        if (res.ok) return 'ok'
        // O corpo explica o motivo (remetente não confirmado, chave inválida…). A chave nunca vai para o log.
        const detail = await res.text().catch(() => '')
        console.error('alertas: e-mail recusado', res.status, detail.slice(0, 300))
        return 'error'
      } catch (e) {
        console.error('alertas: e-mail falhou', e instanceof Error ? e.message : e)
        return 'error'
      }
    },
  }
}

/** O envio configurado neste site, ou null se faltar a chave ou o remetente. */
export function serverMailer(): Mailer | null {
  const config = mailerConfig()
  return config ? brevoMailer(config) : null
}
