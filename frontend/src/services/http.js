import axios from 'axios'

const TIMEOUT_PADRAO_MS = 20000
export const TOKEN_STORAGE_KEY = 'personal_assistant_token'

const http = axios.create({
  baseURL: import.meta.env?.VITE_API_BASE_URL || '',
  timeout: TIMEOUT_PADRAO_MS
})

// Token lido direto do localStorage (não do Pinia store) para evitar
// dependência circular entre http.js e stores/auth.store.js - as duas
// pontas (login/logout no store, leitura aqui) usam a mesma chave.
http.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_STORAGE_KEY)
      if (!location.pathname.startsWith('/login')) {
        location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default http
