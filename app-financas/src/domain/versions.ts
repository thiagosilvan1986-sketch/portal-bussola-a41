import type { IsoDate } from './types'

/**
 * Histórico de versões do app, uma por publicação. A cada publicação nova, acrescente uma linha no fim (1.15, 1.16…)
 * e atualize a `version` das funcionalidades que mudaram em `FeatureList.tsx`.
 */
export const VERSIONS: readonly { version: string; date: IsoDate; summary: string }[] = [
  { version: '1.0', date: '2026-11-09', summary: 'Contas recorrentes e painel' },
  { version: '1.1', date: '2026-11-10', summary: 'Logo, login com e-mail e senha' },
  { version: '1.2', date: '2026-11-10', summary: 'A receber: compras parceladas e cobrança' },
  { version: '1.3', date: '2026-11-11', summary: 'Planilhas, A receber em duas listas, menu no topo' },
  { version: '1.4', date: '2026-11-11', summary: 'Exclusão completa, olhinho, Incluir e Relatórios' },
  { version: '1.5', date: '2026-11-11', summary: 'Cadastros, Sobre e cabeçalho' },
  { version: '1.6', date: '2026-11-11', summary: 'Relatórios interativos' },
  { version: '1.7', date: '2026-11-11', summary: 'Parcelas, gasto real, copiar e contato da agenda' },
  { version: '1.8', date: '2026-11-11', summary: 'Dia do vencimento em lista e textos do Sobre' },
  { version: '1.9', date: '2026-11-11', summary: 'Avisos de vencimento' },
  { version: '1.10', date: '2026-11-11', summary: 'Aviso por e-mail' },
  { version: '1.11', date: '2026-11-12', summary: 'Ordenação das listas' },
  { version: '1.12', date: '2026-11-13', summary: 'Tamanho da letra e cores mais legíveis' },
  { version: '1.13', date: '2026-11-13', summary: 'Configurações, Contatos e relatório do mês' },
  { version: '1.14', date: '2026-11-13', summary: 'Versões no Sobre, nomes no mapa de vencimentos e agenda do celular' },
  { version: '1.15', date: '2026-11-13', summary: 'Agenda do celular no modo que deixa marcar o contato' },
  { version: '1.16', date: '2026-11-13', summary: 'Contatos por arquivo .vcf, um ou vários de uma vez, com o passo a passo na tela' },
  { version: '1.17', date: '2026-11-13', summary: 'Mapa de vencimentos: situação do pagamento em cada conta e detalhe ao tocar' },
  { version: '1.18', date: '2026-11-13', summary: 'Rateio de conta (parte da pessoa todo mês, com ou sem fim) e reembolso do cartão só com contas pagas no cartão' },
  { version: '1.19', date: '2026-11-13', summary: 'Rosquinha das categorias: nome, valor e % no centro ao passar o mouse' },
  { version: '1.20', date: '2026-11-13', summary: 'Início com tudo o que entra e sai, cadastro rápido de categoria e forma, Mês | Ano | Tudo em A receber e listas em ordem alfabética' },
  { version: '1.21', date: '2026-11-13', summary: 'Serviço prestado por mês: valor fixo ou variável, sem fim ou com parcelas' },
  { version: '1.22', date: '2026-11-13', summary: 'Listas que se ajustam a qualquer tamanho de letra, sem cortar palavras, e A receber com total, recebido e falta de cada pessoa' },
  { version: '1.23', date: '2026-11-14', summary: 'Saída em vermelho e entrada em verde em todo o app' },
]

export const CURRENT_VERSION = VERSIONS[VERSIONS.length - 1]

/** Data da versão, para mostrar ao lado de cada funcionalidade. */
export function versionDate(version: string): IsoDate | null {
  return VERSIONS.find((v) => v.version === version)?.date ?? null
}
