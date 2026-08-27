<script setup>
// Host único do diálogo de confirmação (ver composables/useConfirm.js).
// Montado uma vez no AdminShell. Esc / clique no fundo = recusar.
import { watch, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { useConfirm } from '../composables/useConfirm.js'

const { estado, aceitar, recusar } = useConfirm()
const route = useRoute()

// Troca de rota com o diálogo aberto = cancelar (a tela que pediu já saiu).
watch(() => route.fullPath, () => {
  if (estado.aberto) recusar()
})

function onKeydown(evento) {
  if (!estado.aberto) return
  if (evento.key === 'Escape') recusar()
  else if (evento.key === 'Enter') aceitar()
}

watch(
  () => estado.aberto,
  (aberto) => {
    if (aberto) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  }
)
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="estado.aberto"
      class="confirm-overlay"
      @click.self="recusar"
    >
      <div class="card confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-titulo">
        <h3 id="confirm-titulo" class="confirm-titulo">{{ estado.titulo }}</h3>
        <p v-if="estado.mensagem" class="confirm-msg">{{ estado.mensagem }}</p>
        <div class="confirm-acoes">
          <button v-if="estado.modo !== 'aviso'" type="button" class="btn btn-ghost" @click="recusar">{{ estado.cancelarLabel }}</button>
          <button
            type="button"
            class="btn"
            :class="estado.perigo && estado.modo !== 'aviso' ? 'btn-danger' : 'btn-primary'"
            @click="aceitar"
          >
            {{ estado.confirmarLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 17, 25, 0.42);
}
.confirm-card {
  width: 100%;
  max-width: 420px;
  padding: 22px 22px 18px;
}
.confirm-titulo {
  font-size: 16px;
  margin: 0 0 8px;
}
.confirm-msg {
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 40vh;
  overflow-y: auto;
}
.confirm-acoes {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}
</style>
