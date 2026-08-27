<script setup>
// Linha de relato (Registro) dentro do acompanhamento do aluno. Cobre tanto o
// relato ainda em andamento (recebido / transcrevendo / aguardando revisão /
// erro) quanto o confirmado (com itens e nota geral). O expandir é controlado
// pelo pai (prop `aberto`); a 1a abertura busca o detalhe completo e os áudios
// (a listagem só traz entradas leves - ver registro.repository.js).
import { ref, watch, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import registrosService from '../services/registros.service.js'
import { statusMeta, formatarDataHora } from '../utils/registroStatus.js'

const props = defineProps({
  registro: { type: Object, required: true },
  aberto: { type: Boolean, default: false }
})
const emit = defineEmits(['toggle'])
const router = useRouter()

const carregandoDetalhe = ref(false)

function confirmado() {
  return props.registro.status === 'confirmado'
}
function itensConfirmados() {
  return props.registro.validacao?.payload_confirmado_json?.itens || []
}
function notaGeralConfirmada() {
  return props.registro.validacao?.payload_confirmado_json?.notaGeral || ''
}

async function carregarDetalhe() {
  const registro = props.registro
  if (!registro.detalhado) {
    carregandoDetalhe.value = true
    try {
      const detalhe = await registrosService.obter(registro.id)
      registro.entradas = detalhe.entradas || []
      registro.validacao = detalhe.validacao
      registro.detalhado = true
    } catch (_err) {
      return // sem detalhe disponível - fica só com o resumo da linha
    } finally {
      carregandoDetalhe.value = false
    }
  }

  await Promise.all(
    (registro.entradas || [])
      .filter((entrada) => entrada.tipo === 'audio' && entrada.arquivoAudio && !entrada.audioUrl)
      .map(async (entrada) => {
        try {
          const blob = await registrosService.obterAudio(registro.id, entrada.id)
          entrada.audioUrl = URL.createObjectURL(blob)
        } catch (_err) {
          // sem áudio disponível - só essa entrada fica sem player
        }
      })
  )
}

watch(
  () => props.aberto,
  (aberto) => {
    if (aberto) carregarDetalhe()
  }
)

onBeforeUnmount(() => {
  (props.registro.entradas || []).forEach((entrada) => {
    if (entrada.audioUrl) URL.revokeObjectURL(entrada.audioUrl)
  })
})
</script>

<template>
  <div>
    <div class="registro-card-head row-clickable" @click="emit('toggle')">
      <div class="acomp-feed-cab">
        <span class="list-row-title">
          📋 {{ confirmado() ? 'Relato confirmado' : 'Relato' }} —
          {{ formatarDataHora(registro.validacao?.confirmado_em || registro.created_at) }}
        </span>
        <span class="list-row-sub">
          <template v-if="confirmado()">
            {{ registro.validacao?.payload_confirmado_json?.itens?.length || 0 }} item(ns) confirmado(s)
          </template>
          <template v-else>{{ registro.titulo || 'Registro' }}</template>
        </span>
      </div>
      <span class="badge" :class="'badge-' + statusMeta(registro.status).badge">
        {{ statusMeta(registro.status).icon }} {{ statusMeta(registro.status).label }}
      </span>
    </div>

    <button
      v-if="registro.status === 'aguardando_revisao'"
      type="button"
      class="registro-card-foot"
      style="align-self: flex-start; background: none; border: none; cursor: pointer; padding: 4px 0 0;"
      @click.stop="router.push({ name: 'admin-revisao', params: { id: registro.id } })"
    >
      Revisar →
    </button>

    <div v-if="aberto" class="acomp-detalhe-box" @click.stop>
      <div v-if="carregandoDetalhe" class="empty-state" style="padding: 16px;">Carregando…</div>

      <template v-else>
        <div v-for="entrada in registro.entradas || []" :key="entrada.id" class="source-entry">
          <span class="source-entry-icon">{{ entrada.tipo === 'audio' ? '🎙️' : '⌨️' }}</span>
          <div class="source-entry-body">
            <div class="source-entry-meta">
              {{ entrada.tipo === 'audio' ? `Áudio${entrada.duracao_segundos ? ' · ' + entrada.duracao_segundos + 's' : ''}` : 'Texto' }}
            </div>
            <template v-if="entrada.tipo === 'audio'">
              <audio v-if="entrada.audioUrl" :src="entrada.audioUrl" controls class="source-entry-audio"></audio>
              <span v-else class="source-entry-text" style="font-style: normal;">Áudio indisponível.</span>
              <div v-if="confirmado()" class="source-entry-text">
                <template v-if="entrada.arquivoAudio?.transcricao?.texto">"{{ entrada.arquivoAudio.transcricao.texto }}"</template>
                <span v-else style="font-style: normal; color: var(--color-text-faint);">Transcrição não disponível.</span>
              </div>
            </template>
            <div v-else class="source-entry-text">"{{ entrada.conteudo_texto }}"</div>
          </div>
        </div>

        <template v-if="confirmado()">
          <div v-if="notaGeralConfirmada()" class="exercise-obs" style="margin-top: 14px;">Nota geral: {{ notaGeralConfirmada() }}</div>

          <p class="source-entry-meta" style="margin: 18px 0 10px;">Itens confirmados</p>
          <div v-if="!itensConfirmados().length" class="empty-state" style="padding: 20px;">Nenhum item confirmado neste registro.</div>
          <div v-for="(item, indice) in itensConfirmados()" :key="indice" class="exercise-card">
            <div class="exercise-card-top">
              <div>
                <div class="exercise-name">{{ item.label }}</div>
                <div class="exercise-meta">{{ item.valor }}</div>
              </div>
            </div>
            <div class="exercise-obs" :class="{ empty: !item.obs }">Observação: {{ item.obs }}</div>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* Reaproveita a aparência das linhas do acompanhamento; como este é um
   componente próprio, os estilos escopados do pai não alcançam aqui. */
.acomp-feed-cab {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.acomp-detalhe-box {
  margin-top: 10px;
  padding: 14px 16px;
  background: var(--color-surface-alt);
  border-radius: var(--radius-md);
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text);
}
</style>
