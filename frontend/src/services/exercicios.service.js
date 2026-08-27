import http from './http.js'

// Catálogo de exercícios (docs/adr/0013) - globais (equipe_id null) mais os
// próprios da equipe autenticada; a API já resolve essa visibilidade, o
// front só lista o que volta.
async function listar() {
  const { data } = await http.get('/api/v1/exercicios')
  return data.data
}

async function obter(id) {
  const { data } = await http.get(`/api/v1/exercicios/${id}`)
  return data.data
}

async function criar(dados) {
  const { data } = await http.post('/api/v1/exercicios', dados)
  return data.data
}

async function atualizar(id, dados) {
  const { data } = await http.put(`/api/v1/exercicios/${id}`, dados)
  return data.data
}

// Soft-delete - só permitido para exercícios próprios da equipe (a API
// rejeita tentativa de excluir um exercício global).
async function excluir(id) {
  const { data } = await http.delete(`/api/v1/exercicios/${id}`)
  return data.data
}

// Duas imagens por exercício ("inicio" | "fim", posição do movimento).
// Mesmo padrão de aluno/foto - o endpoint exige Authorization, então a
// imagem precisa ser buscada como Blob em vez de ir direto num <img src="...">.
async function obterImagem(id, posicao) {
  const { data } = await http.get(`/api/v1/exercicios/${id}/imagem/${posicao}`, { responseType: 'blob' })
  return data
}

async function enviarImagem(id, posicao, arquivo) {
  const formData = new FormData()
  formData.append('imagem', arquivo)
  const { data } = await http.post(`/api/v1/exercicios/${id}/imagem/${posicao}`, formData)
  return data.data
}

async function removerImagem(id, posicao) {
  const { data } = await http.delete(`/api/v1/exercicios/${id}/imagem/${posicao}`)
  return data.data
}

export default { listar, obter, criar, atualizar, excluir, obterImagem, enviarImagem, removerImagem }
