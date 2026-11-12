import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  montarComposicao,
  leituraComposicao,
  arcosRosca,
  resumoComposicao,
  resumoIndicadores,
  resumoPerimetros,
  indicadoresComReferencia,
  montarPerimetros
} from './retratoAvaliacaoFisica.js'

function m(codigo, valor, metodo = 'direto', principal = true) {
  return { metrica_codigo: codigo, valor: String(valor), metodo, principal }
}
function av(data, medidas) {
  return { data, medidas }
}
function composicao(data, gordura, metodo, magra, massaGorda, peso) {
  return av(data, [
    m('peso', peso),
    m('percentual_gordura', gordura, metodo),
    m('massa_magra', magra),
    m('massa_gorda', massaGorda)
  ])
}

test('composição: uma avaliação só já monta a rosca', () => {
  const c = montarComposicao(composicao('2026-10-10', 20, 'pollock_7', 64, 16, 80))
  assert.equal(c.anterior, null)
  assert.equal(c.atual.metodo_rotulo, 'Pollock 7 dobras')
  const l = leituraComposicao(c)
  assert.equal(l.peso, 80)
  assert.deepEqual(l.gorda, { kg: 16, pct: 20 })
  assert.deepEqual(l.magra, { kg: 64, pct: 80 })
  assert.equal(l.variacao, null)
})

test('composição: anterior só com o mesmo método; variação em kg com leitura favorável/desfavorável', () => {
  const atual = composicao('2026-10-10', 20, 'pollock_7', 64, 16, 80)
  const l = leituraComposicao(montarComposicao(atual, composicao('2026-09-06', 23.8, 'pollock_7', 63.1, 19.2, 82.3)))
  assert.equal(l.variacao.desde, '2026-09-06')
  assert.deepEqual(l.variacao.gorda, { delta: -3.2, leitura: 'favoravel' })
  assert.deepEqual(l.variacao.magra, { delta: 0.9, leitura: 'favoravel' })

  const piorou = leituraComposicao(montarComposicao(atual, composicao('2026-09-06', 18, 'pollock_7', 64, 14, 78)))
  assert.deepEqual(piorou.variacao.gorda, { delta: 2, leitura: 'desfavoravel' })
  assert.deepEqual(piorou.variacao.magra, { delta: 0, leitura: 'neutra' })

  const outra = montarComposicao(atual, composicao('2026-09-06', 25, 'bioimpedancia', 75, 25, 100))
  assert.equal(outra.anterior, null)
})

test('composição: sem as duas massas não há gráfico; sem % usa a proporção', () => {
  assert.equal(montarComposicao(av('2026-10-10', [m('peso', 80)])), null)
  const c = montarComposicao(av('2026-10-10', [m('massa_magra', 60), m('massa_gorda', 15)]))
  assert.equal(c.atual.peso, 75)
  assert.equal(leituraComposicao(c).pctGordura, 20)
  assert.equal(leituraComposicao(null), null)
})

test('rosca: arcos somam a circunferência (menos o respiro) e começam do topo', () => {
  const l = leituraComposicao(montarComposicao(composicao('2026-10-10', 25, 'pollock_7', 60, 20, 80)))
  const [magra, gorda] = arcosRosca(l, 100, 2)
  assert.deepEqual(magra, { chave: 'magra', comprimento: 73, deslocamento: -1 })
  assert.deepEqual(gorda, { chave: 'gorda', comprimento: 23, deslocamento: -76 })
  assert.deepEqual(arcosRosca(null, 100), [])
})

test('indicadores: só os com valor e referência aplicável, na ordem fixa', () => {
  const avaliacao = av('2026-10-10', [
    m('fc_repouso', 70),
    m('imc', 24),
    m('percentual_gordura', 15, 'pollock_7'),
    m('peso', 80)
  ])
  const semSexo = indicadoresComReferencia(avaliacao, { sexo: null, idade: 30, valores: {} })
  assert.deepEqual(semSexo.map((i) => i.codigo), ['imc', 'fc_repouso'])
  const completo = indicadoresComReferencia(avaliacao, { sexo: 'M', idade: 30, valores: {} })
  assert.deepEqual(completo.map((i) => i.codigo), ['imc', 'percentual_gordura', 'fc_repouso'])
  assert.equal(completo[1].classificacao.rotulo, 'Adequada')
})

