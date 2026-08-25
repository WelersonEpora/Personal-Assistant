import http from './http.js'

async function obter() {
  const { data } = await http.get('/api/v1/equipe')
  return data.data
}

async function atualizarNome(nome) {
  const { data } = await http.put('/api/v1/equipe', { nome })
  return data.data
}

export default { obter, atualizarNome }
