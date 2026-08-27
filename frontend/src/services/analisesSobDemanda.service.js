import http from './http.js'

// Análise sob demanda (docs/adr/0015) - leitura pontual da IA a pedido do
// personal, no máximo 1 gerada a cada 7 dias por aluno. Não substitui o
// acompanhamento mensal nem altera o contexto consolidado do ciclo mensal.
// `listar` devolve { analises, disponibilidade } - a disponibilidade diz
// quando a próxima análise estará liberada.
async function listar(alunoId) {
  const { data } = await http.get(`/api/v1/alunos/${alunoId}/analises-sob-demanda`)
  return { analises: data.data, disponibilidade: data.meta?.disponibilidade || null }
}

async function solicitar(alunoId) {
  const { data } = await http.post(`/api/v1/alunos/${alunoId}/analises-sob-demanda`, {})
  return data.data
}

export default { listar, solicitar }
