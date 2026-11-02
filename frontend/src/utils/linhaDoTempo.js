// Linha do Tempo do aluno (aba "Linha do Tempo" do detalhe do aluno): junta
// relatos, avaliações físicas, análises intermediárias de IA, observações do
// personal e o Acompanhamento Mensal num feed único por mês, em ordem
// cronológica - mais recente primeiro.
//
// Cada evento cai no mês em que ACONTECEU: relato pela data do atendimento
// (docs/adr/0019), avaliação física pela data dela. O Acompanhamento Mensal
// usa o mesmo critério para os relatos (docs/adr/0015, adendo 2026-11-02).
// Relato confirmado depois de o mês já ter Acompanhamento fica de fora dele
// até o personal regerar - `foraDoMensal` conta esses (comparando com
// `baseada_em_registro_ids`). Puro (sem Vue) para ser testável.

export const TIPOS_EVENTO = ['mensal', 'relato', 'fisica', 'analise', 'observacao']

const SO_DATA = /^\d{4}-\d{2}-\d{2}$/

// "YYYY-MM-DD" no horário local. Data pura (DATE do banco) é devolvida como
// está - `new Date('2026-10-01')` seria meia-noite UTC e cairia no dia
// anterior no Brasil.
export function diaDe(valor) {
  if (!valor) return ''
  const s = String(valor)
  if (SO_DATA.test(s)) return s
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function anoMesDe(valor) {
  return diaDe(valor).slice(0, 7)
}

// Primeiro dia do mês seguinte a "YYYY-MM" - quando o job gera o
// Acompanhamento Mensal daquele mês.
export function inicioMesSeguinte(anoMes) {
  const [ano, mes] = anoMes.split('-').map(Number)
  const d = new Date(ano, mes, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function confirmadoEm(registro) {
  return registro.status === 'confirmado' ? registro.validacao?.confirmado_em || null : null
}

const porMaisRecente = (a, b) => b.dia.localeCompare(a.dia) || String(b.ordem).localeCompare(String(a.ordem))

export function montarLinhaDoTempo({
  registros = [],
  mensais = [],
  analises = [],
  observacoes = [],
  avaliacoesFisicas = [],
  mesAtual
}) {
  const mapa = new Map()
  const mes = (anoMes) => {
    if (!mapa.has(anoMes)) {
      mapa.set(anoMes, { anoMes, mensal: null, eventos: [], confirmados: [], pendentes: 0 })
    }
    return mapa.get(anoMes)
  }
  mes(mesAtual) // o mês atual sempre aparece: é onde ficam as ações

  // Avaliação física capturada por voz e já confirmada aparece uma vez só:
  // pela avaliação (dado oficial), não pelo Registro que a originou.
  const registrosComAvaliacao = new Set(avaliacoesFisicas.map((av) => av.registro_id).filter(Boolean))

  for (const r of registros) {
    if (registrosComAvaliacao.has(r.id)) continue
    // Ficha ditada (docs/adr/0028) é prescrição, não relato: fica fora da Linha
    // do Tempo e das contagens do mês.
    if (r.tipo === 'ficha_treino') continue
    const dia = diaDe(r.data_atendimento || r.created_at)
    const alvo = mes(dia.slice(0, 7))
    alvo.eventos.push({
      tipo: r.tipo === 'avaliacao_fisica' ? 'fisica' : 'relato',
      chave: `r:${r.id}`,
      dia,
      ordem: r.created_at,
      registro: r
    })
    if (r.tipo !== 'avaliacao_fisica') {
      if (confirmadoEm(r)) alvo.confirmados.push(r.id)
      else alvo.pendentes++
    }
  }

  for (const av of avaliacoesFisicas) {
    const dia = diaDe(av.data)
    mes(dia.slice(0, 7)).eventos.push({ tipo: 'fisica', chave: `f:${av.id}`, dia, ordem: av.created_at, avaliacao: av })
  }

  for (const an of analises) {
    const dia = diaDe(an.solicitada_em)
    mes(dia.slice(0, 7)).eventos.push({ tipo: 'analise', chave: `s:${an.id}`, dia, ordem: an.solicitada_em, analise: an })
  }

  for (const o of observacoes) {
    const dia = diaDe(o.created_at)
    mes(dia.slice(0, 7)).eventos.push({ tipo: 'observacao', chave: `o:${o.id}`, dia, ordem: o.created_at, observacao: o })
  }

  for (const m of mensais) mes(m.ano_mes).mensal = m
  // Relato lido por QUALQUER Acompanhamento não conta como "fora": antes do
  // adendo, um relato de 30/09 confirmado em 01/10 entrou no de outubro -
  // regerar setembro por ele o leria duas vezes.
  const lidos = new Set(mensais.flatMap((m) => m.baseada_em_registro_ids || []))

  return [...mapa.values()]
    .sort((a, b) => b.anoMes.localeCompare(a.anoMes))
    .map(({ confirmados, ...m }) => {
      const eventos = m.eventos.sort(porMaisRecente)
      const contagem = { relato: 0, fisica: 0, analise: 0, observacao: 0 }
      for (const e of eventos) contagem[e.tipo]++
      const foraDoMensal = m.mensal ? confirmados.filter((id) => !lidos.has(id)).length : 0
      return { ...m, eventos, contagem, confirmadosNoMes: confirmados.length, foraDoMensal, emAndamento: m.anoMes >= mesAtual }
    })
}

// Depois de filtrar por tipo: a data aparece só no primeiro evento de cada
// dia (vários eventos no mesmo dia ficam agrupados sob ela).
export function comDataAgrupada(eventos) {
  let anterior = null
  return eventos.map((e) => {
    const mostrarData = e.dia !== anterior
    anterior = e.dia
    return { ...e, mostrarData }
  })
}

export function resumoContagem(contagem) {
  const partes = []
  const add = (n, um, varios) => n && partes.push(`${n} ${n === 1 ? um : varios}`)
  add(contagem.relato, 'relato', 'relatos')
  add(contagem.fisica, 'avaliação física', 'avaliações físicas')
  add(contagem.analise, 'análise de IA', 'análises de IA')
  add(contagem.observacao, 'observação', 'observações')
  return partes.join(' · ')
}
