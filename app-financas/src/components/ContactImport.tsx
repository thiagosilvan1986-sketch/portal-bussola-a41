import { useRef, useState } from 'react'
import { parseVCards, type ContactData } from '../domain/contacts'

interface Props {
  /** Recebe o contato importado; quem usa preenche os campos e a pessoa confere antes de salvar. */
  onPick: (contact: ContactData) => void
}

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

/** O que veio no arquivo, para a pessoa saber o que chegou. */
function receivedText(c: ContactData): string {
  const got = [c.name && 'nome', c.phone && 'telefone', c.email && 'e-mail'].filter(Boolean)
  const digits = c.phone.replace(/\D/g, '')
  const ddd = c.phone && digits.length < 10 ? ' O telefone veio sem DDD: acrescente antes de salvar.' : ''
  return got.length === 0 ? '' : ` Recebido: ${got.join(', ')}.${ddd}`
}

/**
 * Preencher a pessoa a partir de um arquivo de contato (.vcf), exportado pelo app Contatos do celular.
 * A agenda do navegador foi tirada (v1.16): em celulares Samsung ela não deixava marcar o contato. Digitar continua valendo.
 */
export function ContactImport({ onPick }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  async function fromFile(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setMessage(null)
    try {
      const contacts = parseVCards(await readText(file))
      if (contacts.length === 0) {
        setMessage({ text: 'Não encontrei nenhum contato nesse arquivo. Use um arquivo .vcf de contato.', error: true })
      } else {
        const c = contacts[0]
        onPick(c)
        const extra = contacts.length > 1 ? ` O arquivo tem ${contacts.length} contatos; usei o primeiro.` : ''
        setMessage({ text: `Contato importado${c.name ? `: ${c.name}` : ''}.${receivedText(c)} Confira os dados antes de salvar.${extra}`, error: false })
      }
    } catch (e) {
      console.error(e)
      setMessage({ text: 'Não foi possível ler o arquivo. Tente de novo ou digite os dados.', error: true })
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="contact-import stack">
      <div className="actions">
        <button type="button" className="btn small" onClick={() => fileRef.current?.click()}>
          Importar contato (.vcf)
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".vcf,text/vcard,text/x-vcard,text/directory"
          hidden
          aria-label="Arquivo de contato (.vcf)"
          onChange={(e) => void fromFile(e.target.files)}
        />
      </div>
      <details className="contact-howto" open>
        <summary>Como importar da agenda do celular</summary>
        <ol className="muted small-note">
          <li>Abra o app Contatos do celular e toque na pessoa.</li>
          <li>
            <strong>Android (Samsung e outros):</strong> toque em Compartilhar (ou no menu ⋮ e em Compartilhar) e escolha Arquivo vCard (.vcf).
            Salve o arquivo.
          </li>
          <li>
            <strong>iPhone:</strong> toque em Compartilhar contato e em Salvar em Arquivos.
          </li>
          <li>Volte aqui, toque em Importar contato (.vcf) e escolha o arquivo. Nome, telefone e e-mail vêm preenchidos.</li>
        </ol>
      </details>
      {message && (
        <p className={message.error ? 'error small-note' : 'muted small-note'} role={message.error ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
    </div>
  )
}
