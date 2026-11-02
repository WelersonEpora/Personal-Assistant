<script setup>
import { ref, nextTick } from 'vue'

// Trecho do documento do Acompanhamento Mensal que o personal pode ajustar
// antes do PDF (adendo 2026-11-02 da docs/adr/0023). Em tela: lápis ao passar
// o mouse (sempre visível no toque) e selo "ajustado"; no print, só o texto.
// Quem decide o que é "ajustado" e guarda o texto é o pai.
const props = defineProps({
  texto: { type: String, default: '' },
  editado: { type: Boolean, default: false },
  linhas: { type: Number, default: 3 }
})
const emit = defineEmits(['alterar', 'restaurar'])

const editando = ref(false)
const rascunho = ref('')
const campo = ref(null)

async function abrir() {
  rascunho.value = props.texto
  editando.value = true
  await nextTick()
  campo.value?.focus()
}
function ok() {
  if (!rascunho.value.trim()) return
  emit('alterar', rascunho.value)
  editando.value = false
}
function cancelar() {
  editando.value = false
}
function restaurar() {
  emit('restaurar')
  editando.value = false
}
</script>

<template>
  <div v-if="editando" class="trecho-edicao">
    <textarea
      ref="campo"
      v-model="rascunho"
      :rows="linhas"
      maxlength="5000"
      @keydown.esc.prevent="cancelar"
      @keydown.ctrl.enter.prevent="ok"
    ></textarea>
    <div class="trecho-acoes">
      <button type="button" class="btn btn-primary btn-sm" :disabled="!rascunho.trim()" @click="ok">OK</button>
      <button type="button" class="btn btn-ghost btn-sm" @click="cancelar">Cancelar</button>
      <button v-if="editado" type="button" class="btn btn-ghost btn-sm trecho-restaurar" @click="restaurar">Restaurar o da IA</button>
    </div>
  </div>
  <div v-else class="trecho" :class="{ 'trecho-editado': editado }">
    <slot>{{ texto }}</slot>
    <span v-if="editado" class="trecho-selo">ajustado</span>
    <button type="button" class="trecho-lapis" title="Ajustar este texto" aria-label="Ajustar este texto" @click="abrir">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
    </button>
  </div>
</template>

<style scoped>
.trecho {
  position: relative;
  border-radius: 4px;
  transition: background 0.12s;
}
.trecho:hover {
  background: #f4f4f5;
}
.trecho-editado {
  box-shadow: inset 2px 0 0 #a78bfa;
  padding-left: 6px;
}
.trecho-selo {
  display: inline-block;
  margin-left: 6px;
  padding: 0 7px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  line-height: 17px;
  border-radius: 999px;
  background: #ede9fe;
  color: #6d28d9;
  vertical-align: middle;
}
.trecho-lapis {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-left: 4px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #71717a;
  cursor: pointer;
  vertical-align: middle;
  opacity: 0;
  transition: opacity 0.12s;
}
.trecho:hover .trecho-lapis,
.trecho-lapis:focus-visible {
  opacity: 1;
}
.trecho-lapis:hover {
  background: #e4e4e7;
  color: #18181b;
}
.trecho-lapis svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
@media (hover: none) {
  .trecho-lapis {
    opacity: 1;
  }
}
.trecho-edicao {
  margin: 4px 0;
}
.trecho-edicao textarea {
  width: 100%;
  font: inherit;
  line-height: 1.55;
}
.trecho-acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.trecho-restaurar {
  margin-left: auto;
}

@media print {
  .trecho,
  .trecho:hover {
    background: none;
  }
  .trecho-editado {
    box-shadow: none;
    padding-left: 0;
  }
  .trecho-selo,
  .trecho-lapis {
    display: none !important;
  }
}
</style>
