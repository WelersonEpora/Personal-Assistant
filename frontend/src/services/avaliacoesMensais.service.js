import http from './http.js'

// Acompanhamento Individual Mensal (docs/adr/0015) - avaliação da IA sobre a
// evolução do aluno no mês, gerada a partir dos relatos confirmados + do
// contexto consolidado do mês anterior. Nunca é dado oficial: não há tela de
// validação; para corrigir, o personal registra um novo relato.
async function listarPorAluno(alunoId) {
  const { data } = await http.get(`/api/v1/alunos/${alunoId}/avaliacoes-mensais`)
  return data.data
}

async function obter(alunoId, anoMes) {
  const { data } = await http.get(`/api/v1/alunos/${alunoId}/avaliacoes-mensais/${anoMes}`)
  return data.data
}

// Gera ou regenera (sobrescreve) a avaliação do mês. `anoMes` no formato
// "YYYY-MM".
async function gerar(alunoId, anoMes) {
  const { data } = await http.post(`/api/v1/alunos/${alunoId}/avaliacoes-mensais/${anoMes}/gerar`, {})
  return data.data
}

export default { listarPorAluno, obter, gerar }
