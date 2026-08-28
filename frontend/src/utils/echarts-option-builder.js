// Constrói a option do Apache ECharts para charts/LineChart.vue - função pura,
// sem Vue nem DOM (testável com node:test puro). Mesmo padrão do AgroMind
// (utils/echarts-option-builder.js lá), simplificado: aqui o eixo X é SEMPRE
// temporal (toda avaliação física tem data ISO), as séries são curtas
// (<= ~15 pontos) e os valores são pequenos (kg, cm, %) - sem eixo de
// categoria, sem abreviação M/K, sem amostragem LTTB.
//
// Contrato de entrada (`series`):
//   [{ nome, cor, casas, pontos: [{ periodo: '2015-06-10', valor: 70 }] }]

const CROSSHAIR_LARGURA = 1

function paraNumero(valor) {
  return valor == null ? NaN : Number(valor)
}

// Maior intervalo real entre pontos consecutivos da própria série - o tooltip
// (trigger:'axis') usa para não mostrar um ponto de série esparsa que está a
// anos de distância do cursor (ex.: peso em toda avaliação × % gordura só em
// algumas).
function calcularTolerancia(xs) {
  if (xs.length < 2) return Infinity
  let maior = 0
  for (let i = 1; i < xs.length; i++) maior = Math.max(maior, xs[i] - xs[i - 1])
  return maior
}

function escaparHtml(texto) {
  return String(texto).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
}

function formatarData(timestamp) {
  return new Date(timestamp).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC'
  })
}

function fmtNumero(valor, casas) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas
  }).format(valor)
}

