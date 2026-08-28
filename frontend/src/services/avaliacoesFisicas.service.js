import http from './http.js'

// docs/adr/0016 - avaliação física estruturada. CRUD direto do personal, fora
// do pipeline de IA e de `validacao`. Avaliações importadas do BodyMove
// (origem=legado_bodymove) são visíveis e editáveis; a origem é preservada.

async function listar(alunoId) {
  const { data } = await http.get(`/api/v1/alunos/${alunoId}/avaliacoes-fisicas`)
  return data.data
}

async function obter(alunoId, avaliacaoId) {
  const { data } = await http.get(`/api/v1/alunos/${alunoId}/avaliacoes-fisicas/${avaliacaoId}`)
  return data.data
}

async function criar(alunoId, payload) {
  const { data } = await http.post(`/api/v1/alunos/${alunoId}/avaliacoes-fisicas`, payload)
  return data.data
}

async function atualizar(alunoId, avaliacaoId, payload) {
  const { data } = await http.put(`/api/v1/alunos/${alunoId}/avaliacoes-fisicas/${avaliacaoId}`, payload)
  return data.data
}

async function excluir(alunoId, avaliacaoId) {
  const { data } = await http.delete(`/api/v1/alunos/${alunoId}/avaliacoes-fisicas/${avaliacaoId}`)
  return data.data
}

async function listarMetricas() {
  const { data } = await http.get('/api/v1/metricas-avaliacao-fisica')
  return data.data
}

export default { listar, obter, criar, atualizar, excluir, listarMetricas }
