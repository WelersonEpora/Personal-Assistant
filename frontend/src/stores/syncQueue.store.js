import { defineStore } from 'pinia'
import registrosService from '../services/registros.service.js'
import { listarRegistrosLocais, salvarRegistroLocal, removerRegistroLocal, obterAudioLocal } from '../offline/db.js'

const INTERVALO_VERIFICACAO_MS = 15000

// docs/adr/0005-estrategia-sincronizacao.md: fila própria baseada no status
// local de cada Registro, sem depender de Background Sync do navegador.
// Um Registro por vez, sequencial; retry por reverificação periódica (backoff
// simples o bastante para o MVP) em vez de uma fila de dead-letter dedicada.
export const useSyncQueueStore = defineStore('syncQueue', {
  state: () => ({
    registrosLocais: [],
    processando: false,
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    iniciado: false
  }),
  getters: {
    pendentes: (state) => state.registrosLocais.filter((r) => r.status !== 'sincronizando'),
    quantidadePendente: (state) => state.registrosLocais.length
  },
  actions: {
    async carregar() {
      this.registrosLocais = await listarRegistrosLocais()
    },

    iniciarMotor() {
      if (this.iniciado || typeof window === 'undefined') return
      this.iniciado = true
      window.addEventListener('online', () => {
        this.online = true
        this.processarFila()
      })
      window.addEventListener('offline', () => {
        this.online = false
      })
      setInterval(() => this.processarFila(), INTERVALO_VERIFICACAO_MS)
      this.carregar().then(() => this.processarFila())
    },

    // Chamado ao finalizar um Registro no composer (offline ou online) -
    // só grava local; disparar a sincronização é responsabilidade explícita
    // de quem chama (ver CapturaView) para nunca esconder uma Promise não
    // aguardada dentro desta action - evita corrida entre uma tentativa de
    // sincronização "solta" e uma chamada explícita a processarFila().
    async registrarFinalizado(registroLocal) {
      await salvarRegistroLocal(registroLocal)
      await this.carregar()
    },

    async processarFila() {
      if (this.processando || !this.online) return
      this.processando = true
      try {
        const pendentes = this.registrosLocais.filter((r) => r.status === 'pendente_sincronizacao' || r.status === 'erro_sincronizacao')
        for (const registroLocal of pendentes) {
          await this.sincronizarUm(registroLocal)
        }
      } finally {
        this.processando = false
      }
    },

    async sincronizarUm(registroLocal) {
      registroLocal.status = 'sincronizando'
      await salvarRegistroLocal(registroLocal)
      await this.carregar()

      try {
        const entradas = await Promise.all(
          registroLocal.entradas.map(async (entrada) => {
            if (entrada.tipo !== 'audio') return entrada
            const audioBlob = await obterAudioLocal(registroLocal.id, entrada.ordem)
            return { ...entrada, audioBlob }
          })
        )
        await registrosService.sincronizar({ ...registroLocal, entradas })
        await removerRegistroLocal(registroLocal.id)
      } catch (_err) {
        registroLocal.status = 'erro_sincronizacao'
        await salvarRegistroLocal(registroLocal)
      }
      await this.carregar()
    }
  }
})
