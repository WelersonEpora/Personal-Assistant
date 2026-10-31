import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  tiposPermitidos,
  tipoParaQuantidade,
  itemDoExercicio,
  grupoSimples,
  formularioDaFicha,
  conjugarComProximo,
  separarGrupo,
  removerItem,
  moverGrupo,
  moverItem,
  payloadDosGrupos,
  problemaDoFormulario,
  rotuloRepeticoes,
  resumoSimples,
  resumoConjugado,
  rotuloPosicao,
  contarExercicios,
  situacaoInativa,
  ordenarPorNome,
  itemNaoReconhecido,
  formularioDaProposta,
  definirExercicioDoItem,
  contarSemExercicio,
  sugerirSubstituicao
} from './fichaTreino.js'

const SUPINO = { id: 'ex-supino', nome: 'Supino' }
const AGACHAMENTO = { id: 'ex-agachamento', nome: 'Agachamento' }
const ABDOMINAL = { id: 'ex-abdominal', nome: 'Abdominal' }

function tresSimples() {
  return [
    grupoSimples(itemDoExercicio(SUPINO, { repeticoes: '12' }), { series: 2, descanso: '60s' }),
    grupoSimples(itemDoExercicio(AGACHAMENTO, { repeticoes: '15' }), { series: 3 }),
    grupoSimples(itemDoExercicio(ABDOMINAL, { repeticoes: '30s' }))
  ]
}

const nomes = (grupo) => grupo.itens.map((i) => i.nome)

test('tiposPermitidos espelha a regra do service', () => {
  assert.deepEqual(tiposPermitidos(1), ['simples'])
  assert.deepEqual(tiposPermitidos(2), ['biset', 'circuito'])
  assert.deepEqual(tiposPermitidos(3), ['triset', 'circuito'])
  assert.deepEqual(tiposPermitidos(5), ['circuito'])
})

test('tipoParaQuantidade mantém a escolha quando ainda vale', () => {
  assert.equal(tipoParaQuantidade(3, 'circuito'), 'circuito')
  assert.equal(tipoParaQuantidade(3, 'biset'), 'triset')
  assert.equal(tipoParaQuantidade(1, 'circuito'), 'simples')
})

test('conjugar dois simples vira bi-set com as voltas e o descanso do primeiro', () => {
  const grupos = conjugarComProximo(tresSimples(), 0)
  assert.equal(grupos.length, 2)
  assert.equal(grupos[0].tipo, 'biset')
  assert.equal(grupos[0].series, 2)
  assert.equal(grupos[0].descanso, '60s')
  assert.deepEqual(nomes(grupos[0]), ['Supino', 'Agachamento'])
})

test('conjugar de novo vira tri-set; circuito escolhido é mantido ao crescer', () => {
  const triset = conjugarComProximo(conjugarComProximo(tresSimples(), 0), 0)
  assert.equal(triset.length, 1)
  assert.equal(triset[0].tipo, 'triset')
  assert.deepEqual(nomes(triset[0]), ['Supino', 'Agachamento', 'Abdominal'])

  const biset = conjugarComProximo(tresSimples(), 0)
  biset[0] = { ...biset[0], tipo: 'circuito' }
  assert.equal(conjugarComProximo(biset, 0)[0].tipo, 'circuito')
})

test('conjugar no último grupo não faz nada', () => {
  const grupos = tresSimples()
  assert.equal(conjugarComProximo(grupos, 2), grupos)
})

test('separar devolve um simples por exercício, herdando voltas e descanso', () => {
  const triset = conjugarComProximo(conjugarComProximo(tresSimples(), 0), 0)
  const separados = separarGrupo(triset, 0)
  assert.equal(separados.length, 3)
  assert.ok(separados.every((g) => g.tipo === 'simples' && g.series === 2 && g.descanso === '60s'))
  assert.deepEqual(separados.map((g) => g.itens[0].nome), ['Supino', 'Agachamento', 'Abdominal'])
})

test('removerItem: conjugado que fica com 1 vira simples; grupo vazio some', () => {
  const biset = conjugarComProximo(tresSimples(), 0)
  const depois = removerItem(biset, 0, 0)
  assert.equal(depois[0].tipo, 'simples')
  assert.deepEqual(nomes(depois[0]), ['Agachamento'])

  const semAbdominal = removerItem(tresSimples(), 2, 0)
  assert.equal(semAbdominal.length, 2)
})

