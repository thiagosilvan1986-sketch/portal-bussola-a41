import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { todayInSaoPaulo } from '../../src/domain/dates'
import {
  chargeCompetence,
  decide,
  parseExtraction,
  senderKey,
  type Decision,
  type MailMeta,
  type MailOutcome,
  type Suggestion,
} from '../../src/domain/suggestions'
import type { Bill, Entry } from '../../src/domain/types'
import { adminDb } from './admin'
import { classifyEmail, ClaudeError, describeClaudeError } from './claude'
import { getAttachmentBase64, getMessage, GoogleError, listMessageIds, refreshAccessToken } from './google'
import { parseGmailMessage, type GmailMessage } from './mime'

/** Busca sem IA: só e-mails com cara de cobrança ou pagamento chegam ao modelo. */
const SEARCH =
  '(boleto OR fatura OR vencimento OR cobrança OR cobranca OR "segunda via" OR pagamento OR comprovante OR "nota fiscal" OR mensalidade OR "conta de" OR "a pagar") -in:spam -in:trash -from:me'
const BACKFILL_DAYS = 90
const MAX_IDS = 300
/** Tempo reservado para ler e classificar um e-mail; sem isso, a rodada para e continua na próxima. */
const PER_MESSAGE_MS = 12_000

export interface SyncResult {
  processed: number
  autoApplied: number
  suggested: number
  scams: number
  remaining: number
  error: string | null
}

export class NotConnectedError extends Error {
  constructor() {
    super('Gmail não conectado')
  }
}

const REVOKED = 'O acesso ao Gmail foi revogado ou expirou. Conecte de novo em Ajustes.'

function googleEnv() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Falta GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET no Netlify.')
  return { clientId, clientSecret }
}

