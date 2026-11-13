import { useRef, useState } from 'react'
import { createPeople } from '../data/store'
import { importCandidates, parseVCards, type ImportCandidate } from '../domain/contacts'
import { phoneDigits } from '../domain/receivables'
import { simplify } from '../domain/text'
import type { Person } from '../domain/types'
import { ContactHowTo, readText } from './ContactImport'

/**
 * Ajustes > Contatos > Importar contatos (.vcf): lê todos os contatos do arquivo, mostra a lista com caixinhas
 * (os que já existem vêm desmarcados, com "Já cadastrado") e cria os marcados de uma vez.
 */
export function ContactBatchImport({ uid, people }: { uid: string; people: readonly Person[] }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [list, setList] = useState<(ImportCandidate & { checked: boolean })[] | null>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  async function fromFile(files: FileList | null) {
    const file = files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    setMessage(null)
    try {
      const contacts = parseVCards(await readText(file))
      if (contacts.length === 0) {
        setList(null)
        setMessage({ text: 'Não encontrei nenhum contato nesse arquivo. Use um arquivo .vcf de contatos.', error: true })
        return
      }
      setList(importCandidates(contacts, people, simplify).map((c) => ({ ...c, checked: !c.duplicate })))
    } catch (e) {
      console.error(e)
      setMessage({ text: 'Não foi possível ler o arquivo. Tente de novo.', error: true })
    }
  }

  async function confirm() {
    if (!list) return
    const chosen = list.filter((c) => c.checked)
    if (chosen.length === 0) return
    setBusy(true)
    try {
      await createPeople(
        uid,
        chosen.map(({ contact }) => ({ name: contact.name, phone: phoneDigits(contact.phone), email: contact.email, tone: 'amigavel', charges: [] })),
      )
      const skipped = list.length - chosen.length
      setMessage({
        text: `${chosen.length === 1 ? '1 contato importado' : `${chosen.length} contatos importados`}.${skipped > 0 ? ` ${skipped} ficaram de fora.` : ''}`,
        error: false,
      })
      setList(null)
    } catch (e) {
      console.error(e)
      setMessage({ text: 'Não foi possível salvar os contatos. Tente de novo.', error: true })
    } finally {
      setBusy(false)
    }
  }

  const chosen = list?.filter((c) => c.checked).length ?? 0
  return (
    <section className="card stack" aria-label="Importar contatos">
      <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
        Importar contatos (.vcf)
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".vcf,text/vcard,text/x-vcard,text/directory"
        hidden
        aria-label="Arquivo de contatos (.vcf)"
        onChange={(e) => void fromFile(e.target.files)}
      />
      {!list && <ContactHowTo many />}
      {message && (
        <p className={message.error ? 'error small-note' : 'notice'} role={message.error ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
      {list && (
        <>
          <p className="muted">
            {list.length === 1 ? '1 contato no arquivo' : `${list.length} contatos no arquivo`}. Desmarque quem não quer importar.
          </p>
          <ul className="list import-contacts">
            {list.map((c, i) => (
              <li key={i} className="row-card">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={c.checked}
                    onChange={(e) => setList(list.map((x, k) => (k === i ? { ...x, checked: e.target.checked } : x)))}
                  />
                  <span className="row-main">
                    <span className="row-title">{c.contact.name}</span>
                    <span className="muted">{[c.contact.phone, c.contact.email].filter(Boolean).join(' · ') || 'Sem telefone nem e-mail'}</span>
                    {c.duplicate && (
                      <span className="chip chip-prevista">
                        <span aria-hidden="true">≡ </span>Já cadastrado
                      </span>
                    )}
                    {c.noDDD && <span className="muted small-note">Telefone sem DDD: complete depois em Editar.</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="actions">
            <button type="button" className="btn primary" disabled={busy || chosen === 0} onClick={() => void confirm()}>
              {chosen === 1 ? 'Importar 1 contato' : `Importar ${chosen} contatos`}
            </button>
            <button type="button" className="btn primary cancel-btn" onClick={() => setList(null)}>
              <span aria-hidden="true">✕</span> Cancelar
            </button>
          </div>
        </>
      )}
    </section>
  )
}
