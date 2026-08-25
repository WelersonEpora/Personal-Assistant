import http from './http.js'

async function login(email, senha) {
  const { data } = await http.post('/api/v1/auth/login', { email, senha })
  return data.data // { token, usuario }
}

export default { login }
