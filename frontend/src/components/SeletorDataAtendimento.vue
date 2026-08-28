<script setup>
// docs/adr/0019 - seletor da DATA DO ATENDIMENTO, contextual dentro do
// Registro tipo "atendimento" (mesma ideia do RoteiroDitado da avaliação
// física: painel opcional no composer, não uma etapa antes de iniciar).
// A data é o DIA em que o atendimento aconteceu - separada de quando o relato
// foi gravado/sincronizado/confirmado. Default: hoje; até 7 dias atrás na
// captura (datas mais antigas só pelo desktop).
import { ref } from 'vue'
import { chipsDataAtendimento, rotuloDataAtendimento, ehRetroativo } from '../utils/registroStatus.js'

defineProps({
  modelValue: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue'])

const aberto = ref(false)
const chips = chipsDataAtendimento(8)

function escolher(ymd) {
  emit('update:modelValue', ymd)
  aberto.value = false
}
</script>

<template>
  <div class="seldata">
    <button type="button" class="seldata-cab" :aria-expanded="aberto" @click="aberto = !aberto">
      <span>
        🗓️ Atendimento de: <strong>{{ rotuloDataAtendimento(modelValue) }}</strong>
        <span v-if="ehRetroativo(modelValue)" class="seldata-selo">retroativo</span>
      </span>
      <span class="seldata-caret">{{ aberto ? '▴' : '▾' }}</span>
    </button>
    <div v-if="aberto" class="seldata-corpo">
      <p class="seldata-dica">O dia em que o atendimento aconteceu — não a data de hoje.</p>
      <div class="seldata-chips" role="group" aria-label="Data do atendimento">
        <button
          v-for="chip in chips"
          :key="chip.ymd"
          type="button"
          class="seldata-chip"
          :class="{ ativo: modelValue === chip.ymd }"
          @click="escolher(chip.ymd)"
        >
          {{ chip.rotulo }}
        </button>
      </div>
      <p class="seldata-dica">Mais de 7 dias atrás: ajuste depois no painel.</p>
    </div>
  </div>
</template>

<style scoped>
.seldata {
  flex: none;
  margin: 0 18px 10px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  overflow: hidden;
}
.seldata-cab {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
}
.seldata-cab strong { color: var(--color-text); }
.seldata-selo {
  margin-left: 6px;
  padding: 0 5px;
  border-radius: var(--radius-full);
  background: var(--color-warning-light);
  color: var(--color-warning);
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .03em;
}
.seldata-caret { font-size: 11px; }
.seldata-corpo {
  padding: 4px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.seldata-dica { font-size: 10px; color: var(--color-text-faint); line-height: 1.4; }
.seldata-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.seldata-chip {
  padding: 6px 10px;
  border: 1.5px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
}
.seldata-chip:active { transform: scale(.96); }
.seldata-chip.ativo {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
  color: var(--color-primary-dark);
}
</style>
