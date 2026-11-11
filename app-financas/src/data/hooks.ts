import { useEffect, useState } from 'react'
import { todayInSaoPaulo } from '../domain/dates'
import type { Bill, Competence, Entry, IsoDate, Person, Receivable } from '../domain/types'
import { subscribeBills, subscribeEntries, subscribeEntriesRange, subscribePeople, subscribeReceivables } from './store'

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

export function usePeople(uid: string): Live<Person> {
  const [state, setState] = useState<Live<Person>>(INITIAL)
  useEffect(
    () =>
      subscribePeople(
        uid,
        (data) => setState({ data, ready: true, error: null }),
        (e) => setState((s) => ({ ...s, ready: true, error: e.message })),
      ),
    [uid],
  )
  return state
}

export function useReceivables(uid: string): Live<Receivable> {
  const [state, setState] = useState<Live<Receivable>>(INITIAL)
  useEffect(
    () =>
      subscribeReceivables(
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

/** Lançamentos de um intervalo de competências, de `from` a `to` (inclusive). */
export function useEntriesRange(uid: string, from: Competence, to: Competence): Live<Entry> {
  const [state, setState] = useState<Live<Entry>>(INITIAL)
  useEffect(() => {
    setState(INITIAL)
    return subscribeEntriesRange(
      uid,
      from,
      to,
      (data) => setState({ data, ready: true, error: null }),
      (e) => setState((s) => ({ ...s, ready: true, error: e.message })),
    )
  }, [uid, from, to])
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
