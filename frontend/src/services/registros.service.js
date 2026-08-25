import http from './http.js'

async function listar({ status } = {}) {
  const { data } = await http.get('/api/v1/registros', { params: status ? { status } : {} })
  return data.data
}

async function obter(id) {
  const { data } = await http.get(`/api/v1/registros/${id}`)
  return data.data
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

export default { listar, obter, sincronizar, confirmar }
