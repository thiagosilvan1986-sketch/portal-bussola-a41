import { useEffect, useRef, useState } from 'react'
import { parseVCards, pickPhoneContact, supportsContactPicker, type ContactData } from '../domain/contacts'

interface Props {
  /** Recebe o contato escolhido; quem usa preenche os campos e a pessoa confere antes de salvar. */
  onPick: (contact: ContactData) => void
}

/*
 * A agenda do celular abre por cima do navegador. Alguns celulares recarregam a página (ou a tela) nesse meio-tempo
 * e o contato escolhido se perdia. Por isso o app anota que a agenda está aberta e guarda o contato recebido por
 * alguns minutos nesta aba (sessionStorage): a tela que estiver aberta ao voltar preenche os campos ou explica o que houve.
 */
const OPEN_KEY = 'contas-em-dia:agenda-aberta'
const RESULT_KEY = 'contas-em-dia:agenda-contato'
const RESULT_EVENT = 'contas-em-dia:agenda-contato'
const FRESH_MS = 3 * 60 * 1000

function store(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), path: window.location.pathname, value }))
  } catch {
    /* sem armazenamento: segue sem a proteção */
  }
}
function take<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    sessionStorage.removeItem(key)
    const { at, path, value } = JSON.parse(raw) as { at: number; path: string; value: T }
    // Só vale na mesma tela em que a agenda foi aberta, e por poucos minutos.
    return Date.now() - at < FRESH_MS && path === window.location.pathname ? value : null
  } catch {
    return null
  }
}

/** O que veio da agenda, para a pessoa (e o suporte) saberem o que chegou. */
function receivedText(c: ContactData): string {
  const got = [c.name && 'nome', c.phone && 'telefone', c.email && 'e-mail'].filter(Boolean)
  const digits = c.phone.replace(/\D/g, '')
  const ddd = c.phone && digits.length < 10 ? ' O telefone veio sem DDD: acrescente antes de salvar.' : ''
  return got.length === 0 ? '' : ` Recebido: ${got.join(', ')}.${ddd}`
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
  const [noContact, setNoContact] = useState(false)
  const canPick = supportsContactPicker()

  function done(contact: ContactData, extra = '') {
    if (!contact.name && !contact.phone && !contact.email) {
      setMessage({ text: 'A agenda devolveu o contato sem nome, telefone nem e-mail. Confira se esses dados estão marcados na agenda, ou digite.', error: true })
      return
    }
    onPick(contact)
    setMessage({
      text: `Contato importado${contact.name ? `: ${contact.name}` : ''}.${receivedText(contact)} Confira os dados antes de salvar.${extra}`,
      error: false,
    })
  }
  const doneRef = useRef(done)
  useEffect(() => {
    doneRef.current = done
  })

  // Ao abrir a tela (ou quando a agenda responde depois de a tela ter sido refeita), usa o contato guardado.
  useEffect(() => {
    const apply = () => {
      const saved = take<ContactData & { extra?: string }>(RESULT_KEY)
      if (saved) {
        sessionStorage.removeItem(OPEN_KEY)
        const { extra = '', ...contact } = saved
        doneRef.current(contact, extra)
        return
      }
      if (take<boolean>(OPEN_KEY)) {
        setMessage({
          text: 'A agenda foi aberta, mas o app recarregou antes de receber o contato. Tente de novo; se repetir, use “Importar contato (.vcf)” ou digite os dados.',
          error: true,
        })
      }
    }
    apply()
    window.addEventListener(RESULT_EVENT, apply)
    return () => window.removeEventListener(RESULT_EVENT, apply)
  }, [])

  async function fromPhone() {
    setMessage(null)
    store(OPEN_KEY, true)
    try {
      const result = await pickPhoneContact()
      if (!result) {
        try {
          sessionStorage.removeItem(OPEN_KEY)
        } catch {
          /* nada */
        }
        setNoContact(true)
        setMessage({ text: 'Nenhum contato foi escolhido. Toque na caixinha do contato até aparecer a marca e depois em Concluído.', error: true })
        return
      }
      setNoContact(false)
      const extra = result.picked > 1 ? ` Vieram ${result.picked} contatos; usei o primeiro.` : ''
      store(RESULT_KEY, { ...result.contact, extra })
      window.dispatchEvent(new Event(RESULT_EVENT))
    } catch (e) {
      try {
        sessionStorage.removeItem(OPEN_KEY)
      } catch {
        /* nada */
      }
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
      {noContact && (
        <p className="muted small-note">
          Se o celular não deixar marcar o contato: abra o app Contatos, toque na pessoa, em Compartilhar e em Arquivo vCard (.vcf). Salve o
          arquivo e toque aqui em Importar contato (.vcf).
        </p>
      )}
    </div>
  )
}
