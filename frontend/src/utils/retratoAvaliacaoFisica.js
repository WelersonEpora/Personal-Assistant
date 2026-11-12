// Retrato da avaliação física: a leitura visual de UMA avaliação (composição
// corporal, indicadores na régua de referência, perímetros), útil desde a
// primeira - a evolução no tempo continua na aba "Comparar" (2+ avaliações).
// Puro: tudo calculado na hora a partir das medidas, nada gravado.
//
// A composição tem o mesmo formato do snapshot gravado no Acompanhamento
// Mensal (`avaliacao_fisica_resumo_json.composicao`, adendo 2026-11-12 da
// ADR-0029) - o mesmo gráfico serve à tela do personal e ao PDF do aluno.

import { classificar } from './referenciasAvaliacaoFisica.js'
import { rotuloMetodo } from './avaliacaoFisica.js'

// Valor numérico da medida principal da métrica (ou null).
export function valorPrincipal(avaliacao, codigo) {
  const m = (avaliacao?.medidas || []).find((x) => x.metrica_codigo === codigo && x.principal)
  if (!m) return null
  const n = Number(m.valor)
  return Number.isFinite(n) ? n : null
}

function metodoGordura(avaliacao) {
  const m = (avaliacao?.medidas || []).find((x) => x.metrica_codigo === 'percentual_gordura' && x.principal)
  return m?.metodo || null
}

function pontoComposicao(avaliacao) {
  const magra = valorPrincipal(avaliacao, 'massa_magra')
  const gorda = valorPrincipal(avaliacao, 'massa_gorda')
  if (magra == null || gorda == null) return null
  const metodo = metodoGordura(avaliacao)
  return {
    data: avaliacao.data,
    peso: valorPrincipal(avaliacao, 'peso') ?? magra + gorda,
    massa_magra: magra,
    massa_gorda: gorda,
    percentual_gordura: valorPrincipal(avaliacao, 'percentual_gordura'),
    metodo,
    metodo_rotulo: metodo && metodo !== 'direto' ? rotuloMetodo(metodo) : null
  }
}

// { atual, anterior } - anterior só com o mesmo método da % de gordura
// (métodos diferentes lado a lado sugeririam uma variação que não existe).
export function montarComposicao(avaliacao, anterior = null) {
  const atual = pontoComposicao(avaliacao)
  if (!atual) return null
  const base = anterior ? pontoComposicao(anterior) : null
  return { atual, anterior: base && base.metodo === atual.metodo ? base : null }
}

// Leitura do gráfico: rosca da avaliação ATUAL (parte de um todo - o formato
// dos laudos que o aluno conhece) + a variação para a anterior em texto. Duas
// roscas lado a lado esconderiam a mudança (ângulo se compara mal, e a rosca
// não mostra o tamanho absoluto), por isso a comparação não vira outra rosca.
// % de gordura da medida quando há; senão, a proporção das massas.
function variacaoKg(atual, anterior, direcao) {
  const delta = Math.round((atual - anterior) * 10) / 10
  if (delta === 0) return { delta, leitura: 'neutra' }
  const melhorou = direcao === 'menor' ? delta < 0 : delta > 0
  return { delta, leitura: melhorou ? 'favoravel' : 'desfavoravel' }
}

export function leituraComposicao(composicao) {
  const p = composicao?.atual
  if (!p) return null
  const total = p.massa_magra + p.massa_gorda
  const pctGordura = p.percentual_gordura ?? (total > 0 ? (p.massa_gorda / total) * 100 : 0)
  const a = composicao.anterior
  return {
    data: p.data,
    peso: p.peso,
    pctGordura,
    magra: { kg: p.massa_magra, pct: 100 - pctGordura },
    gorda: { kg: p.massa_gorda, pct: pctGordura },
    variacao: a
      ? {
          desde: a.data,
          gorda: variacaoKg(p.massa_gorda, a.massa_gorda, 'menor'),
          magra: variacaoKg(p.massa_magra, a.massa_magra, 'maior')
        }
      : null
  }
}

// Arcos da rosca (SVG, círculo de circunferência `circunferencia`): magra a
// partir do topo, gorda em seguida, com um respiro entre as fatias.
export function arcosRosca(leitura, circunferencia, respiro = 1.5) {
  if (!leitura) return []
  const fatias = [
    { chave: 'magra', pct: leitura.magra.pct },
    { chave: 'gorda', pct: leitura.gorda.pct }
  ].filter((f) => f.pct > 0)
  const comRespiro = fatias.length > 1
  let inicio = 0
  return fatias.map((f) => {
    const tamanho = (f.pct / 100) * circunferencia
    const arco = {
      chave: f.chave,
      comprimento: Math.max(tamanho - (comRespiro ? respiro : 0), 0),
      deslocamento: -(inicio + (comRespiro ? respiro / 2 : 0))
    }
    inicio += tamanho
    return arco
  })
}

// Indicadores mostrados na régua do retrato, nesta ordem. Só entram os que têm
// valor E referência aplicável (sexo/idade no cadastro) - os demais continuam
// na lista de medidas, com o motivo.
export const INDICADORES_RETRATO = [
  'imc',
  'percentual_gordura',
  'perimetro_cintura',
  'rcq',
  'rcest',
  'pas_repouso',
  'pad_repouso',
  'fc_repouso'
]

export function indicadoresComReferencia(avaliacao, ctx) {
  const lista = []
  for (const codigo of INDICADORES_RETRATO) {
    const m = (avaliacao?.medidas || []).find((x) => x.metrica_codigo === codigo && x.principal)
    if (!m) continue
    const classificacao = classificar(codigo, m.valor, ctx)
    if (!classificacao || classificacao.semReferencia) continue
    lista.push({ codigo, medida: m, valor: Number(m.valor), classificacao })
  }
  return lista
}

