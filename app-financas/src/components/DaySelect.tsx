/** Dias que uma conta pode vencer. Em meses mais curtos o app usa o último dia do mês. */
export const DUE_DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

interface Props {
  /** Dia escolhido, como texto ('' = nenhum). */
  value: string
  onChange: (value: string) => void
  /** Texto da primeira linha, que não escolhe nenhum dia. */
  emptyLabel: string
  required?: boolean
}

/** Lista para escolher o dia do vencimento (1 a 31), em vez de digitar. Use dentro de um <label>. */
export function DaySelect({ value, onChange, emptyLabel, required }: Props) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} required={required}>
      <option value="">{emptyLabel}</option>
      {DUE_DAYS.map((day) => (
        <option key={day} value={String(day)}>
          {day}
        </option>
      ))}
    </select>
  )
}
