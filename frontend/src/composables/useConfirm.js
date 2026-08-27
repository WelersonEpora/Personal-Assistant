import { reactive } from 'vue'

// Diálogo de confirmação in-app (substitui window.confirm - o produto não usa
// telas nativas do navegador). Singleton reativo: um único host
// (ConfirmDialog.vue, montado no AdminShell) renderiza o estado; qualquer tela
// chama `confirmar()` e recebe uma Promise<boolean>.
const estado = reactive({
  aberto: false,
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
  // Uma confirmação pendente anterior (troca de rota no meio, etc.) resolve
  // como "não" antes de abrir a nova.
  if (resolver) fechar(false)

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

export function useConfirm() {
  return {
    estado,
    confirmar,
    aceitar: () => fechar(true),
    recusar: () => fechar(false)
  }
}
