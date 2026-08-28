// Constrói a option do Apache ECharts para charts/BarChart.vue - funções puras,
// sem Vue nem DOM (testáveis com node:test puro). Mesmo padrão do
// echarts-option-builder.js (LineChart): só o componente conhece a API do
// ECharts; a montagem da option mora aqui.
//
// Dois formatos, usados pela tela de Atendimentos (docs/adr/0020):
//   - barras verticais (empilhadas ou não) para a série temporal
//   - barras horizontais para o ranking por aluno
//
// Contrato:
//   categorias: string[]                      (rótulos do eixo de categoria)
//   series:     [{ nome, cor, dados: number[] }]   (alinhado a `categorias`)

function escaparHtml(texto) {
  return String(texto).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
}

function fmtInteiro(valor) {
  return new Intl.NumberFormat('pt-BR').format(valor)
}

function eixoBase(cores) {
  return {
    axisLine: { lineStyle: { color: cores.borda } },
    axisTick: { show: false },
    axisLabel: { color: cores.textoMuted, fontSize: 11, hideOverlap: true }
  }
}

function tooltipBase(cores) {
  return {
    backgroundColor: cores.fundo,
    borderColor: cores.borda,
    borderWidth: 1,
    padding: 10,
    extraCssText: 'border-radius:8px; box-shadow:0 2px 10px rgba(0,0,0,0.08);',
    textStyle: { color: cores.texto, fontSize: 12 }
  }
}

// Total (soma das séries) por categoria - alimenta o "sem dados" do componente.
export function temAlgumValor(series) {
  return (series || []).some((s) => (s.dados || []).some((v) => Number(v) > 0))
}

export function construirOpcaoBarras({ categorias = [], series = [], cores, paleta = [], empilhar = true }) {
  const temLegenda = series.length > 1
  const empilhamento = empilhar && series.length > 1 ? 'total' : undefined

  return {
    color: paleta,
    grid: { left: 6, right: 12, top: temLegenda ? 32 : 10, bottom: 6, containLabel: true },
    legend: temLegenda
      ? {
          top: 0,
          left: 0,
          icon: 'roundRect',
          itemWidth: 12,
          itemHeight: 10,
          itemGap: 16,
          textStyle: { color: cores.textoMuted, fontSize: 12 }
        }
      : undefined,
    xAxis: {
      type: 'category',
      data: categorias,
      ...eixoBase(cores),
      axisLabel: { ...eixoBase(cores).axisLabel, interval: 'auto' }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: cores.borda, type: 'dashed' } },
      axisLabel: { color: cores.textoMuted, fontSize: 11, formatter: (v) => fmtInteiro(v) }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      confine: true,
      ...tooltipBase(cores),
      formatter: (params) => {
        if (!Array.isArray(params) || !params.length) return ''
        const itens = params.filter((p) => Number(p.value) > 0)
        if (!itens.length) return ''
        const cabecalho = `<div style="font-weight:700;font-size:11px;color:${cores.textoMuted};margin-bottom:6px">${escaparHtml(params[0].axisValue)}</div>`
        return (
          cabecalho +
          itens
            .map(
              (p) =>
                `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;font-size:12px;line-height:1.7">` +
                `<span style="color:${cores.textoMuted}">${p.marker}${escaparHtml(p.seriesName)}</span>` +
                `<strong style="color:${cores.texto};font-weight:700">${fmtInteiro(p.value)}</strong></div>`
            )
            .join('')
        )
      }
    },
    series: series.map((serie) => ({
      name: serie.nome,
      type: 'bar',
      stack: empilhamento,
      data: serie.dados,
      barMaxWidth: 34,
      itemStyle: { color: serie.cor || undefined, borderRadius: empilhamento ? 0 : [3, 3, 0, 0] }
    }))
  }
}

// Ranking horizontal - `itens` já ordenado (o maior primeiro). O ECharts
// desenha o eixo Y de baixo pra cima, então invertemos para o maior ficar no
// topo.
export function construirOpcaoBarrasHorizontais({ itens = [], cor, cores }) {
  const ordenados = [...itens].reverse()
  return {
    grid: { left: 6, right: 28, top: 6, bottom: 6, containLabel: true },
    xAxis: {
      type: 'value',
      minInterval: 1,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: cores.borda, type: 'dashed' } },
      axisLabel: { color: cores.textoMuted, fontSize: 11, formatter: (v) => fmtInteiro(v) }
    },
    yAxis: {
      type: 'category',
      data: ordenados.map((i) => i.rotulo),
      ...eixoBase(cores),
      axisLine: { show: false },
      axisLabel: { color: cores.texto, fontSize: 12, width: 130, overflow: 'truncate' }
    },
    tooltip: {
      trigger: 'item',
      confine: true,
      ...tooltipBase(cores),
      formatter: (p) =>
        `<span style="color:${cores.textoMuted}">${escaparHtml(p.name)}</span> ` +
        `<strong style="color:${cores.texto}">${fmtInteiro(p.value)}</strong>`
    },
    series: [
      {
        type: 'bar',
        data: ordenados.map((i) => i.valor),
        barMaxWidth: 22,
        itemStyle: { color: cor, borderRadius: [0, 3, 3, 0] },
        label: {
          show: true,
          position: 'right',
          color: cores.textoMuted,
          fontSize: 11,
          formatter: (p) => fmtInteiro(p.value)
        }
      }
    ]
  }
}
