<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import registrosService from '../../services/registros.service.js'
import avaliacoesFisicasService from '../../services/avaliacoesFisicas.service.js'
import { corParaId, iniciais, formatarData, formatarHora } from '../../utils/registroStatus.js'
import { formatarDataAvaliacao, propostaParaRascunho } from '../../utils/avaliacaoFisica.js'
import { useToasts } from '../../composables/useToasts.js'
import { useConfirm } from '../../composables/useConfirm.js'
import AvaliacaoFisicaForm from '../avaliacaoFisica/AvaliacaoFisicaForm.vue'
import ToastStack from '../ToastStack.vue'

// docs/adr/0018-avaliacao-fisica-por-captura-e-ia.md: revisão da PROPOSTA da
// IA para um Registro tipo avaliacao_fisica. Não é a tela de `validacao` -
// aqui o personal confere as medidas (com a confiança da IA à vista), edita no
// formulário de avaliação física e confirma; a avaliação nasce pelo CRUD
// oficial (endpoint /confirmar-avaliacao-fisica).
const props = defineProps({ registro: { type: Object, required: true } })
const emit = defineEmits(['processado'])

const { toasts, showToast } = useToasts()
const { confirmar: confirmarDialog } = useConfirm()

const metricas = ref([])
const confirmando = ref(false)
const refazendo = ref(false)
const entradasAbertas = ref(false)

const proposta = computed(() => props.registro.propostaAvaliacaoFisica || null)
const payload = computed(() => proposta.value?.payload_json || {})
const naoMapeado = computed(() => proposta.value?.avisos_json || [])

const rotuloMetrica = (codigo) => metricas.value.find((m) => m.codigo === codigo)?.rotulo || codigo

const medidas = computed(() => (Array.isArray(payload.value.medidas) ? payload.value.medidas : []))
const medidasAtencao = computed(() => medidas.value.filter((m) => m.confianca === 'media' || m.confianca === 'baixa'))
const semMedidas = computed(() => medidas.value.length === 0)

// Rascunho para o formulário (sem anamnese/postural - a proposta não os produz).
const rascunho = computed(() => propostaParaRascunho(payload.value))

onMounted(async () => {
  try {
    metricas.value = await avaliacoesFisicasService.listarMetricas()
  } catch (_err) {
    showToast('Não foi possível carregar o catálogo de métricas.', 'warning')
  }
})

async function alternarEntradas() {
  entradasAbertas.value = !entradasAbertas.value
  if (!entradasAbertas.value) return
  await Promise.all(
    (props.registro.entradas || [])
      .filter((e) => e.tipo === 'audio' && e.arquivoAudio && !e.audioUrl)
      .map(async (e) => {
        try {
          const blob = await registrosService.obterAudio(props.registro.id, e.id)
          e.audioUrl = URL.createObjectURL(blob)
        } catch (_err) {
          // sem áudio - a entrada fica só sem player
        }
      })
  )
}

onBeforeUnmount(() => {
  ;(props.registro.entradas || []).forEach((e) => {
    if (e.audioUrl) URL.revokeObjectURL(e.audioUrl)
  })
})

async function confirmar(payloadRevisado) {
  confirmando.value = true
  try {
    await registrosService.confirmarAvaliacaoFisica(props.registro.id, payloadRevisado)
    showToast(`Avaliação física de ${props.registro.aluno?.nome} confirmada e salva.`, 'success')
    emit('processado')
  } catch (err) {
    showToast(err.response?.data?.error?.message || 'Não foi possível confirmar a avaliação.', 'warning')
  } finally {
    confirmando.value = false
  }
}

async function refazerInterpretacao() {
  const ok = await confirmarDialog({
    titulo: 'Refazer a interpretação da IA?',
    mensagem: 'A proposta atual é substituída por uma nova. Suas edições não salvas neste formulário se perdem.'
  })
  if (!ok) return
  refazendo.value = true
  try {
    await registrosService.reprocessar(props.registro.id)
    showToast('Interpretação reenviada. Acompanhe na fila.', 'neutral')
    emit('processado')
  } catch (_err) {
    showToast('Não foi possível refazer a interpretação.', 'warning')
  } finally {
    refazendo.value = false
  }
}

async function descartar() {
  const ok = await confirmarDialog({
    titulo: 'Descartar esta avaliação?',
    mensagem: 'O registro e o áudio são removidos. Essa ação não pode ser desfeita.',
    perigo: true,
    confirmarLabel: 'Descartar'
  })
  if (!ok) return
  try {
    await registrosService.excluir(props.registro.id)
    showToast('Avaliação descartada.', 'neutral')
    emit('processado')
  } catch (_err) {
    showToast('Não foi possível descartar.', 'warning')
  }
}
</script>

