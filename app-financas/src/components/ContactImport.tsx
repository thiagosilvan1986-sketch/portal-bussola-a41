import { useRef, useState } from 'react'
import { parseVCards, pickPhoneContact, supportsContactPicker, type ContactData } from '../domain/contacts'

interface Props {
  /** Recebe o contato escolhido; quem usa preenche os campos e a pessoa confere antes de salvar. */
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

/**
 * Preencher a pessoa a partir de um contato: pela agenda do celular (Android) ou por um arquivo .vcf (iPhone e outros).
 * Digitar continua sempre possível.
 */
export function ContactImport({ onPick }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const canPick = supportsContactPicker()

  function done(contact: ContactData, extra = '') {
    onPick(contact)
    setMessage({ text: `Contato importado${contact.name ? `: ${contact.name}` : ''}. Confira os dados antes de salvar.${extra}`, error: false })
  }

  async function fromPhone() {
    setMessage(null)
    try {
      const contact = await pickPhoneContact()
      if (contact) done(contact)
    } catch (e) {
      console.error(e)
      setMessage({ text: 'Não foi possível abrir a agenda. Importe um arquivo .vcf ou digite os dados.', error: true })
    }
  }

  async function fromFile(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setMessage(null)
    try {
      const contacts = parseVCards(await readText(file))
      if (contacts.length === 0) {
        setMessage({ text: 'Não encontrei nenhum contato nesse arquivo. Use um arquivo .vcf de contato.', error: true })
      } else {
        done(contacts[0], contacts.length > 1 ? ` O arquivo tem ${contacts.length} contatos; usei o primeiro.` : '')
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
        {canPick && (
          <button type="button" className="btn small" onClick={() => void fromPhone()}>
            Escolher da agenda do celular
          </button>
        )}
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
      {!canPick && (
        <p className="muted small-note">
          No iPhone: abra o contato, toque em Compartilhar contato, salve em Arquivos e depois toque em Importar contato (.vcf).
        </p>
      )}
      {message && (
        <p className={message.error ? 'error small-note' : 'muted small-note'} role={message.error ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
    </div>
  )
}
