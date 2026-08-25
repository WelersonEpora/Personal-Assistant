import { ref } from 'vue'

let proximoId = 1

// Toast stack simples, compartilhado entre os modos captura e admin (mesmo
// padrão visual do protótipo, ver assets/tokens.css .toast-stack/.toast).
export function useToasts() {
  const toasts = ref([])

  function showToast(message, kind = 'neutral') {
    const id = proximoId++
    toasts.value.push({ id, message, kind, saindo: false })
    setTimeout(() => {
      const item = toasts.value.find((t) => t.id === id)
      if (item) item.saindo = true
      setTimeout(() => {
        toasts.value = toasts.value.filter((t) => t.id !== id)
      }, 200)
    }, 2600)
  }

  return { toasts, showToast }
}
