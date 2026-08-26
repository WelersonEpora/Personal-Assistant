<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import registrosService from '../../services/registros.service.js'
import { corParaId, iniciais, formatarData, formatarHora } from '../../utils/registroStatus.js'

const props = defineProps({ id: { type: String, required: true } })

const registro = ref(null)
const carregando = ref(true)

async function carregar() {
  carregando.value = true
  try {
    registro.value = await registrosService.obter(props.id)
    await carregarAudios()
  } finally {
    carregando.value = false
  }
}

// Áudio já sincronizado só existe no servidor - buscado como Blob (ver
// services/registros.service.js) para virar object URL, mesmo padrão da
// RevisaoView e do composer de captura.
async function carregarAudios() {
  const entradas = registro.value?.entradas || []
  await Promise.all(
    entradas
      .filter((entrada) => entrada.tipo === 'audio' && entrada.arquivoAudio)
      .map(async (entrada) => {
        try {
          const blob = await registrosService.obterAudio(registro.value.id, entrada.id)
          entrada.audioUrl = URL.createObjectURL(blob)
        } catch (_err) {
          // sem áudio disponível - a entrada só fica sem player
        }
      })
  )
}

function revogarAudios() {
  (registro.value?.entradas || []).forEach((entrada) => {
    if (entrada.audioUrl) URL.revokeObjectURL(entrada.audioUrl)
  })
}

onMounted(carregar)
onBeforeUnmount(revogarAudios)

const itensConfirmados = computed(() => registro.value?.validacao?.payload_confirmado_json?.itens || [])
const notaGeralConfirmada = computed(() => registro.value?.validacao?.payload_confirmado_json?.notaGeral || '')
</script>

<template>
  <div>
    <router-link class="detail-back" :to="{ name: 'admin-historico' }">← Voltar para Histórico</router-link>

    <div v-if="carregando" class="card"><div class="empty-state">Carregando…</div></div>

    <div v-else-if="!registro" class="card">
      <div class="empty-state">Registro não encontrado.</div>
    </div>

    <div v-else class="card revisao-card">
      <div class="detail-header" style="margin-bottom: 14px;">
        <span class="avatar sz-md" :style="{ background: corParaId(registro.aluno?.id) }">{{ iniciais(registro.aluno?.nome) }}</span>
        <div>
          <div class="detail-header-name" style="font-size: 16px;">{{ registro.aluno?.nome }} — {{ registro.titulo || 'Registro' }}</div>
          <div class="detail-header-sub">
            Confirmado em {{ formatarData(registro.validacao?.confirmado_em) }} · iniciado às {{ formatarHora(registro.iniciado_em) }}
          </div>
        </div>
      </div>

      <p style="font-size: 12px; font-weight: 700; color: var(--color-text-faint); text-transform: uppercase; letter-spacing: .03em; margin: 0 0 10px;">
        Entradas originais
      </p>
      <div class="transcript-box open">
        <div v-for="entrada in registro.entradas" :key="entrada.id" class="source-entry">
          <span class="source-entry-icon">{{ entrada.tipo === 'audio' ? '🎙️' : '⌨️' }}</span>
          <div class="source-entry-body">
            <div class="source-entry-meta">{{ entrada.tipo === 'audio' ? `Áudio · ${entrada.duracao_segundos}s` : 'Texto' }}</div>
            <audio v-if="entrada.audioUrl" :src="entrada.audioUrl" controls class="source-entry-audio"></audio>
            <div class="source-entry-text">
              <template v-if="entrada.tipo === 'audio'">
                <template v-if="entrada.arquivoAudio?.transcricao?.texto">"{{ entrada.arquivoAudio.transcricao.texto }}"</template>
                <span v-else style="font-style: normal; color: var(--color-text-faint);">Transcrição não disponível.</span>
              </template>
              <template v-else>"{{ entrada.conteudo_texto }}"</template>
            </div>
          </div>
        </div>
      </div>

      <div v-if="notaGeralConfirmada" class="exercise-obs" style="margin-top: 14px;">Nota geral: {{ notaGeralConfirmada }}</div>

      <p style="font-size: 12px; font-weight: 700; color: var(--color-text-faint); text-transform: uppercase; letter-spacing: .03em; margin: 18px 0 10px;">
        Itens confirmados
      </p>
      <div v-if="!itensConfirmados.length" class="empty-state" style="padding: 20px;">Nenhum item confirmado neste registro.</div>
      <div v-for="(item, indice) in itensConfirmados" :key="indice" class="exercise-card">
        <div class="exercise-card-top">
          <div>
            <div class="exercise-name">{{ item.label }}</div>
            <div class="exercise-meta">{{ item.valor }}</div>
          </div>
        </div>
        <div class="exercise-obs" :class="{ empty: !item.obs }">Observação: {{ item.obs }}</div>
      </div>
    </div>
  </div>
</template>
