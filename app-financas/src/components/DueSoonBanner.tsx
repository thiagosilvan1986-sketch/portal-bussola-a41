import { useMemo } from 'react'
import { useAlertSettings, useEntriesRange } from '../data/hooks'
import { alertCompetences, dueSoonLines, upcomingDue } from '../domain/alerts'
import type { Bill, IsoDate } from '../domain/types'

/** Faixa do Início para as contas que vencem nos prazos escolhidos em Cadastros > Alertas de vencimento ("Vence amanhã: Luz, Água"). */
export function DueSoonBanner({ uid, today, bills }: { uid: string; today: IsoDate; bills: Bill[] }) {
  const alerts = useAlertSettings(uid)
  const { enabled, days } = alerts.data
  const competences = useMemo(() => alertCompetences(today, days), [today, days])
  const entries = useEntriesRange(uid, competences[0], competences[competences.length - 1])
  const lines = useMemo(
    () => (enabled && entries.ready ? dueSoonLines(upcomingDue(bills, entries.data, today, days)) : []),
    [enabled, entries.ready, entries.data, bills, today, days],
  )
  return (
    <>
      {lines.map((line) => (
        <p key={line} className="banner banner-warn" role="status">
          {line}
        </p>
      ))}
    </>
  )
}
