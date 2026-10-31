import { test } from 'node:test'
import assert from 'node:assert/strict'

import { diaDe, inicioMesSeguinte, montarLinhaDoTempo, comDataAgrupada, resumoContagem } from './linhaDoTempo.js'

const relato = (id, dataAtendimento, extra = {}) => ({
  id,
  tipo: 'atendimento',
  status: 'confirmado',
  data_atendimento: dataAtendimento,
  created_at: `${dataAtendimento}T15:00:00`,
  validacao: { confirmado_em: `${dataAtendimento}T18:00:00` },
  ...extra
})

test('diaDe: data pura não sofre deslocamento de fuso', () => {
  assert.equal(diaDe('2026-10-01'), '2026-10-01')
  assert.equal(diaDe('2026-10-01T10:00:00'), '2026-10-01')
  assert.equal(diaDe(null), '')
})

test('inicioMesSeguinte vira o ano em dezembro', () => {
  assert.equal(inicioMesSeguinte('2026-10'), '2026-11-01')
  assert.equal(inicioMesSeguinte('2026-12'), '2027-01-01')
})

test('o mês atual sempre aparece, mesmo vazio', () => {
  const meses = montarLinhaDoTempo({ mesAtual: '2026-10' })
  assert.deepEqual(meses.map((m) => m.anoMes), ['2026-10'])
  assert.equal(meses[0].emAndamento, true)
})

test('eventos de tipos diferentes ficam numa lista só, do mais recente ao mais antigo', () => {
  const [mes] = montarLinhaDoTempo({
    mesAtual: '2026-10',
    registros: [relato('r1', '2026-10-02'), relato('r2', '2026-10-21')],
    analises: [{ id: 'a1', solicitada_em: '2026-10-23T10:00:00' }],
    observacoes: [{ id: 'o1', created_at: '2026-10-21T20:00:00' }],
    avaliacoesFisicas: [{ id: 'f1', data: '2026-10-09', created_at: '2026-10-09T09:00:00' }]
  })
  assert.deepEqual(mes.eventos.map((e) => e.chave), ['s:a1', 'o:o1', 'r:r2', 'f:f1', 'r:r1'])
  assert.deepEqual(mes.contagem, { relato: 2, fisica: 1, analise: 1, observacao: 1 })
})

test('relato cai no mês do atendimento; confirmado depois marca o mês em que conta no Acompanhamento', () => {
  const meses = montarLinhaDoTempo({
    mesAtual: '2026-11',
    registros: [relato('r1', '2026-10-30', { validacao: { confirmado_em: '2026-11-02T10:00:00' } })]
  })
  const outubro = meses.find((m) => m.anoMes === '2026-10')
  const novembro = meses.find((m) => m.anoMes === '2026-11')
  assert.equal(outubro.eventos[0].contaNoMes, '2026-11')
  assert.equal(outubro.confirmadosNoMes, 0)
  assert.equal(novembro.confirmadosNoMes, 1)
  assert.equal(novembro.eventos.length, 0)
})

test('relato pendente conta como pendente do mês do atendimento, sem marca', () => {
  const [mes] = montarLinhaDoTempo({
    mesAtual: '2026-10',
    registros: [relato('r1', '2026-10-30', { status: 'aguardando_revisao', validacao: null })]
  })
  assert.equal(mes.pendentes, 1)
  assert.equal(mes.confirmadosNoMes, 0)
  assert.equal(mes.eventos[0].contaNoMes, null)
})

test('avaliação física capturada por voz aparece uma vez só, pela avaliação', () => {
  const [mes] = montarLinhaDoTempo({
    mesAtual: '2026-10',
    registros: [
      relato('rf', '2026-10-09', { tipo: 'avaliacao_fisica' }),
      relato('rp', '2026-10-12', { tipo: 'avaliacao_fisica', status: 'aguardando_revisao', validacao: null })
    ],
    avaliacoesFisicas: [{ id: 'f1', data: '2026-10-09', registro_id: 'rf', created_at: '2026-10-09T09:00:00' }]
  })
  assert.deepEqual(mes.eventos.map((e) => `${e.tipo}:${e.chave}`), ['fisica:r:rp', 'fisica:f:f1'])
  assert.equal(mes.pendentes, 0) // captura de avaliação física não entra na conta de relatos
})

test('Acompanhamento Mensal fica no mês de referência, fora da lista de eventos', () => {
  const meses = montarLinhaDoTempo({
    mesAtual: '2026-10',
    mensais: [{ id: 'm9', ano_mes: '2026-09', gerada_em: '2026-10-01T06:00:00' }]
  })
  assert.deepEqual(meses.map((m) => m.anoMes), ['2026-10', '2026-09'])
  assert.equal(meses[1].mensal.id, 'm9')
  assert.equal(meses[1].eventos.length, 0)
  assert.equal(meses[1].emAndamento, false)
})

test('comDataAgrupada mostra a data só no primeiro evento do dia', () => {
  const eventos = comDataAgrupada([{ dia: '2026-10-28' }, { dia: '2026-10-28' }, { dia: '2026-10-26' }])
  assert.deepEqual(eventos.map((e) => e.mostrarData), [true, false, true])
})

test('resumoContagem pula tipos zerados e usa singular/plural', () => {
  assert.equal(resumoContagem({ relato: 1, fisica: 0, analise: 2, observacao: 0 }), '1 relato · 2 análises de IA')
  assert.equal(resumoContagem({ relato: 0, fisica: 0, analise: 0, observacao: 0 }), '')
})