// Prepara as séries para o formato do ECharts, sem detalhe de apresentação -
// separado para ser testável isoladamente.
export function prepararGrafico(series) {
  const seriesPreparadas = (series || []).map((serie) => {
    const pontos = (serie.pontos || [])
      .map((p) => ({ x: Date.parse(p.periodo), y: paraNumero(p.valor) }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      .sort((a, b) => a.x - b.x)
    return {
      nome: serie.nome,
      cor: serie.cor || null,
      casas: Number.isInteger(serie.casas) ? serie.casas : 1,
      dados: pontos.map((p) => [p.x, p.y]),
      tolerancia: calcularTolerancia(pontos.map((p) => p.x))
    }
  })
  const temDadoSuficiente = seriesPreparadas.some((s) => s.dados.length >= 2)
  return { seriesPreparadas, temDadoSuficiente }
}

// Tooltip HTML (o container do ECharts fica fora da árvore do Vue, então o
// visual vem daqui e das opções tooltip.* abaixo).
function criarFormatadorTooltip({ seriesPreparadas, unidade, cores }) {
  const porNome = new Map(seriesPreparadas.map((s) => [s.nome, s]))
  const sufixo = unidade ? ` <span style="color:${cores.textoMuted};font-weight:400">${escaparHtml(unidade)}</span>` : ''

  return (params) => {
    if (!Array.isArray(params) || params.length === 0) return ''

    const itens = params
      .map((item) => {
        const [x, y] = item.value ?? []
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null
        const meta = porNome.get(item.seriesName)
        const tolerancia = meta?.tolerancia ?? Infinity
        if (Math.abs(x - item.axisValue) > tolerancia) return null
        return { marker: item.marker, nome: item.seriesName, valor: y, casas: meta?.casas ?? 1, x }
      })
      .filter(Boolean)

    if (itens.length === 0) return ''

    // Cabeçalho ancorado no ponto real mais próximo do cursor (nunca uma data
    // interpolada).
    const ancora = itens.reduce((maisProx, item) =>
      Math.abs(item.x - params[0].axisValue) < Math.abs(maisProx.x - params[0].axisValue) ? item : maisProx
    )

    const linhas = itens
      .map(
        (item) =>
          '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:16px;font-size:12px;line-height:1.7">' +
          `<span style="color:${cores.textoMuted}">${item.marker}${escaparHtml(item.nome)}</span>` +
          `<strong style="color:${cores.texto};font-weight:700">${fmtNumero(item.valor, item.casas)}${sufixo}</strong>` +
          '</div>'
      )
      .join('')

    return (
      `<div style="font-weight:700;font-size:11px;color:${cores.textoMuted};margin-bottom:6px">` +
      `${escaparHtml(formatarData(ancora.x))}</div>${linhas}`
    )
  }
}

// markArea com as faixas de referência (ex.: categorias de IMC) - fundo
// discreto, `silent` (não captura hover, não entra no tooltip), rótulo
// pequeno e apagado à direita. Fica no primeiro `line` do gráfico.
function construirMarkArea(faixas, cores) {
  if (!Array.isArray(faixas) || faixas.length === 0) return undefined
  return {
    silent: true,
    label: {
      show: true,
      position: 'insideTopRight',
      color: cores.textoMuted,
      fontSize: 10,
      opacity: 0.9
    },
    emphasis: { disabled: true },
    data: faixas.map((faixa) => [
      { yAxis: faixa.min, itemStyle: { color: faixa.cor }, name: faixa.rotulo },
      { yAxis: Number.isFinite(faixa.max) ? faixa.max : 1000 }
    ])
  }
}

export function construirOpcaoLineChart({ series, unidade = null, cores, paleta = [], faixas = null, janela = null }) {
  const { seriesPreparadas } = prepararGrafico(series)
  const temLegenda = seriesPreparadas.length > 1
  const casasEixo = Math.max(1, ...seriesPreparadas.map((s) => s.casas))
  const markArea = construirMarkArea(faixas, cores)
  // Com markArea, o eixo Y é fixado (funções sobre {min,max} dos dados) para
  // as faixas não esticarem a escala. `janela` força um intervalo mínimo
  // sempre visível (união com os dados) - ex.: IMC 15..30.
  const pisoY = markArea
    ? (v) => Math.floor(Math.min(v.min - 1, janela ? janela.min : v.min))
    : undefined
  const tetoY = markArea
    ? (v) => Math.ceil(Math.max(v.max + 1, janela ? janela.max : v.max))
    : undefined

  return {
    // Paleta de tamanho FIXO no topo - um array variável aqui faz o vue-echarts
    // tentar "replaceMerge" a chave "color" ao trocar para uma option com menos
    // séries, e "color" não é component type válido (achado do AgroMind). Cada
    // série ainda define a própria cor em lineStyle/itemStyle abaixo.
    color: paleta,
    grid: { left: 6, right: 14, top: temLegenda ? 34 : 12, bottom: 8, containLabel: true },
    legend: temLegenda
      ? {
          top: 0,
          left: 0,
          icon: 'roundRect',
          itemWidth: 14,
          itemHeight: 3,
          itemGap: 16,
          textStyle: { color: cores.textoMuted, fontSize: 12 }
        }
      : undefined,
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: cores.borda } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        color: cores.textoMuted,
        fontSize: 11,
        hideOverlap: true,
        formatter: (valor) =>
          new Date(valor).toLocaleDateString('pt-BR', { month: '2-digit', year: '2-digit', timeZone: 'UTC' })
      }
    },
    yAxis: {
      type: 'value',
      // Sem faixas, `scale: true` aproxima na variação do dado. Com faixas, o
      // eixo é a UNIÃO do intervalo dos dados com a janela de referência
      // (pisoY/tetoY), para as categorias ficarem sempre visíveis.
      scale: !markArea,
      min: pisoY,
      max: tetoY,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: cores.borda, type: 'dashed' } },
      axisLabel: {
        color: cores.textoMuted,
        fontSize: 11,
        formatter: (valor) => fmtNumero(valor, valor % 1 === 0 ? 0 : casasEixo)
      }
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: cores.fundo,
      borderColor: cores.borda,
      borderWidth: 1,
      padding: 10,
      extraCssText: 'border-radius:8px; box-shadow:0 2px 10px rgba(0,0,0,0.08);',
      axisPointer: { type: 'line', lineStyle: { color: cores.crosshair, width: CROSSHAIR_LARGURA }, label: { show: false } },
      formatter: criarFormatadorTooltip({ seriesPreparadas, unidade, cores })
    },
    series: seriesPreparadas.map((serie, i) => ({
      name: serie.nome,
      type: 'line',
      data: serie.dados,
      symbol: 'circle',
      symbolSize: 7,
      showSymbol: true,
      smooth: false,
      connectNulls: false,
      lineStyle: { width: 2, color: serie.cor || undefined },
      itemStyle: { color: serie.cor || undefined },
      emphasis: { focus: 'series' },
      // markArea (faixas de referência) renderiza atrás da linha por padrão
      ...(i === 0 && markArea ? { markArea } : {})
    }))
  }
}
