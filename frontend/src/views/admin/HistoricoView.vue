<script setup>
import { ref, computed, onMounted } from 'vue'
import registrosService from '../../services/registros.service.js'
import { corParaId, iniciais, formatarData } from '../../utils/registroStatus.js'

const registros = ref([])
const carregando = ref(true)

onMounted(async () => {
  try {
    registros.value = await registrosService.listar({ status: 'confirmado' })
  } finally {
    carregando.value = false
  }
})

const ordenados = computed(() => [...registros.value].sort((a, b) => (a.validacao?.confirmado_em < b.validacao?.confirmado_em ? 1 : -1)))
</script>

<template>
  <div>
    <div class="view-header">
      <div>
        <h1>Histórico</h1>
        <p>Registros já confirmados e salvos no perfil de cada aluno.</p>
      </div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Aluno</th>
              <th>Registro</th>
              <th>Itens</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="registro in ordenados" :key="registro.id">
              <td>{{ formatarData(registro.validacao?.confirmado_em || registro.created_at) }}</td>
              <td>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span class="avatar sz-sm" :style="{ background: corParaId(registro.aluno?.id) }">{{ iniciais(registro.aluno?.nome) }}</span>
                  {{ registro.aluno?.nome }}
                </div>
              </td>
              <td>{{ registro.titulo || 'Registro' }}</td>
              <td>{{ registro.validacao?.payload_confirmado_json?.itens?.length || 0 }}</td>
              <td><span class="badge badge-success">Confirmado</span></td>
            </tr>
          </tbody>
        </table>
        <div v-if="!carregando && !ordenados.length" class="empty-state">Nenhum registro confirmado ainda.</div>
      </div>
    </div>
  </div>
</template>
