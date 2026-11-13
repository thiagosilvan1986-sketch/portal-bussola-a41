import { HORIZONS, HORIZON_LABEL, type Horizon } from '../domain/receivables'

/** Mês | Ano | Tudo: quanto do que falta receber o resumo mostra. */
export function HorizonPicker({ value, onChange }: { value: Horizon; onChange: (h: Horizon) => void }) {
  return (
    <div className="segmented segmented-small horizon-picker" role="group" aria-label="Período do resumo">
      {HORIZONS.map((h) => (
        <button key={h} type="button" aria-pressed={value === h} onClick={() => onChange(h)}>
          {HORIZON_LABEL[h]}
        </button>
      ))}
    </div>
  )
}
