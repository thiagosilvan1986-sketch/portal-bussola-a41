// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { PushError, endpointId, fetchPushConfig, pushSupport, sendTestPush, type PushEnvironment } from './push'

const env = (over: Partial<PushEnvironment> = {}): PushEnvironment => ({
  hasServiceWorker: true,
  hasPush: true,
  hasNotification: true,
  isIos: false,
  isStandalone: false,
  ...over,
})

const reply = (body: unknown, init: ResponseInit = { status: 200 }) =>
  vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), init)) as unknown as typeof fetch

describe('pushSupport', () => {
  it('navegador completo recebe aviso', () => {
    expect(pushSupport(env())).toBe('ok')
  })
  it('navegador sem push ou sem notificação não recebe', () => {
    expect(pushSupport(env({ hasPush: false }))).toBe('unsupported')
    expect(pushSupport(env({ hasNotification: false }))).toBe('unsupported')
    expect(pushSupport(env({ hasServiceWorker: false }))).toBe('unsupported')
  })
  it('iPhone no navegador pede para instalar o app primeiro', () => {
    expect(pushSupport(env({ isIos: true, isStandalone: false, hasPush: false }))).toBe('install-first')
  })
  it('iPhone com o app instalado recebe', () => {
    expect(pushSupport(env({ isIos: true, isStandalone: true }))).toBe('ok')
  })
  it('computador com o app instalado também recebe', () => {
    expect(pushSupport(env({ isStandalone: true }))).toBe('ok')
  })
})

describe('fetchPushConfig', () => {
  it('servidor ligado devolve a chave pública', async () => {
    expect(await fetchPushConfig(reply({ publicKey: 'BKey' }))).toEqual({ status: 'ready', publicKey: 'BKey' })
  })
  it('servidor sem configuração (503) é indisponível', async () => {
    expect(await fetchPushConfig(reply({ error: 'not_configured' }, { status: 503 }))).toEqual({ status: 'unavailable' })
  })
  it('resposta que não é JSON (a página do app no lugar da função) é indisponível', async () => {
    expect(await fetchPushConfig(reply('<!doctype html><html></html>'))).toEqual({ status: 'unavailable' })
  })
  it('sem chave na resposta ou sem rede é indisponível', async () => {
    expect(await fetchPushConfig(reply({}))).toEqual({ status: 'unavailable' })
    expect(await fetchPushConfig(reply({ publicKey: '' }))).toEqual({ status: 'unavailable' })
    expect(await fetchPushConfig((async () => Promise.reject(new TypeError('offline'))) as unknown as typeof fetch)).toEqual({ status: 'unavailable' })
  })
})

describe('endpointId', () => {
  it('é estável, em hexadecimal e sem "/"', async () => {
    const a = await endpointId('https://fcm.googleapis.com/fcm/send/abc')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await endpointId('https://fcm.googleapis.com/fcm/send/abc')).toBe(a)
    expect(await endpointId('https://fcm.googleapis.com/fcm/send/abd')).not.toBe(a)
  })
})

describe('sendTestPush', () => {
  it('manda o token e devolve quantos aparelhos receberam', async () => {
    const fetcher = reply({ sent: 2, total: 3 })
    expect(await sendTestPush('tok', fetcher)).toEqual({ sent: 2, total: 3 })
    expect(fetcher).toHaveBeenCalledWith('/.netlify/functions/send-test', { method: 'POST', headers: { authorization: 'Bearer tok' } })
  })
  it('repassa a mensagem de erro do servidor', async () => {
    const error = await sendTestPush('tok', reply({ error: 'Ative os avisos neste aparelho primeiro.' }, { status: 409 })).catch((e) => e)
    expect(error).toBeInstanceOf(PushError)
    expect(error.message).toBe('Ative os avisos neste aparelho primeiro.')
  })
  it('sem internet, explica', async () => {
    const error = await sendTestPush('tok', (async () => Promise.reject(new TypeError('offline'))) as unknown as typeof fetch).catch((e) => e)
    expect(error.message).toMatch(/Sem conexão/)
  })
})
