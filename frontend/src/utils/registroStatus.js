// Rótulos de status exibidos na UI - cobre tanto os estados locais (só no
// dispositivo, ver docs/adr/0004) quanto os estados de servidor (docs/adr/
// 0002-conceito-de-registro.md). Nunca persistidos juntos no mesmo lugar,
// mas a UI precisa apresentar os dois de forma consistente.
export const STATUS_META = {
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