export async function syncUser(uid: string, deadline: number): Promise<SyncResult> {
  const db = adminDb()
  const started = new Date()
  const integRef = db.doc(`integrations/${uid}`)
  const statusRef = db.doc(`users/${uid}/settings/gmail`)

  const integ = (await integRef.get()).data() as
    | { refreshToken?: string; email?: string; lastFullSyncSec?: number }
    | undefined
  if (!integ?.refreshToken) throw new NotConnectedError()

  const result: SyncResult = { processed: 0, autoApplied: 0, suggested: 0, scams: 0, remaining: 0, error: null }

  let token: string
  try {
    token = await refreshAccessToken({ ...googleEnv(), refreshToken: integ.refreshToken })
  } catch (e) {
    if (e instanceof GoogleError && e.code === 'invalid_grant') {
      await statusRef.set({ connected: false, needsReconnect: true, lastError: REVOKED }, { merge: true })
      await integRef.update({ refreshToken: FieldValue.delete() })
      result.error = REVOKED
      return result
    }
    throw e
  }

  const [billsSnap, prefsSnap, mailsSnap] = await Promise.all([
    db.collection(`users/${uid}/bills`).get(),
    db.doc(`users/${uid}/settings/prefs`).get(),
    db.collection(`users/${uid}/emails`).select('fingerprint').get(),
  ])
  const bills = billsSnap.docs.map((d) => ({ ...d.data(), id: d.id }) as Bill)
  const prefs = (prefsSnap.data() ?? {}) as { onlySuggest?: boolean; ignoredSenders?: string[] }
  const done = new Set(mailsSnap.docs.map((d) => d.id))
  const seenFingerprints = new Set(mailsSnap.docs.map((d) => String(d.get('fingerprint') ?? '')).filter(Boolean))
  const entriesCache = new Map<string, Map<string, Entry>>()

  async function entriesOf(competence: string): Promise<Map<string, Entry>> {
    let m = entriesCache.get(competence)
    if (!m) {
      const snap = await db.collection(`users/${uid}/entries`).where('competence', '==', competence).get()
      m = new Map(snap.docs.map((d) => [d.id, { ...d.data(), id: d.id } as Entry]))
      entriesCache.set(competence, m)
    }
    return m
  }

  const after = integ.lastFullSyncSec ?? Math.floor(started.getTime() / 1000) - BACKFILL_DAYS * 86_400
  let ids: string[]
  try {
    ids = await listMessageIds(token, `after:${after} ${SEARCH}`, MAX_IDS)
  } catch (e) {
    if (e instanceof GoogleError && (e.status === 401 || e.status === 403)) {
      result.error = 'O Google recusou o acesso ao Gmail. Confira se a Gmail API está ativada no projeto e conecte de novo.'
      await statusRef.set({ lastSyncAt: started.toISOString(), lastError: result.error }, { merge: true })
      return result
    }
    throw e
  }
  const todo = ids.filter((id) => !done.has(id))

  let handled = 0
  for (const id of todo) {
    if (Date.now() + PER_MESSAGE_MS > deadline) break
    try {
      const outcome = await handleMessage(id)
      handled += 1
      result.processed += 1
      if (outcome === 'auto_applied') result.autoApplied += 1
      else if (outcome === 'suggested') result.suggested += 1
      else if (outcome === 'scam_blocked') result.scams += 1
    } catch (e) {
      if (e instanceof ClaudeError) {
        result.error = describeClaudeError(e)
        if (e.transient || e.status === 401 || e.status === 403 || /credit|balance/i.test(e.message)) break
        await record(id, { from: '', subject: '', receivedAt: todayInSaoPaulo(started) }, 'ignored', 'erro_de_leitura', '')
        handled += 1
        continue
      }
      if (e instanceof GoogleError && e.status === 404) {
        await record(id, { from: '', subject: '', receivedAt: todayInSaoPaulo(started) }, 'ignored', 'mensagem_removida', '')
        handled += 1
        continue
      }
      console.error('Falha ao processar e-mail', id, e)
      result.error = 'Não foi possível ler um dos e-mails. O app tenta de novo na próxima rodada.'
      break
    }
  }

  result.remaining = todo.length - handled
  if (result.remaining === 0 && result.error === null) {
    // Sobreposição de uma hora: e-mails que chegarem durante a rodada entram na próxima.
    await integRef.update({ lastFullSyncSec: Math.floor(started.getTime() / 1000) - 3600 })
  }
  await statusRef.set(
    {
      connected: true,
      needsReconnect: false,
      email: integ.email ?? '',
      lastSyncAt: started.toISOString(),
      lastError: result.error,
      pending: result.remaining,
    },
    { merge: true },
  )
  return result

  async function handleMessage(id: string): Promise<MailOutcome> {
    const msg = await getMessage<GmailMessage>(token, id)
    const parsed = parseGmailMessage(msg)
    const receivedAt = todayInSaoPaulo(new Date(Number(msg.internalDate ?? started.getTime())))
    const mail: MailMeta = {
      messageId: id,
      fromEmail: parsed.fromEmail,
      fromName: parsed.fromName,
      subject: parsed.subject,
      receivedAt,
    }
    const meta = { from: parsed.from.slice(0, 200), subject: parsed.subject.slice(0, 200), receivedAt }

    if (!parsed.text && !parsed.pdf) {
      await record(id, meta, 'ignored', 'sem_conteudo', '')
      return 'ignored'
    }

    let pdfBase64: string | undefined
    if (parsed.pdf) {
      pdfBase64 = await getAttachmentBase64(token, id, parsed.pdf.attachmentId).catch(() => undefined)
    }

    const raw = await classifyEmail({
      today: todayInSaoPaulo(new Date()),
      receivedAt,
      from: parsed.from,
      subject: parsed.subject,
      text: parsed.text,
      linkDomains: parsed.linkDomains,
      pdfBase64,
      timeoutMs: Math.max(5_000, deadline - Date.now() - 2_000),
    })
    const extraction = parseExtraction(raw)

    const entries = extraction.kind === 'charge' ? await entriesOf(chargeCompetence(extraction, receivedAt)) : new Map<string, Entry>()
    const decision = decide({
      mail,
      extraction,
      bills,
      entryFor: (billId, competence) => entries.get(`${billId}_${competence}`) ?? null,
      fingerprintSeen: (fp) => seenFingerprints.has(fp),
      onlySuggest: prefs.onlySuggest === true,
      ignoredSenders: prefs.ignoredSenders ?? [],
    })

    const { outcome, detail, fingerprint } = await applyDecision(db, uid, decision, mail, meta)
    if (fingerprint) seenFingerprints.add(fingerprint)
    await record(id, meta, outcome, detail, fingerprint)
    return outcome
  }

  async function record(
    id: string,
    meta: { from: string; subject: string; receivedAt: string },
    outcome: MailOutcome,
    detail: string,
    fingerprint: string,
  ) {
    await db.doc(`users/${uid}/emails/${id}`).set({ ...meta, processedAt: new Date().toISOString(), outcome, detail, fingerprint })
  }
}