test('moverGrupo e moverItem respeitam os limites', () => {
  const grupos = tresSimples()
  assert.deepEqual(moverGrupo(grupos, 0, 1).map((g) => g.itens[0].nome), ['Agachamento', 'Supino', 'Abdominal'])
  assert.equal(moverGrupo(grupos, 0, -1), grupos)

  const biset = conjugarComProximo(grupos, 0)
  assert.deepEqual(nomes(moverItem(biset, 0, 1, -1)[0]), ['Agachamento', 'Supino'])
})

test('payloadDosGrupos converte séries e limpa textos vazios', () => {
  const grupos = conjugarComProximo(tresSimples(), 1)
  grupos[1].itens[0].cargaObs = '  '
  assert.deepEqual(payloadDosGrupos(grupos), [
    { tipo: 'simples', series: 2, descanso: '60s', observacoes: null, itens: [{ exercicioId: 'ex-supino', repeticoes: '12', cargaObs: null }] },
    {
      tipo: 'biset',
      series: 3,
      descanso: null,
      observacoes: null,
      itens: [
        { exercicioId: 'ex-agachamento', repeticoes: '15', cargaObs: null },
        { exercicioId: 'ex-abdominal', repeticoes: '30s', cargaObs: null }
      ]
    }
  ])
})

test('formularioDaFicha reconstrói os grupos de uma ficha salva', () => {
  const ficha = {
    grupos: [
      {
        tipo: 'circuito',
        series: 2,
        descanso: '60s',
        observacoes: null,
        itens: [
          { repeticoes: '12', carga_obs: '20kg', exercicio: { ...SUPINO, grupo_muscular: 'Peito' } },
          { repeticoes: null, carga_obs: null, exercicio: AGACHAMENTO }
        ]
      }
    ]
  }
  const [grupo] = formularioDaFicha(ficha)
  assert.equal(grupo.tipo, 'circuito')
  assert.equal(grupo.series, 2)
  assert.equal(grupo.observacoes, '')
  assert.equal(grupo.itens[0].cargaObs, '20kg')
  assert.equal(grupo.itens[0].grupoMuscular, 'Peito')
  assert.equal(grupo.itens[1].repeticoes, '')
})

test('problemaDoFormulario exige nome e pelo menos um exercício', () => {
  assert.match(problemaDoFormulario({ nome: ' ', grupos: tresSimples() }), /nome/)
  assert.match(problemaDoFormulario({ nome: 'Inferiores', grupos: [] }), /exercício/)
  assert.equal(problemaDoFormulario({ nome: 'Inferiores', grupos: tresSimples() }), null)
})

test('rótulos de leitura: tempo sem "repetições", resumos e numeração 3A/3B', () => {
  assert.equal(rotuloRepeticoes('12'), '12 repetições')
  assert.equal(rotuloRepeticoes('30s'), '30s')
  assert.equal(rotuloRepeticoes('1 min'), '1 min')

  assert.equal(resumoSimples({ series: 4, descanso: '90s' }, { repeticoes: '8-12' }), '4 séries · 8-12 repetições · descanso 90s')
  assert.equal(resumoSimples({ series: 1 }, { repeticoes: '30s' }), '1 série · 30s')
  assert.equal(resumoConjugado({ tipo: 'circuito', series: 2, descanso: '60s' }), 'Circuito · 2 voltas · descanso 60s entre voltas')
  assert.equal(resumoConjugado({ tipo: 'biset', series: null, descanso: null }), 'Bi-set')

  assert.equal(rotuloPosicao({ tipo: 'simples' }, 2, 0), '3')
  assert.equal(rotuloPosicao({ tipo: 'biset' }, 2, 1), '3B')
})

test('contarExercicios, situacaoInativa e ordenarPorNome', () => {
  assert.equal(contarExercicios({ grupos: [{ itens: [1, 2] }, { itens: [3] }] }), 3)

  const fichas = [
    { id: 'v2', substitui_id: 'v1' },
    { id: 'v1', substitui_id: null },
    { id: 'arq', substitui_id: null }
  ]
  assert.equal(situacaoInativa(fichas[1], fichas), 'substituida')
  assert.equal(situacaoInativa(fichas[2], fichas), 'arquivada')

  assert.deepEqual(ordenarPorNome([{ nome: 'superiores' }, { nome: 'Inferiores' }]).map((f) => f.nome), ['Inferiores', 'superiores'])
})

