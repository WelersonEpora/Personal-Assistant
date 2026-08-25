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

export default { listar, criar, atualizar }
