import { STATUS_LABEL } from '../domain/entries'
import type { DisplayStatus } from '../domain/types'

/** Status sempre em texto além da cor (acessibilidade). */
export function StatusChip({ status }: { status: DisplayStatus }) {
  return <span className={`chip chip-${status}`}>{STATUS_LABEL[status]}</span>
}