test('perímetros: tronco e membros com escala própria e selo de assimetria a partir de 1 cm', () => {
  const grupos = montarPerimetros(av('2026-10-10', [
    m('perimetro_cintura', 80),
    m('perimetro_quadril', 100),
    m('perimetro_braco_d', 34),
    m('perimetro_braco_e', 32.6),
    m('perimetro_coxa_d', 55),
    m('perimetro_coxa_e', 55.5),
    m('perimetro_panturrilha_e', 37)
  ]))
  assert.deepEqual(grupos.map((g) => g.titulo), ['Tronco', 'Membros'])
  const [tronco, membros] = grupos
  assert.deepEqual(tronco.linhas.map((l) => l.rotulo), ['Cintura', 'Quadril'])
  assert.equal(tronco.linhas[1].valores[0].largura, 100)
  assert.equal(membros.linhas[1].valores[1].largura, 100) // coxa E, a maior dos membros

  const [braco, coxa, panturrilha] = membros.linhas
  assert.deepEqual(braco.assimetria, { diferenca: 1.4, maior: 'D' })
  assert.equal(coxa.assimetria, null)
  assert.deepEqual(panturrilha.valores.map((v) => v.lado), ['E'])
  assert.equal(panturrilha.assimetria, null)
})

test('perímetros: avaliação sem perímetro não monta grupo', () => {
  assert.deepEqual(montarPerimetros(av('2026-10-10', [m('peso', 80)])), [])
})

test('cards resumo: composição com e sem variação', () => {
  const atual = composicao('2026-10-10', 21.7, 'pollock_7', 64, 17.8, 81.8)
  assert.deepEqual(resumoComposicao(montarComposicao(atual)), { principal: '21,7% de gordura', variacao: null, tom: 'neutral' })
  const subiu = resumoComposicao(montarComposicao(atual, composicao('2025-05-20', 19, 'pollock_7', 64, 15.1, 79.1)))
  assert.deepEqual(subiu, { principal: '21,7% de gordura', variacao: '+2,7 kg de gordura desde 20/05/2025', tom: 'warning' })
  const caiu = resumoComposicao(montarComposicao(atual, composicao('2025-05-20', 25, 'pollock_7', 63, 21, 84)))
  assert.equal(caiu.variacao, '−3,2 kg de gordura desde 20/05/2025')
  assert.equal(caiu.tom, 'success')
  assert.equal(resumoComposicao(null), null)
})

test('cards resumo: indicadores contam warning/danger, não info', () => {
  const ind = (tom) => ({ classificacao: { tom } })
  assert.deepEqual(resumoIndicadores([ind('success'), ind('info')]), { texto: 'Todos na faixa adequada', tom: 'success' })
  assert.deepEqual(resumoIndicadores([ind('success'), ind('warning'), ind('warning'), ind('success')]), {
    texto: '2 de 4 fora da faixa adequada',
    tom: 'warning'
  })
  assert.equal(resumoIndicadores([ind('warning'), ind('danger')]).tom, 'danger')
  assert.equal(resumoIndicadores([]), null)
})

test('cards resumo: perímetros por assimetria', () => {
  const com = montarPerimetros(av('2026-10-10', [
    m('perimetro_coxa_d', 56.5), m('perimetro_coxa_e', 57.5),
    m('perimetro_panturrilha_d', 39), m('perimetro_panturrilha_e', 42)
  ]))
  assert.deepEqual(resumoPerimetros(com), { texto: 'Assimetria em 2 regiões', tom: 'warning' })
  const sem = montarPerimetros(av('2026-10-10', [m('perimetro_braco_d', 32), m('perimetro_braco_e', 32.4)]))
  assert.deepEqual(resumoPerimetros(sem), { texto: 'Sem assimetria entre os lados', tom: 'success' })
  const soTronco = montarPerimetros(av('2026-10-10', [m('perimetro_cintura', 80)]))
  assert.deepEqual(resumoPerimetros(soTronco), { texto: '1 medida', tom: 'neutral' })
  assert.equal(resumoPerimetros([]), null)
})