<template>
  <div class="card revisao-card">
    <div class="detail-header" style="margin-bottom: 14px;">
      <span class="avatar sz-md" :style="{ background: corParaId(registro.aluno?.id) }">{{ iniciais(registro.aluno?.nome) }}</span>
      <div>
        <div class="detail-header-name" style="font-size: 16px;">
          {{ registro.aluno?.nome }} — Avaliação física
        </div>
        <div class="detail-header-sub">
          Proposta da IA · registro de {{ formatarData(registro.created_at) }} às {{ formatarHora(registro.iniciado_em) }}
        </div>
      </div>
    </div>

    <div v-if="proposta && proposta.status !== 'concluido'" class="af-rev-alerta danger">
      A interpretação falhou{{ proposta.erro ? `: ${proposta.erro}` : '.' }} Use “Refazer interpretação”.
    </div>

    <!-- painel de conferência -->
    <div class="af-rev-conferencia">
      <div class="af-rev-conf-linha">
        <span class="af-rev-conf-rot">Data ouvida</span>
        <span v-if="payload.data_ouvida">{{ formatarDataAvaliacao(payload.data_ouvida) }}</span>
        <span v-else class="af-rev-conf-vazio">não foi dita — confirme no formulário</span>
      </div>
      <div class="af-rev-conf-linha">
        <span class="af-rev-conf-rot">Medidas</span>
        <span>{{ medidas.length }} identificada(s)<template v-if="medidasAtencao.length">, {{ medidasAtencao.length }} para conferir</template></span>
      </div>

      <div v-if="medidasAtencao.length" class="af-rev-flags">
        <div v-for="(m, i) in medidasAtencao" :key="i" class="af-rev-flag">
          <span class="confidence-note" :class="m.confianca">● {{ m.confianca === 'baixa' ? 'Baixa confiança' : 'Revisar' }}</span>
          <span class="af-rev-flag-metrica">{{ rotuloMetrica(m.metrica_codigo) }}: <b>{{ m.valor }}</b><template v-if="m.unidade_ouvida"> ({{ m.unidade_ouvida }})</template></span>
          <span v-if="m.trecho_origem" class="af-rev-flag-trecho">“{{ m.trecho_origem }}”</span>
        </div>
      </div>

      <div v-if="naoMapeado.length" class="af-rev-naomapeado">
        <div class="af-rev-conf-rot">Não reconhecido</div>
        <div v-for="(n, i) in naoMapeado" :key="i" class="af-rev-nm-item">
          “{{ n.trecho }}”<template v-if="n.motivo"> — {{ n.motivo }}</template>
        </div>
        <p class="af-rev-nm-dica">Se for relevante, adicione manualmente no formulário ou anote em “Observações”.</p>
      </div>

      <button class="revisao-source-toggle" type="button" style="margin: 4px 0 0;" @click="alternarEntradas">
        {{ entradasAbertas ? 'Ocultar áudio original' : 'Ouvir áudio original' }}
      </button>
      <div class="transcript-box" :class="{ open: entradasAbertas }">
        <div v-for="entrada in registro.entradas" :key="entrada.id" class="source-entry">
          <span class="source-entry-icon">{{ entrada.tipo === 'audio' ? '🎙️' : '⌨️' }}</span>
          <div class="source-entry-body">
            <div class="source-entry-meta">{{ entrada.tipo === 'audio' ? `Áudio · ${entrada.duracao_segundos || '?'}s` : 'Texto' }}</div>
            <audio v-if="entrada.audioUrl" :src="entrada.audioUrl" controls class="source-entry-audio"></audio>
            <div class="source-entry-text">
              <template v-if="entrada.tipo === 'audio'">
                <template v-if="entrada.arquivoAudio?.transcricao?.texto">“{{ entrada.arquivoAudio.transcricao.texto }}”</template>
                <span v-else style="font-style: normal; color: var(--color-text-faint);">Transcrição não disponível.</span>
              </template>
              <template v-else>“{{ entrada.conteudo_texto }}”</template>
            </div>
          </div>
        </div>
      </div>
    </div>

    <p v-if="semMedidas" class="af-rev-alerta">
      A IA não extraiu nenhuma medida deste registro. Preencha manualmente abaixo, ou descarte.
    </p>

    <div class="af-rev-form">
      <AvaliacaoFisicaForm
        :aluno-id="registro.aluno_id || registro.aluno?.id"
        :metricas="metricas"
        modo="revisao"
        :rascunho-inicial="rascunho"
        :ocupado="confirmando"
        @confirmar="confirmar"
        @cancelar="descartar"
      />
    </div>

    <div class="revisao-actions">
      <button class="btn btn-secondary" type="button" :disabled="refazendo || confirmando" @click="refazerInterpretacao">
        Refazer interpretação
      </button>
      <button class="btn btn-danger-ghost" type="button" style="margin-left: auto;" :disabled="confirmando" @click="descartar">
        Descartar
      </button>
    </div>

    <ToastStack :toasts="toasts" />
  </div>
</template>

<style scoped>
.af-rev-conferencia {
  border: 1px solid var(--color-avaliacao);
  background: var(--color-avaliacao-light);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.af-rev-conf-linha { display: flex; gap: 10px; font-size: 13px; align-items: baseline; }
.af-rev-conf-rot {
  font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em;
  color: var(--color-avaliacao-dark); flex: none; min-width: 96px;
}
.af-rev-conf-vazio { color: var(--color-warning); font-size: 12.5px; }
.af-rev-flags { display: flex; flex-direction: column; gap: 8px; margin-top: 2px; }
.af-rev-flag {
  background: var(--color-surface);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px;
}
.af-rev-flag-metrica { font-size: 13px; }
.af-rev-flag-trecho { font-size: 12px; color: var(--color-text-faint); font-style: italic; }
.af-rev-naomapeado {
  background: var(--color-surface);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  display: flex; flex-direction: column; gap: 3px;
}
.af-rev-nm-item { font-size: 12.5px; color: var(--color-text-secondary); }
.af-rev-nm-dica { font-size: 11.5px; color: var(--color-text-faint); margin-top: 2px; }
.af-rev-alerta {
  font-size: 12.5px; color: var(--color-warning);
  background: var(--color-warning-light);
  padding: 10px 12px; border-radius: var(--radius-sm);
  margin-bottom: 14px;
}
.af-rev-alerta.danger { color: var(--color-danger); background: var(--color-danger-light); }
.af-rev-form :deep(.view-header) { display: none; }
</style>
