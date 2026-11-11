/** Endereço público do app, usado nos links dos e-mails e como contato das notificações. `APP_URL` serve para um domínio próprio. */
export const DEFAULT_SITE_URL = 'https://appfinancasbr.netlify.app'

export function siteUrl(env: Record<string, string | undefined> = process.env): string {
  return (env.APP_URL || env.URL || DEFAULT_SITE_URL).replace(/\/+$/, '')
}
