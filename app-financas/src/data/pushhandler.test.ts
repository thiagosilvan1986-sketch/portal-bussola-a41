/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

type Listener = (event: unknown) => void

/** Roda public/push-handler.js num "self" de mentira, como o service worker faria. */
function load() {
  const listeners: Record<string, Listener> = {}
  const showNotification = vi.fn(() => Promise.resolve())
  const openWindow = vi.fn(() => Promise.resolve())
  const matchAll = vi.fn(() => Promise.resolve([] as unknown[]))
  const self = {
    addEventListener: (type: string, fn: Listener) => void (listeners[type] = fn),
    registration: { showNotification },
    clients: { matchAll, openWindow },
  }
  new Function('self', readFileSync('public/push-handler.js', 'utf8'))(self)
  return { listeners, showNotification, openWindow, matchAll }
}

const pushEvent = (data: unknown) => {
  const waits: Promise<unknown>[] = []
  return {
    event: { data: { json: () => data, text: () => String(data) }, waitUntil: (p: Promise<unknown>) => void waits.push(p) },
    done: () => Promise.all(waits),
  }
}

describe('push-handler.js', () => {
  it('mostra a notificação com o título e o texto que o servidor mandou', async () => {
    const { listeners, showNotification } = load()
    const { event, done } = pushEvent({ title: '2 contas estão perto de vencer', body: 'Amanhã: Luz, Água', url: '/', tag: 'vencimentos' })
    listeners.push(event)
    await done()
    expect(showNotification).toHaveBeenCalledWith('2 contas estão perto de vencer', expect.objectContaining({ body: 'Amanhã: Luz, Água', tag: 'vencimentos', lang: 'pt-BR' }))
  })

  it('sem conteúdo, ainda mostra uma notificação (o navegador exige)', async () => {
    const { listeners, showNotification } = load()
    const waits: Promise<unknown>[] = []
    listeners.push({ data: null, waitUntil: (p: Promise<unknown>) => void waits.push(p) })
    await Promise.all(waits)
    expect(showNotification).toHaveBeenCalledWith('Contas em Dia', expect.objectContaining({ body: '' }))
  })

  it('texto que não é JSON vira o corpo da notificação', async () => {
    const { listeners, showNotification } = load()
    const waits: Promise<unknown>[] = []
    listeners.push({
      data: { json: () => { throw new Error('não é json') }, text: () => 'oi' },
      waitUntil: (p: Promise<unknown>) => void waits.push(p),
    })
    await Promise.all(waits)
    expect(showNotification).toHaveBeenCalledWith('Contas em Dia', expect.objectContaining({ body: 'oi' }))
  })

  it('ao tocar, fecha a notificação e abre o app no endereço indicado', async () => {
    const { listeners, openWindow } = load()
    const close = vi.fn()
    const waits: Promise<unknown>[] = []
    listeners.notificationclick({ notification: { close, data: { url: '/cadastros/alertas' } }, waitUntil: (p: Promise<unknown>) => void waits.push(p) })
    await Promise.all(waits)
    expect(close).toHaveBeenCalled()
    expect(openWindow).toHaveBeenCalledWith('/cadastros/alertas')
  })

  it('se o app já está aberto, usa essa janela', async () => {
    const { listeners, matchAll, openWindow } = load()
    const focus = vi.fn(() => Promise.resolve())
    const navigate = vi.fn(() => Promise.resolve())
    matchAll.mockResolvedValueOnce([{ focus, navigate }])
    const waits: Promise<unknown>[] = []
    listeners.notificationclick({ notification: { close: vi.fn(), data: { url: '/' } }, waitUntil: (p: Promise<unknown>) => void waits.push(p) })
    await Promise.all(waits)
    expect(navigate).toHaveBeenCalledWith('/')
    expect(focus).toHaveBeenCalled()
    expect(openWindow).not.toHaveBeenCalled()
  })
})
