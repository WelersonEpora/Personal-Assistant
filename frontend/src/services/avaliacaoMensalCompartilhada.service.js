import http from './http.js'

// docs/adr/0023-compartilhar-avaliacao-mensal-com-o-aluno.md: revisão do
// personal (comentário + itens a mostrar) que habilita o PDF da avaliação
// mensal. Não é dado oficial; o comentário entra no próximo ciclo mensal.
const base = (alunoId, anoMes) => `/api/v1/alunos/${alunoId}/avaliacoes-mensais/${anoMes}/compartilhamento`

// { revisao, desatualizada } - revisao pode ser null.
async function obter(alunoId, anoMes) {
  const { data } = await http.get(base(alunoId, anoMes))
  return data.data
}

async function salvar(alunoId, anoMes, { comentario, itensExcluidos }) {
  const { data } = await http.put(base(alunoId, anoMes), {
    comentario,
    itens_excluidos: itensExcluidos || []
  })
  return data.data
}

async function excluir(alunoId, anoMes) {
  const { data } = await http.delete(base(alunoId, anoMes))
  return data.data
}

export default { obter, salvar, excluir }
