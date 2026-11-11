interface Props {
  values: number[]
  /** Cor da linha (variável CSS). */
  color: string
}

const W = 96
const H = 28
const PAD = 5

/** Mini-gráfico de linha: só a forma, sem eixos. Os valores ficam no gráfico e na tabela do relatório. */
export function Sparkline({ values, color }: Props) {
  if (values.length < 2) return null
  const max = Math.max(...values)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const x = (k: number) => PAD + (k * (W - PAD * 2)) / (values.length - 1)
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2)
  const points = values.map((v, k) => `${x(k)},${y(v)}`).join(' ')
  const last = values.length - 1
  return (
    <svg className="sparkline" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
      <polyline className="spark-line" points={points} stroke={color} />
      <circle className="spark-dot" cx={x(last)} cy={y(values[last])} r={4} fill={color} />
    </svg>
  )
}
