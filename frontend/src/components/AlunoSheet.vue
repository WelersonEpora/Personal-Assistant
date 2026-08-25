<script setup>
import { corParaId, iniciais } from '../utils/registroStatus.js'

const props = defineProps({
  aberto: { type: Boolean, required: true },
  alunos: { type: Array, required: true },
  alunoAtualId: { type: String, default: null }
})
const emit = defineEmits(['fechar', 'selecionar'])

function selecionar(id) {
  emit('selecionar', id)
}
</script>

<template>
  <div class="sheet-overlay" :class="{ open: aberto }" @click.self="emit('fechar')">
    <div class="sheet">
      <p class="sheet-title">Selecionar aluno</p>
      <button
        v-for="aluno in props.alunos"
        :key="aluno.id"
        class="sheet-student"
        :class="{ 'is-current': aluno.id === props.alunoAtualId }"
        type="button"
        @click="selecionar(aluno.id)"
      >
        <span class="avatar" :style="{ background: corParaId(aluno.id) }">{{ iniciais(aluno.nome) }}</span>
        <span>
          <span class="sheet-student-name">{{ aluno.nome }}</span>
          <span v-if="aluno.observacoes" class="sheet-student-sub">{{ aluno.observacoes }}</span>
        </span>
      </button>
      <div v-if="!props.alunos.length" class="empty-state" style="padding: 20px;">Nenhum aluno cadastrado ainda.</div>
    </div>
  </div>
</template>
