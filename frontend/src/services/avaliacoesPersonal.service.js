import http from './http.js'

// Avaliação escrita pelo próprio personal (docs/adr/0015) - texto livre, sem
// IA. Entra como contexto nos próximos ciclos de IA (mensal e sob demanda).
async function listar(alunoId) {
  const { data } = await http.get(`/api/v1/alunos/${alunoId}/avaliacoes-personal`)
  return data.data
}

async function criar(alunoId, texto) {
  const { data } = await http.post(`/api/v1/alunos/${alunoId}/avaliacoes-personal`, { texto })
  return data.data
}

async function atualizar(alunoId, avaliacaoId, texto) {
  const { data } = await http.patch(`/api/v1/alunos/${alunoId}/avaliacoes-personal/${avaliacaoId}`, { texto })
  return data.data
}

async function excluir(alunoId, avaliacaoId) {
  const { data } = await http.delete(`/api/v1/alunos/${alunoId}/avaliacoes-personal/${avaliacaoId}`)
  return data.data
}

export default { listar, criar, atualizar, excluir }