async function applyDecision(
  db: Firestore,
  uid: string,
  d: Decision,
  mail: MailMeta,
  meta: { from: string; subject: string; receivedAt: string },
): Promise<{ outcome: MailOutcome; detail: string; fingerprint: string }> {
  const now = new Date().toISOString()
  const base = { status: 'pending' as const, createdAt: now, ...meta, senderKey: senderKey(mail.fromEmail) }

  async function createSuggestion(s: Omit<Suggestion, 'id'>) {
    try {
      await db.doc(`users/${uid}/suggestions/${mail.messageId}`).create(s)
    } catch (e) {
      if ((e as { code?: number }).code !== 6) throw e // 6 = ALREADY_EXISTS: já foi criada numa rodada anterior
    }
  }

  switch (d.kind) {
    case 'ignore':
      return {
        outcome: d.reason === 'payment_phase3' ? 'payment_pending_phase3' : 'ignored',
        detail: d.reason,
        fingerprint: '',
      }

    case 'duplicate':
      return { outcome: 'duplicate', detail: 'repetida', fingerprint: d.fingerprint }

    case 'scam':
      await createSuggestion({
        ...base,
        type: 'scam_alert',
        cnpj: '',
        signals: d.signals,
        billId: d.billId ?? undefined,
      })
      return { outcome: 'scam_blocked', detail: d.signals.join(','), fingerprint: '' }

    case 'auto_apply': {
      const a = d.apply
      await db.doc(`users/${uid}/entries/${a.entryId}`).update(a.patch as Record<string, unknown>)
      const billUpdate: Record<string, unknown> = { emailSenders: FieldValue.arrayUnion(a.senderKey) }
      const billSnap = await db.doc(`users/${uid}/bills/${a.billId}`).get()
      if (a.cnpj && !billSnap.get('cnpj')) billUpdate.cnpj = a.cnpj
      await db.doc(`users/${uid}/bills/${a.billId}`).update(billUpdate)
      return { outcome: 'auto_applied', detail: `${a.billName}: cobrança confirmada`, fingerprint: a.fingerprint }
    }

    case 'suggest_apply': {
      const a = d.apply
      await createSuggestion({
        ...base,
        type: 'apply_charge',
        cnpj: a.cnpj,
        billId: a.billId,
        billName: a.billName,
        entryId: a.entryId,
        competence: a.competence,
        patch: a.patch,
        previous: a.previous,
        lowConfidence: d.lowConfidence,
      })
      return { outcome: 'suggested', detail: `${a.billName}: confirmar cobrança`, fingerprint: a.fingerprint }
    }

    case 'suggest_new_bill':
      await createSuggestion({ ...base, type: 'new_bill', cnpj: d.draft.cnpj, draft: d.draft })
      return { outcome: 'suggested', detail: `${d.draft.name}: nova conta`, fingerprint: d.fingerprint }
  }
}

/** Sincroniza todos os usuários conectados, dentro do tempo disponível. */
export async function syncAll(deadline: number): Promise<{ users: number; results: Record<string, SyncResult | string> }> {
  const snap = await adminDb().collection('integrations').get()
  const uids = snap.docs.filter((d) => d.get('refreshToken')).map((d) => d.id)
  const results: Record<string, SyncResult | string> = {}
  for (const uid of uids) {
    if (Date.now() + PER_MESSAGE_MS > deadline) break
    try {
      results[uid] = await syncUser(uid, deadline)
    } catch (e) {
      console.error('Falha ao sincronizar', uid, e)
      results[uid] = e instanceof Error ? e.message : 'erro'
    }
  }
  return { users: uids.length, results }
}
