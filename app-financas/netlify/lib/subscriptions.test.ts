import { describe, expect, it } from 'vitest'
import { isPushEndpoint, parseSubscription } from './subscriptions'

describe('isPushEndpoint', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/abc',
    'https://wns2-by3p.notify.windows.com/w/?token=abc',
  ])('aceita %s', (url) => expect(isPushEndpoint(url)).toBe(true))

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://exemplo.com/push',
    'https://fcm.googleapis.com.exemplo.com/x',
    'https://evilgoogleapis.com/x',
    'https://user:senha@fcm.googleapis.com/x',
    'https://fcm.googleapis.com:8443/x',
    'https://169.254.169.254/latest/meta-data',
    'not a url',
    '',
  ])('recusa %s', (url) => expect(isPushEndpoint(url)).toBe(false))

  it('recusa o que não é texto', () => {
    expect(isPushEndpoint(undefined)).toBe(false)
    expect(isPushEndpoint(42)).toBe(false)
  })
})

describe('parseSubscription', () => {
  const ok = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'p', auth: 'a' }, label: 'Android · Chrome' }
  it('lê um cadastro completo', () => {
    expect(parseSubscription('id1', ok)).toEqual({ id: 'id1', endpoint: ok.endpoint, keys: { p256dh: 'p', auth: 'a' } })
  })
  it('recusa cadastro incompleto ou com endereço estranho', () => {
    expect(parseSubscription('x', undefined)).toBeNull()
    expect(parseSubscription('x', { ...ok, keys: undefined })).toBeNull()
    expect(parseSubscription('x', { ...ok, keys: { p256dh: 'p' } })).toBeNull()
    expect(parseSubscription('x', { ...ok, keys: { p256dh: '', auth: 'a' } })).toBeNull()
    expect(parseSubscription('x', { ...ok, endpoint: 'https://exemplo.com/x' })).toBeNull()
  })
})
