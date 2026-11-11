import { STATUS_LABEL } from '../domain/entries'
import type { DisplayStatus } from '../domain/types'

/** Ícone junto do texto: a cor sozinha não basta (daltonismo, impressão em preto e branco). */
export const STATUS_ICON: Record<DisplayStatus, string> = {
  paga: '✓',
  parcial: '◐',
  atrasada: '⚠',
  vence_em_breve: '◔',
  cobranca_recebida: '●',
  prevista: '○',
}

/** Status sempre em texto além da cor (acessibilidade). */
export function StatusChip({ status }: { status: DisplayStatus }) {
  return (
    <span className={`chip chip-${status} status-chip`}>
      <span aria-hidden="true">{STATUS_ICON[status]} </span>
      {STATUS_LABEL[status]}
    </span>
  )
}
