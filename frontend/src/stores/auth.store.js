import { defineStore } from 'pinia'
import authService from '../services/auth.service.js'
import { TOKEN_STORAGE_KEY } from '../services/http.js'

const USUARIO_STORAGE_KEY = 'personal_assistant_usuario'

function usuarioSalvo() {
  try {
    const bruto = localStorage.getItem(USUARIO_STORAGE_KEY)
    return bruto ? JSON.parse(bruto) : null
  } catch (_err) {
    return null
  }
}

// Sessão compartilhada entre os dois modos (/captura e /admin) - motivo
// pelo qual este projeto já nasce com Pinia, diferente da decisão inicial
// do AgroMind (ver docs/adr/0003-frontend-unico-pwa.md).
export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem(TOKEN_STORAGE_KEY) || null,
    usuario: usuarioSalvo()
  }),
  getters: {
    autenticado: (state) => Boolean(state.token)
  },
  actions: {
    async login(email, senha) {
      const { token, usuario } = await authService.login(email, senha)
      this.token = token
      this.usuario = usuario
      localStorage.setItem(TOKEN_STORAGE_KEY, token)
      localStorage.setItem(USUARIO_STORAGE_KEY, JSON.stringify(usuario))
    },
    logout() {
      this.token = null
      this.usuario = null
      localStorage.removeItem(TOKEN_STORAGE_KEY)
      localStorage.removeItem(USUARIO_STORAGE_KEY)
    },
    // Usado depois que o próprio usuário logado tem a foto atualizada via
    // EquipeView (o token/localStorage não se atualiza sozinho até o
    // próximo login) - mantém a sessão em memória em dia sem precisar
    // deslogar/logar de novo.
    atualizarUsuario(patch) {
      if (!this.usuario) return
      this.usuario = { ...this.usuario, ...patch }
      localStorage.setItem(USUARIO_STORAGE_KEY, JSON.stringify(this.usuario))
    }
  }
})
