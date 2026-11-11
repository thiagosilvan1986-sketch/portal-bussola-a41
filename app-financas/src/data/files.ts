import { decodeCsvBytes } from '../domain/csv'
import { MAX_IMPORT_BYTES } from '../domain/transfer'

/** Lê um arquivo CSV escolhido pela pessoa (UTF-8 ou o formato do Excel brasileiro). */
export async function readCsvFile(file: File): Promise<string> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error('O arquivo é grande demais (o limite é 1 MB). Divida em arquivos menores.')
  return decodeCsvBytes(new Uint8Array(await file.arrayBuffer()))
}

/** App instalado na tela inicial (Android/iPhone): lá um link de download não costuma funcionar bem. */
function isInstalledApp(): boolean {
  return (
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
    (navigator as { standalone?: boolean }).standalone === true
  )
}

/**
 * Entrega o CSV à pessoa. No app instalado abre a folha de compartilhar (Salvar em Arquivos, e-mail, WhatsApp…);
 * no navegador, baixa o arquivo.
 */
export async function saveCsv(filename: string, content: string): Promise<void> {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })

  if (isInstalledApp() && typeof navigator.canShare === 'function') {
    const file = new File([blob], filename, { type: 'text/csv' })
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return // a pessoa fechou a folha
        // qualquer outra falha: tenta o download comum
      }
    }
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
