// Rótulos de status exibidos na UI - cobre tanto os estados locais (só no
// dispositivo, ver docs/adr/0004) quanto os estados de servidor (docs/adr/
// 0002-conceito-de-registro.md). Nunca persistidos juntos no mesmo lugar,
// mas a UI precisa apresentar os dois de forma consistente.
export const STATUS_META = {
  em_andamento: { label: 'Em andamento', badge: 'primary', icon: '✏️' },
  pendente_sincronizacao: { label: 'Salvo no dispositivo', badge: 'warning', icon: '📴' },
  sincronizando: { label: 'Sincronizando…', badge: 'info', icon: '⇅' },
  erro_sincronizacao: { label: 'Falha ao sincronizar', badge: 'danger', icon: '⚠️' },

  recebido: { label: 'Recebido, aguardando IA', badge: 'info', icon: '⏳' },
  transcrevendo: { label: 'Transcrevendo áudio…', badge: 'info', icon: '✨' },
  interpretando: { label: 'IA interpretando…', badge: 'info', icon: '✨' },
  aguardando_revisao: { label: 'Aguardando revisão', badge: 'primary', icon: '📝' },
  confirmado: { label: 'Confirmado', badge: 'success', icon: '✓' },
  erro_transcricao: { label: 'Falha na transcrição', badge: 'danger', icon: '⚠️' },
  erro_interpretacao: { label: 'Falha na interpretação', badge: 'danger', icon: '⚠️' }
}

export function statusMeta(status) {
  return STATUS_META[status] || { label: status, badge: 'neutral', icon: '•' }
}

// docs/adr/0018 - tipo do Registro. `atendimento` é o default e não recebe
// selo (não polui a lista); `avaliacao_fisica` fica visualmente destacado.
export function tipoMeta(tipo) {
  if (tipo === 'avaliacao_fisica') {
    return { tipo, label: 'Avaliação física', chip: 'Avaliação', icon: '📏', badge: 'avaliacao' }
  }
  return { tipo: 'atendimento', label: 'Atendimento', chip: '', icon: '📝', badge: 'neutral' }
}

export function entradaIcon(tipo) {
  return tipo === 'audio' ? '🎙️' : '⌨️'
}

export function resumoEntradas(entradas) {
  const audios = entradas.filter((e) => e.tipo === 'audio').length
  const textos = entradas.filter((e) => e.tipo === 'texto').length
  const partes = []
  if (audios) partes.push(`🎙️ ${audios}`)
  if (textos) partes.push(`⌨️ ${textos}`)
  return partes.join('  ·  ')
}

const CORES_AVATAR = ['#4f46e5', '#0ea5e9', '#16a34a', '#d97706', '#db2777', '#7c3aed', '#059669', '#dc2626']

// Cor determinística por id (não há campo "cor" no modelo real de Aluno,
// docs/adr/0008 - mantém só nome/observações/ativo).
export function corParaId(id) {
  if (!id) return CORES_AVATAR[0]
  let soma = 0
  for (let i = 0; i < id.length; i += 1) soma += id.charCodeAt(i)
  return CORES_AVATAR[soma % CORES_AVATAR.length]
}

export function iniciais(nome) {
  if (!nome) return '?'
  const partes = nome.trim().split(/\s+/)
  const primeira = partes[0]?.[0] || ''
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : ''
  return (primeira + ultima).toUpperCase()
}

export function formatarHora(dataIso) {
  if (!dataIso) return ''
  return new Date(dataIso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function formatarData(dataIso) {
  if (!dataIso) return ''
  return new Date(dataIso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

// docs/adr/0019 - data do atendimento (DATEONLY "AAAA-MM-DD", sem fuso).
const DIAS_SEMANA_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

// "AAAA-MM-DD" do dia local de hoje (a data que o personal enxerga no relógio).
export function hojeYmd(base = new Date()) {
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`
}

// Chips de dia relativo para o seletor "quando foi o atendimento?" (captura):
// Hoje, Ontem e os demais como "qua 26", limitado aos últimos `qtd` dias
// (docs/adr/0019 - captura só retroage 7 dias; datas mais antigas, no desktop).
export function chipsDataAtendimento(qtd = 8) {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const lista = []
  for (let i = 0; i < qtd; i += 1) {
    const d = new Date(hoje)
    d.setDate(d.getDate() - i)
    let rotulo
    if (i === 0) rotulo = 'Hoje'
    else if (i === 1) rotulo = 'Ontem'
    else rotulo = `${DIAS_SEMANA_CURTO[d.getDay()]} ${d.getDate()}`
    lista.push({ ymd: hojeYmd(d), rotulo })
  }
  return lista
}

// Rótulo curto de uma data de atendimento para banners/listas: "Hoje",
// "Ontem" ou "DD/MM/AAAA". `curto` usa "DD/MM".
export function rotuloDataAtendimento(ymd, { curto = false } = {}) {
  if (!ymd) return ''
  const iso = String(ymd).slice(0, 10)
  const hoje = hojeYmd()
  if (iso === hoje) return 'Hoje'
  const ontem = new Date()
  ontem.setDate(ontem.getDate() - 1)
  if (iso === hojeYmd(ontem)) return 'Ontem'
  const [ano, mes, dia] = iso.split('-')
  return curto ? `${dia}/${mes}` : `${dia}/${mes}/${ano}`
}

export function ehRetroativo(ymd) {
  return Boolean(ymd) && String(ymd).slice(0, 10) !== hojeYmd()
}

// "AAAA-MM-DD" -> "DD/MM/AAAA" sem depender de fuso (a data do atendimento é
// um dia, não um instante). Usado no /admin, onde "Hoje/Ontem" não cabe.
export function formatarDataAtendimento(ymd) {
  if (!ymd) return ''
  const [ano, mes, dia] = String(ymd).slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

export function formatarDataHora(dataIso) {
  if (!dataIso) return ''
  const data = new Date(dataIso)
  const dataStr = data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return `${dataStr} às ${formatarHora(dataIso)}`
}
