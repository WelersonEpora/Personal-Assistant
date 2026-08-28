import http from './http.js'

async function listar({ status } = {}) {
  const { data } = await http.get('/api/v1/registros', { params: status ? { status } : {} })
  return data.data
}

async function obter(id) {
  const { data } = await http.get(`/api/v1/registros/${id}`)
  return data.data
}

// O endpoint exige o header Authorization (ver services/http.js) - uma tag
// <audio src="..."> direta não manda esse header, por isso o áudio precisa
// ser buscado como Blob e virar um object URL (mesmo padrão do áudio local
// gravado no dispositivo, ver offline/db.js).
async function obterAudio(registroId, entradaId) {
  const { data } = await http.get(`/api/v1/registros/${registroId}/entradas/${entradaId}/audio`, { responseType: 'blob' })
  return data
}

// Envia um Registro completo (metadados + arquivos de áudio) numa única
// requisição multipart, atômica e idempotente pelo id gerado no cliente
// (docs/adr/0005-estrategia-sincronizacao.md). `registro` vem do formato
// local do IndexedDB (ver offline/db.js): { id, alunoId, titulo, iniciadoEm,
// entradas: [{ ordem, tipo, conteudoTexto?, duracaoSegundos?, audioBlob? }] }.
async function sincronizar(registro) {
  const metadata = {
    id: registro.id,
    alunoId: registro.alunoId,
    titulo: registro.titulo || '',
    iniciadoEm: registro.iniciadoEm,
    // docs/adr/0018 - ausente no backend cai em 'atendimento' (compat).
    tipo: registro.tipo || 'atendimento',
    entradas: registro.entradas.map((entrada) => ({
      ordem: entrada.ordem,
      tipo: entrada.tipo,
      conteudoTexto: entrada.tipo === 'texto' ? entrada.conteudoTexto : undefined,
      duracaoSegundos: entrada.tipo === 'audio' ? entrada.duracaoSegundos : undefined
    }))
  }

  const formData = new FormData()
  formData.append('metadata', JSON.stringify(metadata))
  registro.entradas.forEach((entrada) => {
    if (entrada.tipo === 'audio' && entrada.audioBlob) {
      formData.append(`audio_${entrada.ordem}`, entrada.audioBlob, `${entrada.ordem}.webm`)
    }
  })

  const { data } = await http.post(`/api/v1/registros/${registro.id}/sincronizar`, formData)
  return data.data
}

async function confirmar(id, { itens, notaGeral }) {
  const { data } = await http.post(`/api/v1/registros/${id}/confirmar`, { itens, notaGeral })
  return data.data
}

// docs/adr/0018 - confirmação de Registro tipo avaliacao_fisica. Endpoint
// próprio; NUNCA escreve `validacao` (ADR-0007). `payload` é a avaliação
// revisada, mesmo formato do CRUD (data, observacoes, medidas, ...).
async function confirmarAvaliacaoFisica(id, payload) {
  const { data } = await http.post(`/api/v1/registros/${id}/confirmar-avaliacao-fisica`, payload)
  return data.data
}

// Soft-delete (docs/adr/0007) - o backend rejeita quando o Registro já está
// confirmado, ver comentário em registro.service.js.
async function excluir(id) {
  const { data } = await http.delete(`/api/v1/registros/${id}`)
  return data.data
}

// Reprocessamento manual - o backend rejeita quando o Registro não está em
// erro_transcricao/erro_interpretacao, ver comentário em registro.service.js.
async function reprocessar(id) {
  const { data } = await http.post(`/api/v1/registros/${id}/reprocessar`)
  return data.data
}

export default { listar, obter, obterAudio, sincronizar, confirmar, confirmarAvaliacaoFisica, excluir, reprocessar }
