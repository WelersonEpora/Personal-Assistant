<script setup>
// Seletor de período reutilizável (Atendimentos - docs/adr/0020 - e filtro do
// Histórico). Presets + intervalo personalizado (CampoData). Emite `change`
// com { de, ate } ("AAAA-MM-DD", ou null/null em "Tudo") na montagem e a cada
// escolha válida.
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { PRESETS_PERIODO, resolverPeriodo, periodoPronto } from '../utils/periodos.js'
import CampoData from './CampoData.vue'
import FiltroSegmentado from './FiltroSegmentado.vue'

const props = defineProps({
  // chaves de PRESETS_PERIODO a exibir, na ordem dada
  presets: { type: Array, default: () => PRESETS_PERIODO.map((p) => p.chave) },
  inicial: { type: String, default: 'mes_atual' }
})
const emit = defineEmits(['change'])

const preset = ref(props.presets.includes(props.inicial) ? props.inicial : props.presets[0])
const custom = reactive({ de: '', ate: new Date().toISOString().slice(0, 10) })

const opcoes = computed(() =>
  props.presets
    .map((chave) => PRESETS_PERIODO.find((p) => p.chave === chave))
    .filter(Boolean)
    .map((p) => ({ valor: p.chave, rotulo: p.rotulo }))
)

function emitir() {
  if (!periodoPronto(preset.value, custom)) return
  emit('change', resolverPeriodo(preset.value, custom))
}

watch([preset, () => custom.de, () => custom.ate], emitir)
onMounted(emitir)
</script>

<template>
  <div class="seletor-periodo">
    <FiltroSegmentado v-model="preset" :opcoes="opcoes" rotulo="Período" />

    <div v-if="preset === 'personalizado'" class="seletor-periodo-datas">
      <div class="field-group">
        <label>De</label>
        <CampoData v-model="custom.de" :max="custom.ate || undefined" aria-label="Data inicial" />
      </div>
      <div class="field-group">
        <label>Até</label>
        <CampoData v-model="custom.ate" :min="custom.de || undefined" aria-label="Data final" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.seletor-periodo { display: flex; flex-direction: column; gap: 12px; }
.seletor-periodo-datas { display: flex; gap: 14px; flex-wrap: wrap; }
.seletor-periodo-datas .field-group { min-width: 160px; }
</style>
