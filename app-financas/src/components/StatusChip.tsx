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
/** `receber`: o que é pago a você aparece como "Recebida" (e "Prevista" no lugar de "Cobrança recebida" não se aplica). */
export function StatusChip({ status, receber = false }: { status: DisplayStatus; receber?: boolean }) {
  return (
    <span className={`chip chip-${status} status-chip`}>
      <span aria-hidden="true">{STATUS_ICON[status]} </span>
      {receber && status === 'paga' ? 'Recebida' : STATUS_LABEL[status]}
    </span>
  )
}
