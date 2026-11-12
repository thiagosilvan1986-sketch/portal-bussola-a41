import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Pasta do app (onde ficam o package.json e o node_modules).
const APP_DIR = fileURLToPath(new URL('../../', import.meta.url))

/**
 * No Netlify, as funções rodam sem poder carregar módulo ESM com require(). O firebase-admin 14 usa o jwks-rsa,
 * que faz require('jose'): com o jose 6 (só ESM) a função quebrava ao iniciar (ERR_REQUIRE_ESM) e nenhum aviso saía.
 * O "overrides" do package.json prende o jose na versão 4, que também tem CommonJS. Este teste carrega o Firebase
 * do mesmo jeito que o servidor, para o problema não voltar numa atualização de pacote.
 */
describe('carregamento das funções do servidor', () => {
  it('o firebase-admin carrega com require(), sem suporte a módulo ESM', () => {
    const out = execFileSync(
      process.execPath,
      [
        '--no-experimental-require-module',
        '-e',
        "require('firebase-admin/app'); require('firebase-admin/auth'); require('firebase-admin/firestore'); console.log('ok')",
      ],
      { cwd: APP_DIR, encoding: 'utf8' },
    )
    expect(out.trim()).toBe('ok')
  }, 30_000)

  it('o jwks-rsa usa um jose que o require() consegue carregar', () => {
    const out = execFileSync(
      process.execPath,
      ['--no-experimental-require-module', '-e', "const j = require('jwks-rsa'); console.log(typeof j)"],
      { cwd: APP_DIR, encoding: 'utf8' },
    )
    expect(out.trim()).toBe('function')
  }, 30_000)
})
