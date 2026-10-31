<script setup>
import { ref, computed, watch } from 'vue'
import { filtrarExercicios } from '../utils/buscaExercicio.js'

// Campo de busca do catálogo para o editor da ficha (docs/adr/0027): procura
// no nome e nos apelidos, sem acento. Substitui o <select> com o catálogo
// inteiro. Emite o exercício escolhido e limpa o campo para o próximo.
const props = defineProps({
  catalogo: { type: Array, required: true },
  limite: { type: Number, default: 30 }
})
const emit = defineEmits(['selecionar'])

const termo = ref('')
const aberto = ref(false)
const destaque = ref(0)

const resultados = computed(() => filtrarExercicios(props.catalogo, termo.value).slice(0, props.limite))

watch(termo, () => {
  destaque.value = 0
  aberto.value = true
})

function escolher(resultado) {
  if (!resultado) return
  emit('selecionar', resultado.exercicio)
  termo.value = ''
  aberto.value = false
}

function mover(passo) {
  if (!aberto.value) {
    aberto.value = true
    return
  }
  const total = resultados.value.length
  if (!total) return
  destaque.value = (destaque.value + passo + total) % total
}

function fecharDepois() {
  // Deixa o clique (mousedown) num item chegar antes de fechar.
  setTimeout(() => (aberto.value = false), 120)
}
</script>

<template>
  <div class="busca-exercicio">
    <input
      v-model="termo"
      type="search"
      class="search-input busca-exercicio-input"
      placeholder="Buscar por nome ou apelido (ex.: serrote, tríceps corda)..."
      autocomplete="off"
      role="combobox"
      :aria-expanded="aberto"
      @focus="aberto = true"
      @blur="fecharDepois"
      @keydown.down.prevent="mover(1)"
      @keydown.up.prevent="mover(-1)"
      @keydown.enter.prevent="escolher(resultados[destaque])"
      @keydown.esc="aberto = false"
    />
    <ul v-if="aberto" class="busca-exercicio-lista" role="listbox">
      <li
        v-for="(resultado, indice) in resultados"
        :key="resultado.exercicio.id"
        role="option"
        :aria-selected="indice === destaque"
        :class="{ ativo: indice === destaque }"
        @mousedown.prevent="escolher(resultado)"
        @mouseenter="destaque = indice"
      >
        <span class="busca-exercicio-nome">{{ resultado.exercicio.nome }}</span>
        <span class="list-row-sub">
          <template v-if="resultado.apelido">“{{ resultado.apelido }}” · </template>
          {{ [resultado.exercicio.grupo_muscular, resultado.exercicio.equipamento].filter(Boolean).join(' · ') }}
          <template v-if="resultado.exercicio.equipe_id"> · da equipe</template>
        </span>
      </li>
      <li v-if="!resultados.length" class="busca-exercicio-vazio">
        Nenhum exercício com “{{ termo }}”. Cadastre em Exercícios ou dê um apelido a um existente.
      </li>
    </ul>
  </div>
</template>

<style scoped>
.busca-exercicio { position: relative; }
.busca-exercicio-input { width: 100%; min-width: 0; box-sizing: border-box; }
.busca-exercicio-lista {
  position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 4px);
  max-height: 320px; overflow-y: auto; margin: 0; padding: 4px; list-style: none;
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: var(--radius-md); box-shadow: var(--shadow-lg);
}
.busca-exercicio-lista li {
  display: flex; flex-direction: column; padding: 7px 10px; border-radius: var(--radius-sm); cursor: pointer;
}
.busca-exercicio-lista li.ativo { background: var(--color-primary-light); }
.busca-exercicio-nome { font-size: 13px; color: var(--color-text); }
.busca-exercicio-lista li.busca-exercicio-vazio { cursor: default; font-size: 12px; color: var(--color-text-faint); }
</style>
