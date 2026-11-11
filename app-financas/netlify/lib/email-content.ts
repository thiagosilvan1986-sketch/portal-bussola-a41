import { alertLines, alertTitle, type DueItem } from '../../src/domain/alerts'

/** Um e-mail pronto para enviar. Só HTML: o Brevo aceita um tipo de corpo por envio. */
export interface Mail {
  subject: string
  html: string
}

/** Nomes de conta vêm da pessoa e entram no HTML, então nada passa sem escapar. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function layout(heading: string, paragraphs: string[], appUrl: string): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.5">${p}</p>`).join('')
  const link = escapeHtml(appUrl)
  return `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:16px;background:#f4f6f5;font-family:Arial,Helvetica,sans-serif;color:#1c2b26">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #d5dcd8;border-radius:12px;padding:20px">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${escapeHtml(heading)}</h1>
${body}
<p style="margin:16px 0"><a href="${link}" style="display:inline-block;background:#1b6b4f;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:8px">Abrir o Contas em Dia</a></p>
<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#5a6a63">Você recebe este e-mail porque marcou “Avisar por e-mail” em Cadastros &gt; Alertas de vencimento, no Contas em Dia. Para parar, desmarque essa opção no app.</p>
</div>
</body>
</html>`
}

/** E-mail do aviso de vencimento. Só nomes e prazos, sem valores, como na notificação. */
export function alertEmail(items: DueItem[], appUrl: string): Mail {
  const lines = alertLines(items).map((line) => {
    const at = line.indexOf(': ')
    return `<strong>${escapeHtml(line.slice(0, at))}:</strong> ${escapeHtml(line.slice(at + 2))}`
  })
  return {
    subject: alertTitle(items.length),
    html: layout(alertTitle(items.length), ['Estas contas estão perto de vencer:', ...lines], appUrl),
  }
}

export function testEmail(appUrl: string): Mail {
  return {
    subject: 'Aviso de teste do Contas em Dia',
    html: layout('Aviso de teste', ['Deu certo! É assim que o Contas em Dia vai avisar por e-mail quando uma conta estiver perto de vencer.'], appUrl),
  }
}
