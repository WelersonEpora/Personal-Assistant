import { test } from 'node:test'
import assert from 'node:assert/strict'

import { construirOpcaoLineChart, prepararGrafico } from './echarts-option-builder.js'

// O frontend não tem framework de teste de componente (sem @vue/test-utils/
// jsdom). A cobertura fica na lógica pura que decide o que desenhar - eixo
// temporal, tolerância do tooltip, legenda condicional, paleta de tamanho
// fixo. A renderização do ECharts em si é biblioteca de terceiros, validada
// no navegador.

const CORES = { texto: '#111', textoMuted: '#666', borda: '#ddd', fundo: '#fff', crosshair: '#999' }
const PALETA = ['#2a78d6', '#eb6834', '#1baf7a']

test('prepararGrafico: série com datas ISO vira pares [timestamp, valor] ordenados', () => {
  const r = prepararGrafico([
    { nome: 'Peso', pontos: [{ periodo: '2015-06-10', valor: 72 }, { periodo: '2014-01-05', valor: 70 }] }
  ])
  assert.equal(r.temDadoSuficiente, true)
  assert.deepEqual(r.seriesPreparadas[0].dados, [
    [Date.parse('2014-01-05'), 70],
    [Date.parse('2015-06-10'), 72]
  ])
})

test('prepararGrafico: valores nulos/NaN e datas inválidas são descartados sem lançar', () => {
  const r = prepararGrafico([
    {
      nome: 'Peso',
      pontos: [
        { periodo: '2020-01-01', valor: 80 },
        { periodo: '2020-02-01', valor: null },
        { periodo: '2020-03-01', valor: undefined },
        { periodo: 'xx', valor: 81 }
      ]
    }
  ])
  assert.equal(r.seriesPreparadas[0].dados.length, 1)
})

test('prepararGrafico: série com 1 ponto não conta como dado suficiente', () => {
  const r = prepararGrafico([{ nome: 'IMC', pontos: [{ periodo: '2021-05-01', valor: 24 }] }])
  assert.equal(r.temDadoSuficiente, false)
})

test('construirOpcaoLineChart: 1 série não gera legenda; xAxis é temporal', () => {
  const o = construirOpcaoLineChart({
    series: [{ nome: 'IMC', casas: 1, pontos: [{ periodo: '2021-01-01', valor: 24 }, { periodo: '2021-06-01', valor: 23 }] }],
    unidade: 'kg/m²',
    cores: CORES,
    paleta: PALETA
  })
  assert.equal(o.legend, undefined)
  assert.equal(o.xAxis.type, 'time')
  assert.equal(o.series.length, 1)
})

test('construirOpcaoLineChart: 2+ séries geram legenda; cada série carrega a própria cor', () => {
  const o = construirOpcaoLineChart({
    series: [
      { nome: 'Peso', cor: '#2a78d6', pontos: [{ periodo: '2021-01-01', valor: 80 }, { periodo: '2021-06-01', valor: 79 }] },
      { nome: 'Massa magra', cor: '#1baf7a', pontos: [{ periodo: '2021-01-01', valor: 60 }, { periodo: '2021-06-01', valor: 61 }] }
    ],
    unidade: 'kg',
    cores: CORES,
    paleta: PALETA
  })
  assert.ok(o.legend)
  assert.equal(o.series[0].lineStyle.color, '#2a78d6')
  assert.equal(o.series[1].itemStyle.color, '#1baf7a')
})

test('construirOpcaoLineChart: `color` do topo tem tamanho fixo (paleta), independente do nº de séries', () => {
  const umaSerie = construirOpcaoLineChart({
    series: [{ nome: 'Peso', pontos: [{ periodo: '2021-01-01', valor: 80 }, { periodo: '2021-06-01', valor: 79 }] }],
    cores: CORES,
    paleta: PALETA
  })
  const tresSeries = construirOpcaoLineChart({
    series: [
      { nome: 'A', pontos: [{ periodo: '2021-01-01', valor: 1 }, { periodo: '2021-06-01', valor: 2 }] },
      { nome: 'B', pontos: [{ periodo: '2021-01-01', valor: 3 }, { periodo: '2021-06-01', valor: 4 }] },
      { nome: 'C', pontos: [{ periodo: '2021-01-01', valor: 5 }, { periodo: '2021-06-01', valor: 6 }] }
    ],
    cores: CORES,
    paleta: PALETA
  })
  assert.deepEqual(umaSerie.color, tresSeries.color)
})

test('construirOpcaoLineChart: tooltip só mostra séries com ponto real perto do cursor (tolerância)', () => {
  const o = construirOpcaoLineChart({
    series: [
      { nome: 'Peso', casas: 1, pontos: [
        { periodo: '2026-01-01', valor: 80 },
        { periodo: '2026-02-01', valor: 79 },
        { periodo: '2026-03-01', valor: 78 }
      ] },
      // % gordura só numa avaliação antiga - não deve aparecer no tooltip
      // quando o cursor está em 2026
      { nome: '% de gordura', casas: 1, pontos: [
        { periodo: '2015-01-01', valor: 30 },
        { periodo: '2015-02-01', valor: 29 }
      ] }
    ],
    unidade: null,
    cores: CORES,
    paleta: PALETA
  })
  const cursor = Date.parse('2026-02-01')
  const params = [
    { seriesName: 'Peso', value: [cursor, 79], axisValue: cursor, marker: '<i></i>' },
    { seriesName: '% de gordura', value: [Date.parse('2015-02-01'), 29], axisValue: cursor, marker: '<i></i>' }
  ]
  const html = o.tooltip.formatter(params)
  assert.ok(html.includes('Peso'))
  assert.ok(!html.includes('% de gordura'))
})

