import http from './http.js'

async function listar() {
  const { data } = await http.get('/api/v1/alunos')
  return data.data
}

async function obter(id) {
  const { data } = await http.get(`/api/v1/alunos/${id}`)
  return data.data
}

async function criar({ nome, observacoes, telefone }) {
  const { data } = await http.post('/api/v1/alunos', { nome, observacoes, telefone })
  return data.data
}

async function atualizar(id, dados) {
  const { data } = await http.put(`/api/v1/alunos/${id}`, dados)
  return data.data
}

// Soft-delete (leva consigo os Registros do aluno, ver aluno.service.js).
async function excluir(id) {
  const { data } = await http.delete(`/api/v1/alunos/${id}`)
  return data.data
}

// Mesmo padrão do áudio (registros.service.js::obterAudio) - o endpoint
// exige Authorization, então a foto precisa ser buscada como Blob e virar
// um object URL em vez de ir direto num <img src="...">.
async function obterFoto(id) {
  const { data } = await http.get(`/api/v1/alunos/${id}/foto`, { responseType: 'blob' })
  return data
}

async function enviarFoto(id, arquivo) {
  const formData = new FormData()
  formData.append('foto', arquivo)
  const { data } = await http.post(`/api/v1/alunos/${id}/foto`, formData)
  return data.data
}

async function removerFoto(id) {
  const { data } = await http.delete(`/api/v1/alunos/${id}/foto`)
  return data.data
}

export default { listar, obter, criar, atualizar, excluir, obterFoto, enviarFoto, removerFoto }
