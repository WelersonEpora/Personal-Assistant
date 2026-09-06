import { test } from 'node:test'
import assert from 'node:assert/strict'
import { propostaParaRascunho, confiancasDaProposta, DERIVADAS } from './avaliacaoFisica.js'

// docs/adr/0018 - a proposta da IA vira o rascunho que o formulário de
// avaliação física hidrata na tela de revisão.

test('propostaParaRascunho: sem dataFallback, usa data_ouvida; mapeia observacoes e medidas', () => {
  const r = propostaParaRascunho({
    data_ouvida: '2026-08-28',
    observacoes: 'aluno bem disposto',
    medidas: [
      { metrica_codigo: 'peso', metodo: 'direto', valor: 78.4, principal: true, confianca: 'alta' },
      { metrica_codigo: 'percentual_gordura', metodo: 'pollock_7', valor: 18, principal: true, confianca: 'media' }
    ]
  })
  assert.equal(r.data, '2026-08-28')
  assert.equal(r.observacoes, 'aluno bem disposto')
  assert.deepEqual(r.medidas, [
    { metrica_codigo: 'peso', metodo: 'direto', valor: 78.4, principal: true },
    { metrica_codigo: 'percentual_gordura', metodo: 'pollock_7', valor: 18, principal: true }
  ])
})

test('DERIVADAS espelha as métricas calculadas pelo service (imc, rcq, massa gorda/magra)', () => {
  assert.deepEqual([...DERIVADAS].sort(), ['imc', 'massa_gorda', 'massa_magra', 'rcq'])
})

test('propostaParaRascunho: descarta derivadas (incl. massa gorda/magra) e valores não positivos', () => {
  const r = propostaParaRascunho({
    medidas: [
      { metrica_codigo: 'imc', valor: 24.5 },
      { metrica_codigo: 'rcq', valor: 0.86 },
      { metrica_codigo: 'massa_gorda', valor: 14.1 },
      { metrica_codigo: 'massa_magra', valor: 64.3 },
      { metrica_codigo: 'altura', valor: 0 },
      { metrica_codigo: 'peso', valor: 80 }
    ]
  })
  assert.deepEqual(
    r.medidas.map((m) => m.metrica_codigo),
    ['peso']
  )
})

test('propostaParaRascunho: payload vazio devolve rascunho vazio utilizável', () => {
  const r = propostaParaRascunho()
  assert.deepEqual(r, { data: '', observacoes: '', medidas: [] })
})

test('propostaParaRascunho: metodo ausente vira "direto"', () => {
  const r = propostaParaRascunho({ medidas: [{ metrica_codigo: 'perimetro_cintura', valor: 84 }] })
  assert.equal(r.medidas[0].metodo, 'direto')
})

test('propostaParaRascunho: a data do atendimento do Registro sempre ganha de data_ouvida (docs/adr/0019)', () => {
  assert.equal(propostaParaRascunho({}, '2026-08-20').data, '2026-08-20')
  // mesmo com data_ouvida explícita, o dataFallback (data_atendimento) prevalece
  assert.equal(propostaParaRascunho({ data_ouvida: '2026-08-18' }, '2026-08-20').data, '2026-08-20')
  // sem dataFallback, cai para data_ouvida
  assert.equal(propostaParaRascunho({ data_ouvida: '2026-08-18' }).data, '2026-08-18')
})

test('confiancasDaProposta: mapeia confiança/trecho por metrica_codigo', () => {
  const mapa = confiancasDaProposta({
    medidas: [
      { metrica_codigo: 'peso', valor: 78.4, confianca: 'alta', trecho_origem: 'pesa setenta e oito quatro' },
      { metrica_codigo: 'dobra_subescapular', valor: 12, confianca: 'baixa', trecho_origem: 'acho que uns doze' }
    ]
  })
  assert.deepEqual(mapa, {
    peso: { confianca: 'alta', trecho_origem: 'pesa setenta e oito quatro' },
    dobra_subescapular: { confianca: 'baixa', trecho_origem: 'acho que uns doze' }
  })
})

test('confiancasDaProposta: ignora medida sem metrica_codigo/confianca; payload vazio devolve mapa vazio', () => {
  assert.deepEqual(confiancasDaProposta(), {})
  assert.deepEqual(confiancasDaProposta({ medidas: [{ valor: 10 }, { metrica_codigo: 'altura', valor: 178 }] }), {})
})
