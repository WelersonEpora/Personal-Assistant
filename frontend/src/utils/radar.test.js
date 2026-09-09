import { test } from 'node:test'
import assert from 'node:assert/strict'

import { tipoMeta, dataInformada, agruparPorEntrada, filtrarPorBusca, normalizar, TIPO_META, legendaTipos } from './radar.js'

test('tipoMeta: tipo conhecido devolve rótulo/família; desconhecido cai em "outro"', () => {
  assert.equal(tipoMeta('meta_analise').rotulo, 'Meta-análise')
  assert.equal(tipoMeta('meta_analise').familia, 'sintese')
  assert.equal(tipoMeta('diretriz').badge, 'primary')
  assert.equal(tipoMeta('diretriz').familia, 'entidade')
  assert.equal(tipoMeta('estudo_primario').familia, 'estudo')
  assert.equal(tipoMeta('xpto'), TIPO_META.outro)
  assert.equal(tipoMeta(undefined).rotulo, 'Publicação')
})

test('legendaTipos: 3 famílias na ordem fixa, cobrindo todos os tipos de TIPO_META', () => {
  const legenda = legendaTipos()
  assert.deepEqual(legenda.map((f) => f.chave), ['entidade', 'sintese', 'estudo'])

  const tiposNaLegenda = legenda.flatMap((f) => f.tipos.map((t) => t.chave))
  assert.deepEqual(tiposNaLegenda.sort(), Object.keys(TIPO_META).sort())

  const meta = legenda.find((f) => f.chave === 'sintese').tipos.find((t) => t.chave === 'meta_analise')
  assert.equal(meta.rotulo, 'Meta-análise')
  assert.equal(meta.badge, 'info')
  assert.match(meta.descricao, /efeito único/)
})

test('dataInformada: normaliza / trata vazio', () => {
  assert.equal(dataInformada('  2026-08  '), '2026-08')
  assert.equal(dataInformada(''), null)
  assert.equal(dataInformada(null), null)
  assert.equal(dataInformada(42), null)
})

test('agruparPorEntrada: um grupo por data de entrada (rodada), na ordem em que os itens chegam', () => {
  const itens = [
    { id: 'a', created_at: '2026-09-20T12:00:00Z' },
    { id: 'b', created_at: '2026-09-20T12:04:00Z' },
    { id: 'c', created_at: '2026-09-13T09:00:00Z' },
    { id: 'd', created_at: '2026-09-13T09:02:00Z' }
  ]
  const grupos = agruparPorEntrada(itens)
  assert.equal(grupos.length, 2)
  assert.equal(grupos[0].rotulo, 'Incluído em 20/09/2026')
  assert.deepEqual(grupos[0].itens.map((i) => i.id), ['a', 'b'])
  assert.equal(grupos[1].rotulo, 'Incluído em 13/09/2026')
  assert.deepEqual(grupos[1].itens.map((i) => i.id), ['c', 'd'])
})

test('agruparPorEntrada: lista vazia -> nenhum grupo', () => {
  assert.deepEqual(agruparPorEntrada([]), [])
})

test('normalizar: minúsculas, sem acento, tolera não-string', () => {
  assert.equal(normalizar('Análise da Força'), 'analise da forca')
  assert.equal(normalizar('HIPERTROFIA'), 'hipertrofia')
  assert.equal(normalizar(null), '')
  assert.equal(normalizar(undefined), '')
})

test('filtrarPorBusca: casa título, resumo e assuntos sem acento; termo vazio devolve tudo', () => {
  const itens = [
    { id: 'a', titulo: 'Meta-análise de sprint', resumo: 'efeito no desempenho', assuntos: ['velocidade'] },
    { id: 'b', titulo: 'Diretriz de força', resumo: 'recomendações para idosos', assuntos: ['forca', 'populacoes'] },
    { id: 'c', titulo: 'Suplementação e desempenho', resumo: 'revisão guarda-chuva', assuntos: ['creatina'] }
  ]
  assert.deepEqual(filtrarPorBusca(itens, 'analise').map((i) => i.id), ['a'])
  assert.deepEqual(filtrarPorBusca(itens, 'FORCA').map((i) => i.id), ['b'])
  assert.deepEqual(filtrarPorBusca(itens, 'creatina').map((i) => i.id), ['c']) // só nos assuntos
  assert.deepEqual(filtrarPorBusca(itens, '   ').map((i) => i.id), ['a', 'b', 'c'])
  assert.deepEqual(filtrarPorBusca(itens, 'natação'), [])
})