// Perímetros em dois grupos, cada um com a própria escala (o tronco é muito
// maior que os membros - numa escala só, braço e panturrilha virariam traço).
const REGIOES_TRONCO = [
  ['pescoco', 'Pescoço'],
  ['ombro', 'Ombro'],
  ['torax', 'Tórax'],
  ['cintura', 'Cintura'],
  ['abdome', 'Abdome'],
  ['quadril', 'Quadril']
]
const REGIOES_MEMBROS = [
  ['braco', 'Braço'],
  ['antebraco', 'Antebraço'],
  ['coxa', 'Coxa'],
  ['panturrilha', 'Panturrilha']
]

// Diferença entre direito e esquerdo que ganha o selo de assimetria (cm).
// Só informativo - não é referência clínica.
export const LIMITE_ASSIMETRIA_CM = 1

function linhaRegiao(avaliacao, regiao, rotulo, bilateral) {
  if (!bilateral) {
    const v = valorPrincipal(avaliacao, `perimetro_${regiao}`)
    return v == null ? null : { regiao, rotulo, valores: [{ lado: null, valor: v }], assimetria: null }
  }
  const d = valorPrincipal(avaliacao, `perimetro_${regiao}_d`)
  const e = valorPrincipal(avaliacao, `perimetro_${regiao}_e`)
  const valores = []
  if (d != null) valores.push({ lado: 'D', valor: d })
  if (e != null) valores.push({ lado: 'E', valor: e })
  if (!valores.length) return null
  let assimetria = null
  if (d != null && e != null) {
    const diferenca = Math.round(Math.abs(d - e) * 10) / 10
    if (diferenca >= LIMITE_ASSIMETRIA_CM) assimetria = { diferenca, maior: d > e ? 'D' : 'E' }
  }
  return { regiao, rotulo, valores, assimetria }
}

function grupo(avaliacao, titulo, regioes, bilateral) {
  const linhas = regioes.map(([regiao, rotulo]) => linhaRegiao(avaliacao, regiao, rotulo, bilateral)).filter(Boolean)
  if (!linhas.length) return null
  const maior = Math.max(...linhas.flatMap((l) => l.valores.map((v) => v.valor)))
  for (const l of linhas) for (const v of l.valores) v.largura = maior > 0 ? (v.valor / maior) * 100 : 0
  return { titulo, linhas }
}

export function montarPerimetros(avaliacao) {
  return [
    grupo(avaliacao, 'Tronco', REGIOES_TRONCO, false),
    grupo(avaliacao, 'Membros', REGIOES_MEMBROS, true)
  ].filter(Boolean)
}

// --- Cards Resumo: a linha de leitura no topo de cada card ---------------
// `tom` segue as classes de badge/cor (success | warning | danger | neutral).

function kgTexto(n) {
  return `${Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`
}
function dataCurta(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// "21,7% de gordura" + a variação da massa gorda para a anterior (mesmo método).
export function resumoComposicao(composicao) {
  const l = leituraComposicao(composicao)
  if (!l) return null
  const principal = `${l.pctGordura.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% de gordura`
  const v = l.variacao?.gorda
  if (!v) return { principal, variacao: null, tom: 'neutral' }
  const texto =
    v.delta === 0
      ? `gordura estável desde ${dataCurta(l.variacao.desde)}`
      : `${v.delta > 0 ? '+' : '−'}${kgTexto(v.delta)} de gordura desde ${dataCurta(l.variacao.desde)}`
  const tom = { favoravel: 'success', desfavoravel: 'warning', neutra: 'neutral' }[v.leitura]
  return { principal, variacao: texto, tom }
}

// "2 de 4 fora da faixa adequada" - conta as faixas de atenção (warning/danger);
// 'info' (ex.: FC baixa de quem treina) não é problema.
export function resumoIndicadores(indicadores) {
  if (!indicadores?.length) return null
  const fora = indicadores.filter((i) => ['warning', 'danger'].includes(i.classificacao.tom))
  if (!fora.length) return { texto: 'Todos na faixa adequada', tom: 'success' }
  const tom = fora.some((i) => i.classificacao.tom === 'danger') ? 'danger' : 'warning'
  return { texto: `${fora.length} de ${indicadores.length} fora da faixa adequada`, tom }
}

export function resumoPerimetros(grupos) {
  if (!grupos?.length) return null
  const comAssimetria = grupos.flatMap((g) => g.linhas).filter((l) => l.assimetria)
  const temBilateral = grupos.some((g) => g.linhas.some((l) => l.valores.length === 2))
  if (comAssimetria.length) {
    const n = comAssimetria.length
    return { texto: `Assimetria em ${n} ${n === 1 ? 'região' : 'regiões'}`, tom: 'warning' }
  }
  if (temBilateral) return { texto: 'Sem assimetria entre os lados', tom: 'success' }
  const total = grupos.reduce((s, g) => s + g.linhas.length, 0)
  return { texto: `${total} ${total === 1 ? 'medida' : 'medidas'}`, tom: 'neutral' }
}

// O retrato tem algo a mostrar? (sem ele, a lista de medidas abre sozinha)
export function retratoTemConteudo(avaliacao, ctx) {
  return Boolean(
    montarComposicao(avaliacao) || montarPerimetros(avaliacao).length || indicadoresComReferencia(avaliacao, ctx).length
  )
}
