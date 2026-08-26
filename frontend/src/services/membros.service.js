import http from './http.js'

async function listar() {
  const { data } = await http.get('/api/v1/membros')
  return data.data
}

async function criar({ nome, email, senha, especialidade, papel }) {
  const { data } = await http.post('/api/v1/membros', { nome, email, senha, especialidade, papel })
  return data.data
}

async function atualizar(id, dados) {
  const { data } = await http.put(`/api/v1/membros/${id}`, dados)
  return data.data
}

// Mesmo padrão de alunos.service.js::obterFoto/enviarFoto - o endpoint
// exige Authorization, então a foto precisa ser buscada como Blob.
async function obterFoto(id) {
  const { data } = await http.get(`/api/v1/membros/${id}/foto`, { responseType: 'blob' })
  return data
}

async function enviarFoto(id, arquivo) {
  const formData = new FormData()
  formData.append('foto', arquivo)
  const { data } = await http.post(`/api/v1/membros/${id}/foto`, formData)
  return data.data
}

export default { listar, criar, atualizar, obterFoto, enviarFoto }
