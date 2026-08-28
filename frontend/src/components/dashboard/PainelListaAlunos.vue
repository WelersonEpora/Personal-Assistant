<script setup>
import { computed } from 'vue'
import { corParaId, iniciais } from '../../utils/registroStatus.js'

// Card do painel (docs/adr/0017): título + até N alunos + "ver todos". Cada
// linha leva à tela do aluno (opcionalmente numa aba específica).
const props = defineProps({
  titulo: { type: String, required: true },
  icone: { type: String, default: '' },
  itens: { type: Array, default: () => [] },
  total: { type: Number, default: 0 },
  // (aluno) => string — texto auxiliar por linha (ex.: "há 34 dias").
  sub: { type: Function, default: null },
  // aba de AlunoDetalheView para abrir ao clicar (ex.: 'ficha', 'avaliacoes').
  aba: { type: String, default: '' },
  vazio: { type: String, default: 'Nada por aqui.' }
})

const restantes = computed(() => Math.max(0, props.total - props.itens.length))

function rota(aluno) {
  return {
    name: 'admin-aluno-detalhe',
    params: { id: aluno.id },
    query: props.aba ? { aba: props.aba } : {}
  }
}
</script>

<template>
  <div class="card painel-lista">
    <div class="card-header">
      <h3><span v-if="icone" class="painel-lista-icone">{{ icone }}</span>{{ titulo }}</h3>
      <span v-if="total" class="badge badge-neutral">{{ total }}</span>
    </div>

    <div v-if="!total" class="painel-lista-vazio">{{ vazio }}</div>

    <router-link
      v-for="aluno in itens"
      :key="aluno.id"
      class="list-row row-clickable"
      :to="rota(aluno)"
    >
      <span class="avatar sz-sm" :style="{ background: corParaId(aluno.id) }">{{ iniciais(aluno.nome) }}</span>
      <span class="list-row-body">
        <span class="list-row-title">{{ aluno.nome }}</span>
        <span v-if="sub && sub(aluno)" class="list-row-sub">{{ sub(aluno) }}</span>
      </span>
    </router-link>

    <div v-if="restantes" class="painel-lista-mais">+{{ restantes }} aluno(s)</div>
  </div>
</template>

<style scoped>
.painel-lista .card-header h3 { display: flex; align-items: center; gap: 7px; }
.painel-lista-icone { font-size: 15px; }
.painel-lista .list-row { text-decoration: none; color: inherit; }
.painel-lista .list-row-body { display: flex; flex-direction: column; }
.painel-lista-vazio,
.painel-lista-mais {
  padding: 13px 20px;
  font-size: 12.5px;
  color: var(--color-text-faint);
}
.painel-lista-mais { border-top: 1px solid var(--color-border); }
</style>
