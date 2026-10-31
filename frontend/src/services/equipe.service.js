import http from './http.js'

async function obter() {
  const { data } = await http.get('/api/v1/equipe')
  return data.data
}

async function atualizarNome(nome) {
  const { data } = await http.put('/api/v1/equipe', { nome })
  return data.data
}

// docs/adr/0030: nome + se há logo - qualquer membro lê (o PDF do
// Acompanhamento Mensal é aberto por quem estiver logado).
async function obterIdentidade() {
  const { data } = await http.get('/api/v1/equipe/identidade')
  return data.data
}

// Mesmo padrão de alunos.service.js::obterFoto - o endpoint exige
// Authorization, então o logo é buscado como Blob.
async function obterLogo() {
  const { data } = await http.get('/api/v1/equipe/logo', { responseType: 'blob' })
  return data
}

async function enviarLogo(blob) {
  const formData = new FormData()
  formData.append('logo', blob, 'logo.png')
  const { data } = await http.post('/api/v1/equipe/logo', formData)
  return data.data
}

async function removerLogo() {
  const { data } = await http.delete('/api/v1/equipe/logo')
  return data.data
}

export default { obter, atualizarNome, obterIdentidade, obterLogo, enviarLogo, removerLogo }
