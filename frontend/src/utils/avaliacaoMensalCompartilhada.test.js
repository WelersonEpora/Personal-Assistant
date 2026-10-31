import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  chaveItem,
  listarItensExcluiveis,
  filtrarAvaliacaoParaAluno,
  exclusoesPadrao,
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
  assert.deepEqual(Object.keys(out), ['resumo_geral', 'dimensoes', 'destaques', 'recomendacoes', 'avaliacao_fisica'])
  assert.deepEqual(out.dimensoes[0], { nome: 'Força', situacao_atual: 'boa', evolucao_no_mes: 'subindo carga' })
  assert.equal(out.dimensoes[0].evidencias, undefined)
  assert.equal(out.dimensoes[0].confianca, undefined)
})

test('filtrarAvaliacaoParaAluno preserva "tipo" quando presente (hipótese precisa continuar marcada pro aluno)', () => {
  const comHipotese = {
    ...AVALIACAO,
    dimensoes: [{ nome: 'Dor no joelho', situacao_atual: 'recorrente', evolucao_no_mes: 'possível sobrecarga', tipo: 'hipotese' }]
  }
  const out = filtrarAvaliacaoParaAluno(comHipotese, [])
  assert.equal(out.dimensoes[0].tipo, 'hipotese')
})

test('filtrarAvaliacaoParaAluno não introduz "tipo" quando a dimensão não tem (avaliação antiga)', () => {
  const out = filtrarAvaliacaoParaAluno(AVALIACAO, [])
  assert.deepEqual(Object.keys(out.dimensoes[0]), ['nome', 'situacao_atual', 'evolucao_no_mes'])
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
    recomendacoes: [],
    avaliacao_fisica: null
  })
})

// ---- docs/adr/0029: avaliação física no PDF ----

const RESUMO_FISICA = {
  avaliacao_id: 'af1',
  data: '2026-10-10',
  anterior_data: '2026-09-06',
  linhas: [
    { codigo: 'peso', rotulo: 'Peso corporal', atual: '72,4 kg', anterior: '73,1 kg', diferenca: '−0,7 kg', comparavel: true },
    { codigo: 'percentual_gordura', rotulo: '% de gordura (Bioimpedância)', atual: '17,0 %', anterior: '18,2 %', diferenca: null, comparavel: false }
  ]
}
const COM_LEITURA = {
  ...AVALIACAO,
  dimensoes: [...AVALIACAO.dimensoes, { nome: 'Composição Corporal', situacao_atual: 'x' }],
  leitura_avaliacao_fisica: '  Você perdeu 0,7 kg.  '
}

test('avaliação física: tabela e leitura entram no checklist e no documento', () => {
  const itens = listarItensExcluiveis(COM_LEITURA, RESUMO_FISICA).filter((i) => i.secao === 'avaliacao_fisica')
  assert.deepEqual(itens.map((i) => i.chave), ['avaliacao_fisica:tabela', 'avaliacao_fisica:leitura'])
  const out = filtrarAvaliacaoParaAluno(COM_LEITURA, [], RESUMO_FISICA)
  assert.equal(out.avaliacao_fisica.leitura, 'Você perdeu 0,7 kg.')
  assert.equal(out.avaliacao_fisica.tabela.linhas.length, 2)
  assert.equal(out.avaliacao_fisica.tabela.linhas[1].comparavel, false)
  assert.equal('codigo' in out.avaliacao_fisica.tabela.linhas[0], false)
})

test('avaliação física: excluir tabela e leitura tira a seção inteira', () => {
  const out = filtrarAvaliacaoParaAluno(COM_LEITURA, ['avaliacao_fisica:tabela', 'avaliacao_fisica:leitura'], RESUMO_FISICA)
  assert.equal(out.avaliacao_fisica, null)
  const soTabela = filtrarAvaliacaoParaAluno(COM_LEITURA, ['avaliacao_fisica:leitura'], RESUMO_FISICA)
  assert.equal(soTabela.avaliacao_fisica.leitura, '')
  assert.ok(soTabela.avaliacao_fisica.tabela)
})

test('avaliação física: mês sem avaliação não cria seção nem itens', () => {
  assert.equal(filtrarAvaliacaoParaAluno(AVALIACAO, [], null).avaliacao_fisica, null)
  assert.equal(listarItensExcluiveis(AVALIACAO, null).some((i) => i.secao === 'avaliacao_fisica'), false)
})

test('exclusoesPadrao desmarca "Composição corporal" só quando há leitura da avaliação', () => {
  const indice = COM_LEITURA.dimensoes.length - 1
  assert.deepEqual(exclusoesPadrao(COM_LEITURA), [`dimensao:${indice}`])
  assert.deepEqual(exclusoesPadrao({ ...COM_LEITURA, leitura_avaliacao_fisica: '' }), [])
})
