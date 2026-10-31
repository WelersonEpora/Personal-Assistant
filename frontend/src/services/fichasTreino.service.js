import http from './http.js'

// Ficha de Treino (docs/adr/0013) - prescrição montada manualmente pelo
// personal a partir do catálogo, sem IA. Cada "salvar" cria uma nova versão
// (nunca sobrescreve a ficha anterior) - não existe endpoint de edição.
// Várias fichas ativas por aluno e exercícios em grupos (docs/adr/0026).
async function listarPorAluno(alunoId) {
  const { data } = await http.get(`/api/v1/alunos/${alunoId}/fichas-treino`)
  return data.data
}

async function listarAtivas(alunoId) {
  const { data } = await http.get(`/api/v1/alunos/${alunoId}/fichas-treino/ativas`)
  return data.data
}

async function obter(fichaId) {
  const { data } = await http.get(`/api/v1/fichas-treino/${fichaId}`)
  return data.data
}

// Sem `substituiFichaId`, a ficha nova soma às ativas; com, vira a nova versão
// daquela ficha (só ela é desativada).
async function criarNovaVersao(alunoId, { nome, observacoes, substituiFichaId, grupos }) {
  const { data } = await http.post(`/api/v1/alunos/${alunoId}/fichas-treino`, {
    nome,
    observacoes,
    substituiFichaId,
    grupos
  })
  return data.data
}

async function arquivar(fichaId) {
  const { data } = await http.post(`/api/v1/fichas-treino/${fichaId}/arquivar`, {})
  return data.data
}

// Link temporário de acesso do aluno à ficha ativa (docs/adr/0014). GET
// devolve o link atual (com o token, para recopiar) ou null; POST gera um
// novo, revogando o anterior; DELETE revoga.
async function obterLink(alunoId) {
  const { data } = await http.get(`/api/v1/alunos/${alunoId}/ficha-link`)
  return data.data
}

async function gerarLink(alunoId) {
  const { data } = await http.post(`/api/v1/alunos/${alunoId}/ficha-link`, {})
  return data.data
}

async function revogarLink(alunoId) {
  const { data } = await http.delete(`/api/v1/alunos/${alunoId}/ficha-link`)
  return data.data
}

export default { listarPorAluno, listarAtivas, obter, criarNovaVersao, arquivar, obterLink, gerarLink, revogarLink }
