import http from './http.js'

// Ficha de Treino (docs/adr/0013) - prescrição montada manualmente pelo
// personal a partir do catálogo, sem IA. Cada "salvar" cria uma nova versão
// (nunca sobrescreve a ficha anterior) - não existe endpoint de edição.
async function listarPorAluno(alunoId) {
  const { data } = await http.get(`/api/v1/alunos/${alunoId}/fichas-treino`)
  return data.data
}

async function obterAtiva(alunoId) {
  const { data } = await http.get(`/api/v1/alunos/${alunoId}/fichas-treino/ativa`)
  return data.data
}

async function obter(fichaId) {
  const { data } = await http.get(`/api/v1/fichas-treino/${fichaId}`)
  return data.data
}

async function criarNovaVersao(alunoId, { nome, observacoes, itens }) {
  const { data } = await http.post(`/api/v1/alunos/${alunoId}/fichas-treino`, { nome, observacoes, itens })
  return data.data
}

export default { listarPorAluno, obterAtiva, obter, criarNovaVersao }