test('construirOpcaoLineChart: valor no tooltip usa as casas decimais da métrica', () => {
  const o = construirOpcaoLineChart({
    series: [{ nome: 'RCQ', casas: 2, pontos: [{ periodo: '2021-01-01', valor: 0.9 }, { periodo: '2021-06-01', valor: 0.85 }] }],
    unidade: null,
    cores: CORES,
    paleta: PALETA
  })
  const x = Date.parse('2021-06-01')
  const html = o.tooltip.formatter([{ seriesName: 'RCQ', value: [x, 0.85], axisValue: x, marker: '<i></i>' }])
  assert.ok(html.includes('0,85'))
})

test('construirOpcaoLineChart: dados vazios produz option válida sem séries', () => {
  const o = construirOpcaoLineChart({ series: [], unidade: null, cores: CORES, paleta: PALETA })
  assert.deepEqual(o.series, [])
  assert.equal(o.legend, undefined)
})

test('construirOpcaoLineChart: faixas de referência viram markArea silencioso na 1ª série + eixo Y fixado aos dados', () => {
  const faixas = [
    { min: 0, max: 18.5, rotulo: 'Abaixo do peso', cor: 'rgba(0,0,0,0.1)' },
    { min: 18.5, max: 25, rotulo: 'Peso normal', cor: 'rgba(0,0,0,0.1)' },
    { min: 25, max: 30, rotulo: 'Sobrepeso', cor: 'rgba(0,0,0,0.1)' },
    { min: 30, max: Infinity, rotulo: 'Obesidade', cor: 'rgba(0,0,0,0.1)' }
  ]
  const o = construirOpcaoLineChart({
    series: [{ nome: 'IMC', casas: 1, pontos: [{ periodo: '2021-01-01', valor: 27 }, { periodo: '2021-06-01', valor: 24 }] }],
    unidade: 'kg/m²',
    cores: CORES,
    paleta: PALETA,
    faixas
  })

  assert.ok(o.series[0].markArea)
  assert.equal(o.series[0].markArea.silent, true)
  assert.equal(o.series[0].markArea.data.length, 4)
  // faixa "Obesidade" (max Infinity) vira um teto finito
  assert.equal(o.series[0].markArea.data[3][1].yAxis, 1000)
  // eixo Y fixado (funções sobre {min,max}), não scale:true
  assert.equal(o.yAxis.scale, false)
  assert.equal(typeof o.yAxis.min, 'function')
  assert.equal(o.yAxis.min({ min: 24, max: 27 }), 23)
})

test('construirOpcaoLineChart: janela de referência força o intervalo mínimo do eixo (união com os dados)', () => {
  const faixas = [{ min: 18.5, max: 25, rotulo: 'Normal', cor: 'rgba(0,0,0,0.1)' }]
  const janela = { min: 15, max: 35 }
  const o = construirOpcaoLineChart({
    series: [{ nome: 'IMC', pontos: [{ periodo: '2021-01-01', valor: 23 }, { periodo: '2021-06-01', valor: 24 }] }],
    cores: CORES,
    paleta: PALETA,
    faixas,
    janela
  })
  // aluno com variação pequena (23-24) mas o eixo abre de 15 a 35
  assert.equal(o.yAxis.min({ min: 23, max: 24 }), 15)
  assert.equal(o.yAxis.max({ min: 23, max: 24 }), 35)
  // aluno fora da janela: o eixo estende para incluir o ponto dele
  assert.equal(o.yAxis.max({ min: 36, max: 38 }), 39)
  assert.equal(o.yAxis.min({ min: 12, max: 16 }), 11)
})

test('construirOpcaoLineChart: sem faixas, nenhum markArea e yAxis.scale = true', () => {
  const o = construirOpcaoLineChart({
    series: [{ nome: 'IMC', pontos: [{ periodo: '2021-01-01', valor: 27 }, { periodo: '2021-06-01', valor: 24 }] }],
    cores: CORES,
    paleta: PALETA
  })
  assert.equal(o.series[0].markArea, undefined)
  assert.equal(o.yAxis.scale, true)
})

test('construirOpcaoLineChart: tooltip formatter devolve vazio sem params', () => {
  const o = construirOpcaoLineChart({
    series: [{ nome: 'Peso', pontos: [{ periodo: '2021-01-01', valor: 80 }, { periodo: '2021-06-01', valor: 79 }] }],
    cores: CORES,
    paleta: PALETA
  })
  assert.equal(o.tooltip.formatter([]), '')
})
