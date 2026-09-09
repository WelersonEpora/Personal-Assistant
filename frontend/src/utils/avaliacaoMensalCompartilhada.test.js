import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  chaveItem,
  listarItensExcluiveis,
  filtrarAvaliacaoParaAluno,
  revisaoDesatualizada
} from './avaliacaoMensalCompartilhada.js'

const AVALIACAO = {
  resumo_geral: 'Mês consistente.',
  dimensoes: [
    { nome: 'Força', situacao_atual: 'boa', evolucao_no_mes: 'subindo carga', confianca: 'alta', evidencias: [{ texto: 'x', origem: 'relato:1' }] },
    { nome: 'Adesão', situacao_atual: 'irregular', evolucao_no_mes: 'faltou 2x', confianca: 'media' }
  ],
  destaques: ['Bateu recorde no agachamento', 'Dormindo melhor'],
  recomendacoes: ['Manter progressão', 'Incluir mobilidade'],
  alertas: [{ texto: 'possível overtraining', gravidade: 'media' }],
  mudancas_vs_mes_anterior: ['mudou o objetivo']
}

test('listarItensExcluiveis lista dimensões, destaques e recomendações com chave estável', () => {
  const itens = listarItensExcluiveis(AVALIACAO)
  assert.deepEqual(
    itens.map((i) => i.chave),
    ['dimensao:0', 'dimensao:1', 'destaque:0', 'destaque:1', 'recomendacao:0', 'recomendacao:1']
  )
  assert.equal(itens[0].rotulo, 'Força')
})

test('filtrarAvaliacaoParaAluno tira evidências/origem/confiança das dimensões', () => {
  const out = filtrarAvaliacaoParaAluno(AVALIACAO, [])
  assert.deepEqual(Object.keys(out), ['resumo_geral', 'dimensoes', 'destaques', 'recomendacoes'])
  assert.deepEqual(out.dimensoes[0], { nome: 'Força', situacao_atual: 'boa', evolucao_no_mes: 'subindo carga' })
  assert.equal(out.dimensoes[0].evidencias, undefined)
  assert.equal(out.dimensoes[0].confianca, undefined)
})

test('filtrarAvaliacaoParaAluno nunca expõe alertas ou mudanças vs. mês anterior', () => {
  const out = filtrarAvaliacaoParaAluno(AVALIACAO, [])
  assert.equal(out.alertas, undefined)
  assert.equal(out.mudancas_vs_mes_anterior, undefined)
})

test('filtrarAvaliacaoParaAluno remove os itens excluídos', () => {
  const out = filtrarAvaliacaoParaAluno(AVALIACAO, ['dimensao:1', 'destaque:0', 'recomendacao:1'])
  assert.deepEqual(out.dimensoes.map((d) => d.nome), ['Força'])
  assert.deepEqual(out.destaques, ['Dormindo melhor'])
  assert.deepEqual(out.recomendacoes, ['Manter progressão'])
})

test('chave órfã (avaliação regerada) não quebra: item simplesmente aparece', () => {
  const out = filtrarAvaliacaoParaAluno(AVALIACAO, ['destaque:9'])
  assert.equal(out.destaques.length, 2)
})

test('revisaoDesatualizada compara gerada_em com o snapshot da revisão', () => {
  assert.equal(revisaoDesatualizada(null, null), false)
  assert.equal(
    revisaoDesatualizada({ gerada_em: '2026-09-01T10:00:00Z' }, { avaliacao_gerada_em: '2026-09-01T10:00:00Z' }),
    false
  )
  assert.equal(
    revisaoDesatualizada({ gerada_em: '2026-09-05T10:00:00Z' }, { avaliacao_gerada_em: '2026-09-01T10:00:00Z' }),
    true
  )
})

test('lida com avaliação vazia/sem listas', () => {
  assert.deepEqual(listarItensExcluiveis(null), [])
  assert.deepEqual(filtrarAvaliacaoParaAluno(undefined, []), {
    resumo_geral: '',
    dimensoes: [],
    destaques: [],
    recomendacoes: []
  })
})