// ------------------------------------------- ficha por voz (docs/adr/0028)

const CATALOGO_POR_ID = new Map([
  ['ex-supino', { id: 'ex-supino', nome: 'Supino', grupo_muscular: 'Peito' }],
  ['ex-corda', { id: 'ex-corda', nome: 'Tríceps corda', grupo_muscular: 'Tríceps' }],
  ['ex-testa', { id: 'ex-testa', nome: 'Tríceps testa', grupo_muscular: 'Tríceps' }]
])

test('formularioDaProposta: resolve exercícios do catálogo e mantém o rastro da fala', () => {
  const grupos = formularioDaProposta(
    {
      grupos: [
        { tipo: 'simples', series: 4, descanso: '60s', itens: [{ exercicio_id: 'ex-supino', nome_ouvido: 'supino', repeticoes: '10', carga_obs: '20kg', confianca: 'alta', trecho_origem: 'supino quatro de dez' }] },
        { tipo: 'biset', series: 3, itens: [{ exercicio_id: 'ex-corda', confianca: 'media' }, { exercicio_id: 'ex-testa', confianca: 'alta' }] }
      ]
    },
    CATALOGO_POR_ID
  )
  assert.equal(grupos[0].itens[0].nome, 'Supino')
  assert.deepEqual(
    [grupos[0].series, grupos[0].descanso, grupos[0].itens[0].repeticoes, grupos[0].itens[0].cargaObs, grupos[0].itens[0].trecho],
    [4, '60s', '10', '20kg', 'supino quatro de dez']
  )
  assert.equal(grupos[1].tipo, 'biset')
  assert.equal(grupos[1].itens[0].confianca, 'media')
})

test('formularioDaProposta: sem exercício (ou fora do catálogo) vira item não reconhecido', () => {
  const [grupo] = formularioDaProposta(
    {
      grupos: [
        {
          tipo: 'biset',
          itens: [
            { exercicio_id: null, nome_ouvido: 'puxada no triângulo', repeticoes: '12' },
            { exercicio_id: 'ex-que-saiu-do-catalogo', nome_ouvido: 'remada' }
          ]
        }
      ]
    },
    CATALOGO_POR_ID
  )
  assert.deepEqual(
    grupo.itens.map((i) => [i.exercicioId, i.nomeOuvido, i.confianca]),
    [[null, 'puxada no triângulo', 'baixa'], [null, 'remada', 'baixa']]
  )
  assert.equal(grupo.itens[0].repeticoes, '12')
  assert.equal(contarSemExercicio([grupo]), 2)
  assert.match(problemaDoFormulario({ nome: 'A', grupos: [grupo] }), /2 itens não reconhecidos/)
})

test('definirExercicioDoItem: troca o exercício e preserva repetições, carga e fala', () => {
  const grupos = [grupoSimples(itemNaoReconhecido({ nomeOuvido: 'puxada no triângulo', repeticoes: '12', cargaObs: '30kg', trecho: 'puxada no triângulo doze' }))]
  const chave = grupos[0].itens[0].chave

  const [grupo] = definirExercicioDoItem(grupos, 0, 0, { id: 'ex-supino', nome: 'Supino', grupo_muscular: 'Peito' })
  const item = grupo.itens[0]
  assert.deepEqual(
    [item.exercicioId, item.nome, item.repeticoes, item.cargaObs, item.nomeOuvido, item.confianca, item.chave],
    ['ex-supino', 'Supino', '12', '30kg', 'puxada no triângulo', 'alta', chave]
  )
  assert.equal(contarSemExercicio([grupo]), 0)
  assert.equal(grupos[0].itens[0].exercicioId, null, 'não muta o original')
})

test('sugerirSubstituicao: casa o nome ditado com uma ficha ativa, sem acento nem caixa', () => {
  const ativas = [{ id: 'f-a', nome: 'Treino A' }, { id: 'f-inf', nome: 'Inferiores' }]
  assert.equal(sugerirSubstituicao('treino a', ativas), 'f-a')
  assert.equal(sugerirSubstituicao(' INFERIÓRES ', ativas), 'f-inf')
  assert.equal(sugerirSubstituicao('Treino B', ativas), null)
  assert.equal(sugerirSubstituicao('', ativas), null)
})
