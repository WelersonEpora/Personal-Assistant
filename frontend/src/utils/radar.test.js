import { test } from 'node:test'
import assert from 'node:assert/strict'

import { tipoMeta, dataInformada, agruparPorMes, TIPO_META } from './radar.js'

test('tipoMeta: tipo conhecido devolve rótulo/família; desconhecido cai em "outro"', () => {
  assert.equal(tipoMeta('meta_analise').rotulo, 'Meta-análise')
  assert.equal(tipoMeta('meta_analise').familia, 'sintese')
  assert.equal(tipoMeta('diretriz').badge, 'primary')
  assert.equal(tipoMeta('diretriz').familia, 'entidade')
  assert.equal(tipoMeta('estudo_primario').familia, 'estudo')
  assert.equal(tipoMeta('xpto'), TIPO_META.outro)
  assert.equal(tipoMeta(undefined).rotulo, 'Publicação')
})

test('dataInformada: normaliza / trata vazio', () => {
  assert.equal(dataInformada('  2026-08  '), '2026-08')
  assert.equal(dataInformada(''), null)
  assert.equal(dataInformada(null), null)
  assert.equal(dataInformada(42), null)
})

test('agruparPorMes: um grupo por mês, na ordem em que os itens chegam', () => {
  const itens = [
    { id: 'a', created_at: '2026-09-20T12:00:00Z' },
    { id: 'b', created_at: '2026-09-03T09:00:00Z' },
    { id: 'c', created_at: '2026-08-28T09:00:00Z' },
    { id: 'd', created_at: '2026-08-01T09:00:00Z' }
  ]
  const grupos = agruparPorMes(itens)
  assert.equal(grupos.length, 2)
  assert.match(grupos[0].rotulo, /Setembro de 2026/)
  assert.deepEqual(grupos[0].itens.map((i) => i.id), ['a', 'b'])
  assert.match(grupos[1].rotulo, /Agosto de 2026/)
  assert.deepEqual(grupos[1].itens.map((i) => i.id), ['c', 'd'])
})

test('agruparPorMes: lista vazia -> nenhum grupo', () => {
  assert.deepEqual(agruparPorMes([]), [])
})
