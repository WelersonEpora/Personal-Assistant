import axios from 'axios'

// docs/adr/0014-acesso-aluno-ficha-por-link.md: consulta pública da ficha
// pelo token. Instância de axios PRÓPRIA (não o http.js compartilhado) - a
// tela do aluno não tem sessão, não manda Authorization e não deve ser
// redirecionada para /login por nenhum interceptor.
const publicHttp = axios.create({
  baseURL: import.meta.env?.VITE_API_BASE_URL || '',
  timeout: 20000
})

async function obterFicha(token) {
  const { data } = await publicHttp.get(`/api/v1/ficha-publica/${encodeURIComponent(token)}`)
  return data.data
}

// URL direta da imagem do exercício, escopada pelo token (o backend só serve
// se o exercício está na ficha ativa daquele aluno).
function urlImagem(token, exercicioId, posicao) {
  const base = import.meta.env?.VITE_API_BASE_URL || ''
  return `${base}/api/v1/ficha-publica/${encodeURIComponent(token)}/exercicios/${exercicioId}/imagem/${posicao}`
}

async function obterImagem(token, exercicioId, posicao) {
  const { data } = await publicHttp.get(urlImagem(token, exercicioId, posicao), { responseType: 'blob' })
  return data
}

export default { obterFicha, urlImagem, obterImagem }
