// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { AppHeader } from './AppHeader'

afterEach(cleanup)

describe('Cabeçalho do app', () => {
  it('mostra o logo e leva para o início', () => {
    render(
      <MemoryRouter initialEntries={['/contas']}>
        <AppHeader />
      </MemoryRouter>,
    )
    expect(screen.getByAltText('Contas em Dia').getAttribute('src')).toBe('/logo-horizontal.webp')
    expect(screen.getByRole('link', { name: /ir para o início/i }).getAttribute('href')).toBe('/')
  })
})
