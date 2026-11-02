import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  chaveItem,
  listarItensExcluiveis,
  filtrarAvaliacaoParaAluno,
  exclusoesPadrao,
  revisaoDesatualizada,
  textosOriginais,
  limparTextosEditados,
  temTextoAjustado
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
  assert.deepEqual(out.dimensoes[0], { chave: 'dimensao:0', nome: 'Força', situacao_atual: 'boa', evolucao_no_mes: 'subindo carga' })
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
  assert.deepEqual(Object.keys(out.dimensoes[0]), ['chave', 'nome', 'situacao_atual', 'evolucao_no_mes'])
})

test('filtrarAvaliacaoParaAluno nunca expõe alertas ou mudanças vs. mês anterior', () => {
  const out = filtrarAvaliacaoParaAluno(AVALIACAO, [])
  assert.equal(out.alertas, undefined)
  assert.equal(out.mudancas_vs_mes_anterior, undefined)
})

test('filtrarAvaliacaoParaAluno remove os itens excluídos', () => {
  const out = filtrarAvaliacaoParaAluno(AVALIACAO, ['dimensao:1', 'destaque:0', 'recomendacao:1'])
  assert.deepEqual(out.dimensoes.map((d) => d.nome), ['Força'])
  assert.deepEqual(out.destaques, [{ chave: 'destaque:1', texto: 'Dormindo melhor' }])
  assert.deepEqual(out.recomendacoes, [{ chave: 'recomendacao:0', texto: 'Manter progressão' }])
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

// ---- Adendo 2026-11-02: textos ajustados pelo personal ----

test('textosOriginais lista os trechos editáveis com as chaves do backend', () => {
  assert.deepEqual(Object.keys(textosOriginais(AVALIACAO)), [
    'resumo_geral',
    'dimensao:0:situacao_atual',
    'dimensao:0:evolucao_no_mes',
    'dimensao:1:situacao_atual',
    'dimensao:1:evolucao_no_mes',
    'destaque:0',
    'destaque:1',
    'recomendacao:0',
    'recomendacao:1'
  ])
})

test('filtrarAvaliacaoParaAluno aplica os textos ajustados sem mexer na avaliação da IA', () => {
  const editados = {
    resumo_geral: 'Mês excelente.',
    'dimensao:1:evolucao_no_mes': 'faltou só 1x',
    'destaque:0': 'Recorde no agachamento: 100 kg'
  }
  const out = filtrarAvaliacaoParaAluno(AVALIACAO, ['destaque:1'], null, editados)
  assert.equal(out.resumo_geral, 'Mês excelente.')
  assert.equal(out.dimensoes[1].evolucao_no_mes, 'faltou só 1x')
  assert.equal(out.dimensoes[1].situacao_atual, 'irregular')
  assert.deepEqual(out.destaques, [{ chave: 'destaque:0', texto: 'Recorde no agachamento: 100 kg' }])
  assert.equal(AVALIACAO.resumo_geral, 'Mês consistente.')
  assert.equal(out.alertas, undefined)
})

test('listarItensExcluiveis mostra o texto ajustado e marca o item como editado', () => {
  const itens = listarItensExcluiveis(AVALIACAO, null, { 'dimensao:0:situacao_atual': 'ótima', 'recomendacao:1': 'Mobilidade 2x' })
  const porChave = Object.fromEntries(itens.map((i) => [i.chave, i]))
  assert.equal(porChave['dimensao:0'].editado, true)
  assert.equal(porChave['dimensao:1'].editado, false)
  assert.equal(porChave['recomendacao:1'].texto, 'Mobilidade 2x')
  assert.equal(porChave['recomendacao:1'].editado, true)
})

test('limparTextosEditados descarta chave inexistente, vazia ou igual ao original', () => {
  const limpo = limparTextosEditados(
    { resumo_geral: '  Mês consistente.  ', 'destaque:0': ' novo ', 'destaque:9': 'órfã', 'recomendacao:0': '  ', 'alertas': 'x' },
    AVALIACAO
  )
  assert.deepEqual(limpo, { 'destaque:0': 'novo' })
})

test('temTextoAjustado ignora os ajustes de uma revisão desatualizada (regerar descarta)', () => {
  const revisao = { avaliacao_gerada_em: '2026-09-01T10:00:00Z', textos_editados: { resumo_geral: 'x' } }
  assert.equal(temTextoAjustado({ gerada_em: '2026-09-01T10:00:00Z' }, revisao), true)
  assert.equal(temTextoAjustado({ gerada_em: '2026-09-05T10:00:00Z' }, revisao), false)
  assert.equal(temTextoAjustado({ gerada_em: '2026-09-01T10:00:00Z' }, { ...revisao, textos_editados: {} }), false)
})
