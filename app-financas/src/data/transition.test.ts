// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { withTransition } from './transition'

const doc = document as unknown as { startViewTransition?: unknown }

afterEach(() => {
  delete doc.startViewTransition
  vi.unstubAllGlobals()
})

describe('transição de tela', () => {
  it('sem suporte do navegador, muda direto', () => {
    const update = vi.fn()
    withTransition(update)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('com suporte, deixa o navegador animar a troca', () => {
    const start = vi.fn((callback: () => void) => callback())
    ;doc.startViewTransition = start
    const update = vi.fn()
    withTransition(update)
    expect(start).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('para quem pediu menos movimento, não anima', () => {
    const start = vi.fn()
    ;doc.startViewTransition = start
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const update = vi.fn()
    withTransition(update)
    expect(start).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledTimes(1)
  })
})
