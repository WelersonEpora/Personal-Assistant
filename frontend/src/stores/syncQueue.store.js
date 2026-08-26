import { defineStore } from 'pinia'
import registrosService from '../services/registros.service.js'
import { listarRegistrosLocais, salvarRegistroLocal, removerRegistroLocal, obterAudioLocal } from '../offline/db.js'

const INTERVALO_VERIFICACAO_MS = 15000

// audioBlob (Blob em memória) e audioUrl (object URL, só válida na aba atual)
// nunca podem ir para o IndexedDB - persistência incremental (docs/adr/0012)
// grava a cada entrada capturada, então essa limpeza precisa acontecer aqui,
// centralizada, em vez de em cada call site da CapturaView.
function semCamposEfemeros(registroLocal) {
  return {
    ...registroLocal,
    entradas: registroLocal.entradas.map(({ audioBlob: _audioBlob, audioUrl: _audioUrl, ...resto }) => resto)
  }
}

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
    // 'em_andamento' é rascunho (ainda sendo editado pelo personal, ver
    // docs/adr/0012), nunca fila de sincronização - não deve contar como
    // "pendente" no banner de status.
    pendentes: (state) => state.registrosLocais.filter((r) => r.status !== 'sincronizando' && r.status !== 'em_andamento'),
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

    // Chamado tanto para criar um Registro 'em_andamento' quanto para toda
    // atualização incremental (a cada entrada capturada) e para a
    // finalização (docs/adr/0012) - só grava local; disparar a sincronização
    // é responsabilidade explícita de quem chama (ver CapturaView) para
    // nunca esconder uma Promise não aguardada dentro desta action - evita
    // corrida entre uma tentativa de sincronização "solta" e uma chamada
    // explícita a processarFila().
    //
    // Não faz um `carregar()` (reload completo do IndexedDB) depois de
    // salvar: quando `registroLocal` já é o objeto reativo vindo de dentro
    // de `registrosLocais` (o caso comum - todo Registro 'em_andamento' é
    // mutado in-place por quem chama antes de persistir), a UI já reage à
    // mutação direta, e um reload aqui destruiria campos efêmeros em
    // memória de QUALQUER Registro em edição (ex.: audioUrl de reprodução
    // de um áudio, só reconstruível a partir do IndexedDB), não só do que
    // está sendo salvo agora. Só quando `registroLocal` ainda não existe em
    // `registrosLocais` (Registro novo) é que precisa entrar na lista.
    async salvarLocal(registroLocal) {
      await salvarRegistroLocal(semCamposEfemeros(registroLocal))
      if (!this.registrosLocais.includes(registroLocal)) {
        this.registrosLocais.unshift(registroLocal)
      }
    },

    // Descarta um Registro (finalizado nunca chega aqui - só 'em_andamento',
    // ver CapturaView) - remove do IndexedDB e da lista reativa.
    async descartarRegistroLocal(id) {
      await removerRegistroLocal(id)
      const indice = this.registrosLocais.findIndex((r) => r.id === id)
      if (indice !== -1) this.registrosLocais.splice(indice, 1)
    },

    async processarFila() {
      if (this.processando || !this.online) return
      this.processando = true
      try {
        // 'em_andamento' nunca cai aqui - só os dois status abaixo entram
        // na fila (docs/adr/0012).
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
