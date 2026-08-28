<script setup>
// Campo de data com calendário próprio (o popup nativo de <input type="date">
// não é estilizável e destoa do resto do app - docs/adr/0003, UX sem lib de
// componentes). Clicar em qualquer parte do campo abre o calendário.
// modelValue: "AAAA-MM-DD" (ou ""); min/max: "AAAA-MM-DD" (opcionais).
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  min: { type: String, default: '' },
  max: { type: String, default: '' },
  ariaLabel: { type: String, default: 'Data' }
})
const emit = defineEmits(['update:modelValue'])

const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
]

const raiz = ref(null)
const aberto = ref(false)

function ymd(ano, mes, dia) {
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}
function hojeYmd() {
  const d = new Date()
  return ymd(d.getFullYear(), d.getMonth(), d.getDate())
}
function partes(iso) {
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  return { ano: a, mes: m - 1, dia: d }
}

const rotulo = computed(() => {
  if (!props.modelValue) return 'Selecionar data'
  const { ano, mes, dia } = partes(props.modelValue)
  return `${String(dia).padStart(2, '0')}/${String(mes + 1).padStart(2, '0')}/${ano}`
})

// Mês visível no calendário (0-indexado).
const visivel = ref({ ano: 2000, mes: 0 })
function irParaMesInicial() {
  const alvo = props.modelValue || props.max || hojeYmd()
  const { ano, mes } = partes(alvo)
  visivel.value = { ano, mes }
}
watch(() => [props.modelValue, aberto.value], () => {
  if (aberto.value) irParaMesInicial()
})

const primeiroDoMes = computed(() => new Date(visivel.value.ano, visivel.value.mes, 1).getDay())
const diasNoMes = computed(() => new Date(visivel.value.ano, visivel.value.mes + 1, 0).getDate())

const celulas = computed(() => {
  const out = []
  for (let i = 0; i < primeiroDoMes.value; i += 1) out.push(null)
  for (let d = 1; d <= diasNoMes.value; d += 1) {
    const iso = ymd(visivel.value.ano, visivel.value.mes, d)
    out.push({
      dia: d,
      iso,
      desabilitado: (props.min && iso < props.min) || (props.max && iso > props.max),
      selecionado: iso === props.modelValue,
      hoje: iso === hojeYmd()
    })
  }
  return out
})

const mesAnteriorPermitido = computed(() => {
  if (!props.min) return true
  const primeiroVisivel = ymd(visivel.value.ano, visivel.value.mes, 1)
  return primeiroVisivel > props.min
})
const mesSeguintePermitido = computed(() => {
  if (!props.max) return true
  const ultimoVisivel = ymd(visivel.value.ano, visivel.value.mes, diasNoMes.value)
  return ultimoVisivel < props.max
})

function mudarMes(delta) {
  const d = new Date(visivel.value.ano, visivel.value.mes + delta, 1)
  visivel.value = { ano: d.getFullYear(), mes: d.getMonth() }
}
function escolher(cel) {
  if (!cel || cel.desabilitado) return
  emit('update:modelValue', cel.iso)
  aberto.value = false
}
function alternar() {
  aberto.value = !aberto.value
}

function aoClicarFora(e) {
  if (aberto.value && raiz.value && !raiz.value.contains(e.target)) aberto.value = false
}
function aoTeclar(e) {
  if (e.key === 'Escape') aberto.value = false
}
onMounted(() => {
  document.addEventListener('click', aoClicarFora, true)
  document.addEventListener('keydown', aoTeclar)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', aoClicarFora, true)
  document.removeEventListener('keydown', aoTeclar)
})
</script>

<template>
  <div ref="raiz" class="campo-data">
    <button
      type="button"
      class="campo-data-trigger"
      :class="{ vazio: !modelValue }"
      :aria-label="ariaLabel"
      :aria-expanded="aberto"
      @click="alternar"
    >
      <span>{{ rotulo }}</span>
      <span class="campo-data-icone" aria-hidden="true">🗓️</span>
    </button>

    <div v-if="aberto" class="campo-data-pop" role="dialog" :aria-label="ariaLabel">
      <div class="campo-data-cab">
        <button type="button" class="campo-data-nav" :disabled="!mesAnteriorPermitido" aria-label="Mês anterior" @click="mudarMes(-1)">‹</button>
        <span class="campo-data-mes">{{ MESES[visivel.mes] }} {{ visivel.ano }}</span>
        <button type="button" class="campo-data-nav" :disabled="!mesSeguintePermitido" aria-label="Próximo mês" @click="mudarMes(1)">›</button>
      </div>
      <div class="campo-data-grade campo-data-semana">
        <span v-for="(d, i) in DIAS_SEMANA" :key="i">{{ d }}</span>
      </div>
      <div class="campo-data-grade">
        <template v-for="(cel, i) in celulas" :key="i">
          <span v-if="!cel" class="campo-data-vazia"></span>
          <button
            v-else
            type="button"
            class="campo-data-dia"
            :class="{ selecionado: cel.selecionado, hoje: cel.hoje }"
            :disabled="cel.desabilitado"
            @click="escolher(cel)"
          >
            {{ cel.dia }}
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.campo-data { position: relative; display: inline-block; width: 100%; max-width: 240px; }

.campo-data-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  font-size: 13.5px;
  color: var(--color-text);
}
.campo-data-trigger:hover { border-color: var(--color-primary); }
.campo-data-trigger.vazio { color: var(--color-text-faint); }
.campo-data-icone { font-size: 13px; opacity: .8; }

.campo-data-pop {
  position: absolute;
  z-index: 30;
  top: calc(100% + 6px);
  left: 0;
  width: 260px;
  padding: 10px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
}
.campo-data-cab {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.campo-data-mes { font-size: 13px; font-weight: 700; text-transform: capitalize; }
.campo-data-nav {
  width: 26px; height: 26px;
  border-radius: var(--radius-sm);
  font-size: 15px;
  color: var(--color-text-secondary);
}
.campo-data-nav:hover:not(:disabled) { background: var(--color-surface-alt); color: var(--color-text); }
.campo-data-nav:disabled { opacity: .3; cursor: not-allowed; }

.campo-data-grade {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}
.campo-data-semana {
  margin-bottom: 4px;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--color-text-faint);
  text-align: center;
}
.campo-data-semana span { padding: 2px 0; }
.campo-data-vazia { aspect-ratio: 1; }
.campo-data-dia {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  font-size: 12.5px;
  color: var(--color-text);
}
.campo-data-dia:hover:not(:disabled) { background: var(--color-primary-light); }
.campo-data-dia:disabled { color: var(--color-text-faint); opacity: .4; cursor: not-allowed; }
.campo-data-dia.hoje { box-shadow: inset 0 0 0 1px var(--color-border-strong); }
.campo-data-dia.selecionado {
  background: var(--color-primary);
  color: #fff;
  font-weight: 700;
}
</style>
