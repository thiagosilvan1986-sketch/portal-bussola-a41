/**
 * CSV de planilha brasileira.
 * - Excel em português separa por ";" e usa vírgula decimal; o Google Planilhas separa por ",".
 * - O "CSV" comum do Excel vem em Windows-1252 (não UTF-8), então a leitura tenta UTF-8 e cai para ele.
 * - Na saída, o BOM faz o Excel reconhecer os acentos.
 */

export type Delimiter = ';' | ',' | '\t'

const BOM = '﻿'

/** Bytes -> texto. UTF-8 (com ou sem BOM); se não for UTF-8 válido, Windows-1252. */
export function decodeCsvBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/** Escolhe o separador pela primeira linha (fora de aspas). Empate vale ";" (padrão do Excel brasileiro). */
export function detectDelimiter(text: string): Delimiter {
  const counts: Record<Delimiter, number> = { ';': 0, ',': 0, '\t': 0 }
  let quoted = false
  for (const ch of text.replace(/^﻿/, '')) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && (ch === '\n' || ch === '\r')) break
    else if (!quoted && ch in counts) counts[ch as Delimiter] += 1
  }
  if (counts[';'] >= counts[','] && counts[';'] >= counts['\t']) return ';'
  return counts[','] >= counts['\t'] ? ',' : '\t'
}

export interface ParsedCsv {
  rows: string[][]
  /** Número da linha do arquivo onde cada registro começa (1 = primeira linha). */
  lines: number[]
  /** Há aspas abertas e nunca fechadas: o arquivo está truncado ou mal formado. */
  unterminated: boolean
}

/** Lê o texto do CSV. Aceita aspas, aspas duplas escapadas, quebra de linha dentro de aspas e CRLF/LF/CR. Linhas vazias são ignoradas. */
export function parseCsv(input: string, delimiter?: Delimiter): ParsedCsv {
  const text = input.replace(/^﻿/, '')
  const sep = delimiter ?? detectDelimiter(text)
  const rows: string[][] = []
  const lines: number[] = []

  let row: string[] = []
  let cell = ''
  let quoted = false
  let line = 1
  let startLine = 1

  const endCell = () => {
    row.push(cell)
    cell = ''
  }
  const endRow = () => {
    endCell()
    if (row.some((c) => c.trim() !== '')) {
      rows.push(row)
      lines.push(startLine)
    }
    row = []
  }

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        if (ch === '\n') line += 1
        cell += ch
      }
    } else if (ch === '"' && cell === '') {
      quoted = true
    } else if (ch === sep) {
      endCell()
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1
      endRow()
      line += 1
      startLine = line
    } else {
      cell += ch
    }
  }
  if (cell !== '' || row.length > 0) endRow()

  return { rows, lines, unterminated: quoted }
}

/**
 * Evita "injeção de fórmula": uma célula de texto que começa com = + - @ seria executada pelo Excel.
 * O apóstrofo na frente faz o Excel tratar como texto. `unprotectCell` desfaz isso na importação.
 */
export function protectCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

export function unprotectCell(value: string): string {
  return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value
}

function escapeCell(value: string, sep: Delimiter): string {
  return value.includes(sep) || /["\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** Monta o CSV (separador ";", linhas CRLF, BOM no começo). As células de texto são protegidas contra fórmulas. */
export function toCsv(rows: string[][], sep: Delimiter = ';'): string {
  return BOM + rows.map((r) => r.map((c) => escapeCell(protectCell(c), sep)).join(sep)).join('\r\n') + '\r\n'
}
