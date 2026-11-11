import type { FlowModel } from './reports'

export interface NodeLayout {
  key: string
  /** Topo do bloco. */
  y: number
  h: number
  /** Onde o texto do nome e do valor fica (centro), já afastado dos vizinhos. */
  labelY: number
}

export interface LinkLayout {
  from: string
  to: string
  cents: number
  /** Topo da faixa na origem e no destino; `h` é a espessura (a mesma nos dois lados). */
  y0: number
  y1: number
  h: number
}

export interface FlowLayout {
  height: number
  sources: NodeLayout[]
  targets: NodeLayout[]
  links: LinkLayout[]
}

interface Options {
  /** Altura de desenho dos blocos somados (sem os vãos). */
  plotH?: number
  gap?: number
  minH?: number
  /** Distância mínima entre os textos de uma coluna. */
  labelPitch?: number
}

/**
 * Posiciona o fluxo "origem → destino". A espessura de cada faixa é proporcional ao valor.
 * Quando falta dinheiro, a falta cobre cada categoria na mesma proporção (não dizemos qual conta ela paga).
 */
export function layoutFlow(model: FlowModel, { plotH = 250, gap = 6, minH = 4, labelPitch = 32 }: Options = {}): FlowLayout {
  const sourceCount = model.sources.length
  const targetCount = model.targets.length
  const widest = Math.max(sourceCount, targetCount)
  const scale = Math.max(0, plotH - gap * (widest - 1)) / model.totalCents

  const recvTotal = model.sources.find((s) => s.kind === 'recv')?.cents ?? 0
  const payTotal = model.targets.filter((t) => t.kind === 'category').reduce((acc, t) => acc + t.cents, 0)
  const covered = Math.min(recvTotal, payTotal)

  // Quanto de cada origem vai para cada destino.
  const flows: { from: string; to: string; cents: number }[] = []
  for (const t of model.targets) {
    if (t.kind === 'surplus') {
      if (t.cents > 0) flows.push({ from: 'recv', to: t.key, cents: t.cents })
      continue
    }
    const fromRecv = payTotal > 0 ? Math.round((t.cents * covered) / payTotal) : 0
    if (fromRecv > 0) flows.push({ from: 'recv', to: t.key, cents: fromRecv })
    if (t.cents - fromRecv > 0) flows.push({ from: 'gap', to: t.key, cents: t.cents - fromRecv })
  }

  function place(nodes: { key: string; cents: number }[]): Map<string, { y: number; h: number }> {
    const out = new Map<string, { y: number; h: number }>()
    let y = 0
    for (const n of nodes) {
      const h = Math.max(minH, n.cents * scale)
      out.set(n.key, { y, h })
      y += h + gap
    }
    return out
  }
  const sourceBox = place(model.sources)
  const targetBox = place(model.targets)

  // Cada faixa ocupa um trecho do bloco de origem e outro do de destino, na ordem em que aparecem.
  const usedFrom = new Map<string, number>()
  const usedTo = new Map<string, number>()
  const links: LinkLayout[] = []
  for (const s of model.sources) {
    for (const f of flows.filter((x) => x.from === s.key)) {
      links.push({ from: f.from, to: f.to, cents: f.cents, y0: 0, y1: 0, h: f.cents * scale })
    }
  }
  for (const l of links) {
    const a = sourceBox.get(l.from)!
    const b = targetBox.get(l.to)!
    l.y0 = a.y + (usedFrom.get(l.from) ?? 0)
    l.y1 = b.y + (usedTo.get(l.to) ?? 0)
    usedFrom.set(l.from, (usedFrom.get(l.from) ?? 0) + l.h)
    usedTo.set(l.to, (usedTo.get(l.to) ?? 0) + l.h)
  }
  // A ordem dos destinos pede faixas em ordem de destino dentro de cada origem; reordena só pelo topo no destino.
  links.sort((p, q) => p.y1 - q.y1 || p.y0 - q.y0)

  function labels(nodes: { key: string }[], box: Map<string, { y: number; h: number }>): NodeLayout[] {
    const out: NodeLayout[] = nodes.map((n) => {
      const b = box.get(n.key)!
      return { key: n.key, y: b.y, h: b.h, labelY: b.y + b.h / 2 }
    })
    for (let k = 1; k < out.length; k++) out[k].labelY = Math.max(out[k].labelY, out[k - 1].labelY + labelPitch)
    return out
  }
  const sources = labels(model.sources, sourceBox)
  const targets = labels(model.targets, targetBox)
  const bottom = (list: NodeLayout[]) => (list.length ? Math.max(list[list.length - 1].y + list[list.length - 1].h, list[list.length - 1].labelY + labelPitch / 2) : 0)
  return { height: Math.ceil(Math.max(bottom(sources), bottom(targets))), sources, targets, links }
}
