// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
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

  it('traz o menu principal junto do logo, no topo, com a tela atual marcada', () => {
    render(
      <MemoryRouter initialEntries={['/receber/pessoa/p1']}>
        <AppHeader />
      </MemoryRouter>,
    )
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Início', '/'],
      ['Contas', '/contas'],
      ['A receber', '/receber'],
      ['Ajustes', '/ajustes'],
    ])
    expect(within(nav).getByRole('link', { name: 'A receber' }).getAttribute('aria-current')).toBe('page')
    expect(within(nav).getByRole('link', { name: 'Início' }).getAttribute('aria-current')).toBeNull()
    // o menu fica dentro do cabeçalho do topo
    expect(document.querySelector('header.app-header nav.main-nav')).toBeTruthy()
  })
})
