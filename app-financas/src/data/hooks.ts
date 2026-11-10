import { useEffect, useState } from 'react'
import { todayInSaoPaulo } from '../domain/dates'
import type { MailRecord, Suggestion } from '../domain/suggestions'
import type { Bill, Competence, Entry, IsoDate } from '../domain/types'
import {
  subscribeBills,
  subscribeEntries,
  subscribeGmailStatus,
  subscribePrefs,
  subscribeRecentMail,
  subscribeSuggestions,
  type GmailStatus,
  type Prefs,
} from './store'

interface Live<T> {
  data: T[]
  ready: boolean
  error: string | null
}

const INITIAL = { data: [], ready: false, error: null }

export function useBills(uid: string): Live<Bill> {
  const [state, setState] = useState<Live<Bill>>(INITIAL)
  useEffect(
    () =>
      subscribeBills(
        uid,
        (data) => setState({ data, ready: true, error: null }),
        (e) => setState((s) => ({ ...s, ready: true, error: e.message })),
      ),
    [uid],
  )
  return state
}

export function useEntries(uid: string, competence: Competence): Live<Entry> {
  const [state, setState] = useState<Live<Entry>>(INITIAL)
  useEffect(() => {
    setState(INITIAL)
    return subscribeEntries(
      uid,
      competence,
      (data) => setState({ data, ready: true, error: null }),
      (e) => setState((s) => ({ ...s, ready: true, error: e.message })),
    )
  }, [uid, competence])
  return state
}

/** Data de hoje em São Paulo; atualiza sozinha na virada do dia. */
export function useToday(): IsoDate {
  const [today, setToday] = useState(todayInSaoPaulo())
  useEffect(() => {
    const id = setInterval(() => setToday(todayInSaoPaulo()), 60_000)
    return () => clearInterval(id)
  }, [])
  return today
}

export function useSuggestions(uid: string): Live<Suggestion> {
  const [state, setState] = useState<Live<Suggestion>>(INITIAL)
  useEffect(
    () =>
      subscribeSuggestions(
        uid,
        (data) => setState({ data, ready: true, error: null }),
        (e) => setState((s) => ({ ...s, ready: true, error: e.message })),
      ),
    [uid],
  )
  return state
}

export function useRecentMail(uid: string): Live<MailRecord> {
  const [state, setState] = useState<Live<MailRecord>>(INITIAL)
  useEffect(
    () =>
      subscribeRecentMail(
        uid,
        (data) => setState({ data, ready: true, error: null }),
        (e) => setState((s) => ({ ...s, ready: true, error: e.message })),
      ),
    [uid],
  )
  return state
}

const NO_GMAIL: GmailStatus = { connected: false, needsReconnect: false, email: '', lastSyncAt: null, lastError: null, pending: 0 }
const NO_PREFS: Prefs = { onlySuggest: false, ignoredSenders: [] }

export function useGmailStatus(uid: string): GmailStatus & { ready: boolean } {
  const [state, setState] = useState({ ...NO_GMAIL, ready: false })
  useEffect(() => subscribeGmailStatus(uid, (s) => setState({ ...s, ready: true }), () => setState((s) => ({ ...s, ready: true }))), [uid])
  return state
}

export function usePrefs(uid: string): Prefs {
  const [state, setState] = useState(NO_PREFS)
  useEffect(() => subscribePrefs(uid, setState, () => undefined), [uid])
  return state
}
