import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  construirOpcaoBarras,
  construirOpcaoBarrasHorizontais,
  temAlgumValor
} from './echarts-bar-option-builder.js'

// Sem framework de teste de componente no frontend (ver
// echarts-option-builder.test.js). A cobertura fica na lógica pura: legenda /
// empilhamento condicional, inversão do ranking, tooltip.

const CORES = { texto: '#111', textoMuted: '#666', borda: '#ddd', fundo: '#fff' }
const PALETA = ['#2a78d6', '#eb6834']

test('temAlgumValor: falso quando todas as séries são zero', () => {
  assert.equal(temAlgumValor([{ dados: [0, 0] }, { dados: [0] }]), false)
  assert.equal(temAlgumValor([{ dados: [0, 2] }]), true)
})

test('construirOpcaoBarras: 1 série não tem legenda nem empilhamento', () => {
  const o = construirOpcaoBarras({
    categorias: ['seg', 'ter'],
    series: [{ nome: 'Atendimentos', cor: '#2a78d6', dados: [3, 1] }],
    cores: CORES,
    paleta: PALETA
  })
  assert.equal(o.legend, undefined)
  assert.equal(o.series[0].stack, undefined)
  assert.equal(o.xAxis.type, 'category')
  assert.deepEqual(o.xAxis.data, ['seg', 'ter'])
})

test('construirOpcaoBarras: 2+ séries geram legenda e stack "total"', () => {
  const o = construirOpcaoBarras({
    categorias: ['jan', 'fev'],
    series: [
      { nome: 'Atendimento', cor: '#2a78d6', dados: [5, 4] },
      { nome: 'Avaliação física', cor: '#eb6834', dados: [1, 0] }
    ],
    cores: CORES,
    paleta: PALETA
  })
  assert.ok(o.legend)
  assert.equal(o.series[0].stack, 'total')
  assert.equal(o.series[1].stack, 'total')
  assert.equal(o.series[0].itemStyle.color, '#2a78d6')
})

test('construirOpcaoBarras: empilhar=false mantém barras lado a lado mesmo com 2 séries', () => {
  const o = construirOpcaoBarras({
    categorias: ['jan'],
    series: [
      { nome: 'A', dados: [1] },
      { nome: 'B', dados: [2] }
    ],
    cores: CORES,
    paleta: PALETA,
    empilhar: false
  })
  assert.equal(o.series[0].stack, undefined)
})

test('construirOpcaoBarras: tooltip omite séries com valor zero', () => {
  const o = construirOpcaoBarras({
    categorias: ['jan'],
    series: [{ nome: 'Atendimento', dados: [3] }, { nome: 'Avaliação física', dados: [0] }],
    cores: CORES,
    paleta: PALETA
  })
  const html = o.tooltip.formatter([
    { axisValue: 'jan', seriesName: 'Atendimento', value: 3, marker: '<i></i>' },
    { axisValue: 'jan', seriesName: 'Avaliação física', value: 0, marker: '<i></i>' }
  ])
  assert.ok(html.includes('Atendimento'))
  assert.ok(!html.includes('Avaliação física'))
})

test('construirOpcaoBarras: tooltip vazio quando tudo é zero', () => {
  const o = construirOpcaoBarras({ categorias: ['x'], series: [{ nome: 'A', dados: [0] }], cores: CORES, paleta: PALETA })
  assert.equal(o.tooltip.formatter([{ axisValue: 'x', seriesName: 'A', value: 0, marker: '<i></i>' }]), '')
})

test('construirOpcaoBarrasHorizontais: inverte a ordem para o maior ficar no topo', () => {
  const o = construirOpcaoBarrasHorizontais({
    itens: [
      { rotulo: 'Lucimery', valor: 11 },
      { rotulo: 'Henrique', valor: 8 },
      { rotulo: 'Welerson', valor: 5 }
    ],
    cor: '#2a78d6',
    cores: CORES
  })
  // eixo Y do ECharts desenha de baixo pra cima -> menor primeiro no array
  assert.deepEqual(o.yAxis.data, ['Welerson', 'Henrique', 'Lucimery'])
  assert.deepEqual(o.series[0].data, [5, 8, 11])
})

test('construirOpcaoBarrasHorizontais: tooltip por item', () => {
  const o = construirOpcaoBarrasHorizontais({ itens: [{ rotulo: 'Ana', valor: 4 }], cor: '#2a78d6', cores: CORES })
  assert.equal(o.tooltip.trigger, 'item')
  assert.ok(o.tooltip.formatter({ name: 'Ana', value: 4 }).includes('Ana'))
})
