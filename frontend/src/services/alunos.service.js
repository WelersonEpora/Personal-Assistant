import http from './http.js'

async function listar() {
  const { data } = await http.get('/api/v1/alunos')
  return data.data
}

async function obter(id) {
  const { data } = await http.get(`/api/v1/alunos/${id}`)
  return data.data
}

async function criar({ nome, observacoes }) {
  const { data } = await http.post('/api/v1/alunos', { nome, observacoes })
  return data.data
}

async function atualizar(id, dados) {
  const { data } = await http.put(`/api/v1/alunos/${id}`, dados)
  return data.data
}

export default { listar, obter, criar, atualizar }
