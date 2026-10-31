// Linha do Tempo do aluno (aba "Linha do Tempo" do detalhe do aluno): junta
// relatos, avaliações físicas, análises intermediárias de IA, observações do
// personal e o Acompanhamento Mensal num feed único por mês, em ordem
// cronológica - mais recente primeiro.
//
// Cada evento cai no mês em que ACONTECEU: relato pela data do atendimento
// (docs/adr/0019), avaliação física pela data dela. O Acompanhamento Mensal,
// porém, considera os relatos pelo mês da CONFIRMAÇÃO (docs/adr/0015) - o
// relato confirmado depois de o mês virar é marcado com o mês em que ele
// realmente conta (`contaNoMes`), para a linha não prometer o que o
// Acompanhamento daquele mês não leu. Puro (sem Vue) para ser testável.

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
      mapa.set(anoMes, { anoMes, mensal: null, eventos: [], confirmadosNoMes: 0, pendentes: 0 })
    }
    return mapa.get(anoMes)
  }
  mes(mesAtual) // o mês atual sempre aparece: é onde ficam as ações

  // Avaliação física capturada por voz e já confirmada aparece uma vez só:
  // pela avaliação (dado oficial), não pelo Registro que a originou.
  const registrosComAvaliacao = new Set(avaliacoesFisicas.map((av) => av.registro_id).filter(Boolean))

  for (const r of registros) {
    if (registrosComAvaliacao.has(r.id)) continue
    const dia = diaDe(r.data_atendimento || r.created_at)
    const alvo = mes(dia.slice(0, 7))
    const confirmacao = confirmadoEm(r)
    const contaNoMes = confirmacao && anoMesDe(confirmacao) !== alvo.anoMes ? anoMesDe(confirmacao) : null
    alvo.eventos.push({
      tipo: r.tipo === 'avaliacao_fisica' ? 'fisica' : 'relato',
      chave: `r:${r.id}`,
      dia,
      ordem: r.created_at,
      registro: r,
      contaNoMes
    })
    if (r.tipo !== 'avaliacao_fisica') {
      if (confirmacao) mes(anoMesDe(confirmacao)).confirmadosNoMes++
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

  return [...mapa.values()]
    .sort((a, b) => b.anoMes.localeCompare(a.anoMes))
    .map((m) => {
      const eventos = m.eventos.sort(porMaisRecente)
      const contagem = { relato: 0, fisica: 0, analise: 0, observacao: 0 }
      for (const e of eventos) contagem[e.tipo]++
      return { ...m, eventos, contagem, emAndamento: m.anoMes >= mesAtual }
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
