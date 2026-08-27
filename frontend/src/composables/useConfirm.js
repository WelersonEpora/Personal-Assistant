import { reactive } from 'vue'

// Diálogos in-app (o produto não usa telas nativas do navegador). Singleton
// reativo: um único host (ConfirmDialog.vue, montado no AdminShell) renderiza
// o estado.
//   - confirmar() -> Promise<boolean> (dois botões)
//   - avisar()    -> Promise<void>    (um botão "OK", fica até o usuário fechar)
const estado = reactive({
  aberto: false,
  modo: 'confirmar', // 'confirmar' | 'aviso'
  titulo: 'Confirmar',
  mensagem: '',
  confirmarLabel: 'Confirmar',
  cancelarLabel: 'Cancelar',
  perigo: false
})

let resolver = null

function fechar(valor) {
  estado.aberto = false
  if (resolver) {
    resolver(valor)
    resolver = null
  }
}

function confirmar(opcoes = {}) {
  // Uma pendência anterior (troca de rota no meio, etc.) resolve como "não"
  // antes de abrir a nova.
  if (resolver) fechar(false)

  estado.modo = 'confirmar'
  estado.titulo = opcoes.titulo || 'Confirmar'
  estado.mensagem = opcoes.mensagem || ''
  estado.perigo = !!opcoes.perigo
  estado.confirmarLabel = opcoes.confirmarLabel || (opcoes.perigo ? 'Excluir' : 'Confirmar')
  estado.cancelarLabel = opcoes.cancelarLabel || 'Cancelar'
  estado.aberto = true

  return new Promise((resolve) => {
    resolver = resolve
  })
}

function avisar(opcoes = {}) {
  if (resolver) fechar()

  estado.modo = 'aviso'
  estado.titulo = opcoes.titulo || 'Aviso'
  estado.mensagem = opcoes.mensagem || ''
  estado.perigo = !!opcoes.perigo
  estado.confirmarLabel = opcoes.confirmarLabel || 'OK'
  estado.aberto = true

  // Resolve como void - tanto o botão quanto o Esc apenas fecham.
  return new Promise((resolve) => {
    resolver = () => resolve()
  })
}

export function useConfirm() {
  return {
    estado,
    confirmar,
    avisar,
    aceitar: () => fechar(true),
    recusar: () => fechar(false)
  }
}
