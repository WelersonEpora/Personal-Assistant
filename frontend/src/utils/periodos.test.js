import { test } from 'node:test'
import assert from 'node:assert/strict'

import { PRESETS_PERIODO, resolverPeriodo, periodoPronto } from './periodos.js'

// Lógica pura dos presets de período (SeletorPeriodo.vue só desenha).

const HOJE = new Date().toISOString().slice(0, 10)

test('resolverPeriodo: mes_atual vai do dia 1 até hoje', () => {
  const { de, ate } = resolverPeriodo('mes_atual')
  assert.equal(de, `${HOJE.slice(0, 8)}01`)
  assert.equal(ate, HOJE)
})

test('resolverPeriodo: ultimos_30 / ultimos_90 terminam hoje e têm a amplitude certa', () => {
  const dias = (chave) => {
    const { de, ate } = resolverPeriodo(chave)
    return Math.round((Date.parse(ate) - Date.parse(de)) / 86_400_000)
  }
  assert.equal(dias('ultimos_30'), 29)
  assert.equal(dias('ultimos_90'), 89)
})

test('resolverPeriodo: ano_atual começa em 1º de janeiro', () => {
  const { de } = resolverPeriodo('ano_atual')
  assert.equal(de, `${HOJE.slice(0, 4)}-01-01`)
})

test('resolverPeriodo: tudo => sem limites', () => {
  assert.deepEqual(resolverPeriodo('tudo'), { de: null, ate: null })
})

test('resolverPeriodo: personalizado usa as datas do seletor', () => {
  assert.deepEqual(resolverPeriodo('personalizado', { de: '2026-01-10', ate: '2026-02-20' }), {
    de: '2026-01-10',
    ate: '2026-02-20'
  })
})

test('resolverPeriodo: mes_passado cobre o mês inteiro anterior', () => {
  // referência fixa não dá pra injetar; valida a forma: de = dia 1, ate = fim do mês
  const { de, ate } = resolverPeriodo('mes_passado')
  assert.match(de, /^\d{4}-\d{2}-01$/)
  assert.equal(de.slice(0, 7), ate.slice(0, 7))
  assert.ok(Number(ate.slice(8)) >= 28)
})

test('periodoPronto: só "personalizado" exige as duas datas coerentes', () => {
  assert.equal(periodoPronto('ultimos_90'), true)
  assert.equal(periodoPronto('tudo'), true)
  assert.equal(periodoPronto('personalizado', { de: '', ate: '' }), false)
  assert.equal(periodoPronto('personalizado', { de: '2026-05-01', ate: '2026-04-01' }), false)
  assert.equal(periodoPronto('personalizado', { de: '2026-04-01', ate: '2026-05-01' }), true)
})

test('PRESETS_PERIODO: chaves esperadas na ordem', () => {
  assert.deepEqual(
    PRESETS_PERIODO.map((p) => p.chave),
    ['mes_atual', 'mes_passado', 'ultimos_30', 'ultimos_90', 'ano_atual', 'tudo', 'personalizado']
  )
})
