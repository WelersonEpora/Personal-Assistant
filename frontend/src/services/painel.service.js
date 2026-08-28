import http from './http.js'

// Resumo agregado do dashboard do /admin (docs/adr/0017). Uma requisição, já
// escopada pela equipe do token - substitui o cálculo client-side que baixava
// a lista inteira de relatos.
async function obter() {
  const { data } = await http.get('/api/v1/painel')
  return data.data
}

export default { obter }
