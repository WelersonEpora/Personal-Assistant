<script setup>
// Filtro de opção (docs/adr/0020 - adendo UI 2026-09-02). No desktop, uma régua
// de chips (.filter-tab) com todas as opções visíveis - um clique. No mobile
// (<= 760px, breakpoint do /admin) as chips ocupavam muito espaço e confundiam:
// viram um único botão com o estilo do chip ativo + chevron, que abre a lista
// (mesmo padrão do menu "⋯" de AlunoDetalheView).
//
// `multiple`: seleção múltipla (modelValue é array de valores; vazio = "todos").
// Renderiza uma opção "Todos" à frente que limpa a seleção. Usado por
// RegistrosView (status), SeletorPeriodo (presets), ExerciciosView (origem) e
// RadarView (assunto, multiple).
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number, Array], default: '' },
  // [{ valor, rotulo }] - na ordem em que devem aparecer
  opcoes: { type: Array, required: true },
  // dimensão do filtro: vira aria-label e prefixo do botão no mobile ("Status: …")
  rotulo: { type: String, default: '' },
  multiple: { type: Boolean, default: false },
  // rótulo da opção que limpa a seleção (só em multiple)
  rotuloTodos: { type: String, default: 'Todos' }
})
const emit = defineEmits(['update:modelValue'])

const aberto = ref(false)
const raiz = ref(null)

const selecionados = computed(() => (Array.isArray(props.modelValue) ? props.modelValue : []))
const nenhumSelecionado = computed(() => props.multiple && selecionados.value.length === 0)

function ativo(valor) {
  return props.multiple ? selecionados.value.includes(valor) : props.modelValue === valor
}

// Texto do botão no mobile.
const rotuloAtivo = computed(() => {
  if (props.multiple) {
    if (selecionados.value.length === 0) return props.rotuloTodos
    if (selecionados.value.length === 1) {
      const o = props.opcoes.find((x) => x.valor === selecionados.value[0])
      return o ? o.rotulo : '1 selecionado'
    }
    return `${selecionados.value.length} selecionados`
  }
  const atual = props.opcoes.find((o) => o.valor === props.modelValue)
  return atual ? atual.rotulo : (props.opcoes[0]?.rotulo ?? '')
})

function selecionar(valor) {
  if (props.multiple) {
    const nova = selecionados.value.includes(valor)
      ? selecionados.value.filter((v) => v !== valor)
      : [...selecionados.value, valor]
    emit('update:modelValue', nova)
    return // menu segue aberto - dá pra marcar vários
  }
  aberto.value = false
  if (valor !== props.modelValue) emit('update:modelValue', valor)
}

function limparSelecao() {
  aberto.value = false
  emit('update:modelValue', [])
}

// Fecha ao clicar fora / Escape - mesmo padrão de AlunoDetalheView.
function aoClicarFora(e) {
  if (raiz.value && !raiz.value.contains(e.target)) aberto.value = false
}
function aoTeclar(e) {
  if (e.key === 'Escape') aberto.value = false
}
onMounted(() => {
  window.addEventListener('click', aoClicarFora)
  window.addEventListener('keydown', aoTeclar)
})
onBeforeUnmount(() => {
  window.removeEventListener('click', aoClicarFora)
  window.removeEventListener('keydown', aoTeclar)
})
</script>

<template>
  <div ref="raiz" class="filtro-segmentado">
    <!-- desktop: régua de chips -->
    <div class="filter-tabs fs-chips" role="group" :aria-label="rotulo || undefined">
      <button
        v-if="multiple"
        type="button"
        class="filter-tab"
        :class="{ active: nenhumSelecionado }"
        :aria-pressed="nenhumSelecionado"
        @click="limparSelecao"
      >
        {{ rotuloTodos }}
      </button>
      <button
        v-for="opcao in opcoes"
        :key="opcao.valor"
        type="button"
        class="filter-tab"
        :class="{ active: ativo(opcao.valor) }"
        :aria-pressed="ativo(opcao.valor)"
        @click="selecionar(opcao.valor)"
      >
        {{ opcao.rotulo }}
      </button>
    </div>

    <!-- mobile: botão único + lista -->
    <div class="fs-menu">
      <button
        type="button"
        class="filter-tab fs-trigger"
        :class="{ active: !multiple || selecionados.length > 0 }"
        :aria-expanded="aberto"
        aria-haspopup="true"
        :aria-label="rotulo ? `${rotulo}: ${rotuloAtivo}` : rotuloAtivo"
        @click="aberto = !aberto"
      >
        <span class="fs-trigger-texto">
          <span v-if="rotulo" class="fs-trigger-prefixo">{{ rotulo }}:</span>
          {{ rotuloAtivo }}
        </span>
        <span class="fs-chevron" :class="{ aberto }" aria-hidden="true">▾</span>
      </button>
      <div v-if="aberto" class="fs-lista" role="menu">
        <button
          v-if="multiple"
          type="button"
          role="menuitemradio"
          :aria-checked="nenhumSelecionado"
          class="fs-opcao"
          :class="{ active: nenhumSelecionado }"
          @click="limparSelecao"
        >
          <span class="fs-check" aria-hidden="true">{{ nenhumSelecionado ? '✓' : '' }}</span>
          {{ rotuloTodos }}
        </button>
        <button
          v-for="opcao in opcoes"
          :key="opcao.valor"
          type="button"
          :role="multiple ? 'menuitemcheckbox' : 'menuitemradio'"
          :aria-checked="ativo(opcao.valor)"
          class="fs-opcao"
          :class="{ active: ativo(opcao.valor) }"
          @click="selecionar(opcao.valor)"
        >
          <span v-if="multiple" class="fs-check" aria-hidden="true">{{ ativo(opcao.valor) ? '✓' : '' }}</span>
          {{ opcao.rotulo }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filtro-segmentado { position: relative; }

/* desktop: chips visíveis, botão escondido */
.fs-menu { display: none; }

.fs-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
}
.fs-trigger-texto { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fs-trigger-prefixo { opacity: .75; font-weight: 600; margin-right: 3px; }
.fs-chevron { font-size: 10px; transition: transform .15s ease; }
.fs-chevron.aberto { transform: rotate(180deg); }

.fs-lista {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  min-width: 200px;
  max-width: min(280px, 88vw);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  padding: 6px;
  display: flex;
  flex-direction: column;
}
.fs-opcao {
  display: flex;
  align-items: center;
  text-align: left;
  padding: 9px 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  border-radius: var(--radius-sm);
}
.fs-opcao:hover { background: var(--color-surface-alt); }
.fs-opcao.active { color: var(--color-primary); }
.fs-check { display: inline-block; width: 15px; flex: none; }

@media (max-width: 760px) {
  .fs-chips { display: none; }
  .fs-menu { display: block; }
}
</style>
