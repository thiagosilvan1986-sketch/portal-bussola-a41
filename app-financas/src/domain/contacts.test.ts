import { describe, expect, it } from 'vitest'
import { parseVCards } from './contacts'

describe('arquivo .vcf', () => {
  const iphone = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'N:Souza;Ana;Maria;;',
    'FN:Ana Maria Souza',
    'item1.EMAIL;type=INTERNET;type=pref:ana@exemplo.com',
    'item2.TEL;type=pref:(11) 3333-4444',
    'TEL;type=CELL;type=VOICE:+55 11 98765-4321',
    'PHOTO;ENCODING=b;TYPE=JPEG:AAAA',
    ' BBBB',
    'END:VCARD',
    '',
  ].join('\r\n')

  it('lê o cartão do iPhone: nome, e-mail e de preferência o celular', () => {
    expect(parseVCards(iphone)).toEqual([{ name: 'Ana Maria Souza', phone: '(11) 98765-4321', email: 'ana@exemplo.com' }])
  })

  it('lê o cartão antigo do Android: quoted-printable com acentos e sem FN', () => {
    const android = [
      'BEGIN:VCARD',
      'VERSION:2.1',
      'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Concei=C3=A7=C3=A3o;Jo=C3=A3o;;;',
      'TEL;CELL:11987654321',
      'END:VCARD',
    ].join('\n')
    expect(parseVCards(android)).toEqual([{ name: 'João Conceição', phone: '(11) 98765-4321', email: '' }])
  })

  it('une linhas dobradas e continuações do quoted-printable', () => {
    const text = ['BEGIN:VCARD', 'FN;ENCODING=QUOTED-PRINTABLE;CHARSET=UTF-8:Jos=C3=', '=A9 Silva', 'EMAIL:jose@ex', ' emplo.com', 'END:VCARD'].join('\n')
    expect(parseVCards(text)).toEqual([{ name: 'José Silva', phone: '', email: 'jose@exemplo.com' }])
  })

  it('lê vários contatos e ignora os vazios e o que não é cartão', () => {
    const text = 'BEGIN:VCARD\nFN:Ana\nEND:VCARD\nBEGIN:VCARD\nNOTE:sem nada\nEND:VCARD\nBEGIN:VCARD\nFN:Bruno\nTEL:tel:+5521999998888\nEND:VCARD'
    expect(parseVCards(text)).toEqual([
      { name: 'Ana', phone: '', email: '' },
      { name: 'Bruno', phone: '(21) 99999-8888', email: '' },
    ])
    expect(parseVCards('isto não é um contato')).toEqual([])
    expect(parseVCards('')).toEqual([])
  })

  it('desfaz os escapes do vCard', () => {
    expect(parseVCards('BEGIN:VCARD\nFN:Silva\\, Ana\nEND:VCARD')[0].name).toBe('Silva, Ana')
  })
})
