import http from './http.js'

// docs/adr/0020 - relatório de atividade por período (tela Atendimentos).
// Somente leitura, escopado pela equipe do token. Uma requisição por
// combinação de filtros. Params: de, ate ("AAAA-MM-DD"), aluno_id, tipo
// ("atendimento" | "avaliacao_fisica"), somente_confirmados (bool).
async function obter({ de, ate, alunoId, tipo, somenteConfirmados } = {}) {
  const params = {}
  if (de) params.de = de
  if (ate) params.ate = ate
  if (alunoId) params.aluno_id = alunoId
  if (tipo) params.tipo = tipo
  if (somenteConfirmados) params.somente_confirmados = 'true'
  const { data } = await http.get('/api/v1/atividades', { params })
  return data.data
}

export default { obter }
