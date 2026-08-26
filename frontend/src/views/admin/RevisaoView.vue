<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import registrosService from '../../services/registros.service.js'
import { corParaId, iniciais, formatarData, formatarHora, resumoEntradas } from '../../utils/registroStatus.js'
import { useToasts } from '../../composables/useToasts.js'
import ToastStack from '../../components/ToastStack.vue'

const props = defineProps({ id: { type: String, default: null } })
const emit = defineEmits(['registro-processado'])
const router = useRouter()
const { toasts, showToast } = useToasts()

const fila = ref([])
const selecionado = ref(null)
const carregandoDetalhe = ref(false)
const editando = ref(false)
const itensEdicao = ref([])
const notaGeralEdicao = ref('')
const transcricaoAberta = ref(false)
const confirmando = ref(false)

async function carregarFila() {
  fila.value = await registrosService.listar({ status: 'aguardando_revisao' })
  if (props.id && fila.value.some((r) => r.id === props.id)) {
    await selecionar(props.id)
  } else if (fila.value.length) {
    await selecionar(fila.value[0].id)
  } else {
    selecionado.value = null
  }
}

async function selecionar(id) {
  editando.value = false
  carregandoDetalhe.value = true
  transcricaoAberta.value = false
  revogarAudiosEntradas(selecionado.value?.entradas)
  try {
    selecionado.value = await registrosService.obter(id)
    router.replace({ name: 'admin-revisao', params: { id } })
  } finally {
    carregandoDetalhe.value = false
  }
}

// Áudio já sincronizado só existe no servidor - buscado como Blob sob
// demanda (ver services/registros.service.js) quando o personal abre "Ver
// entradas originais", não no carregamento da fila inteira.
async function alternarEntradasOriginais() {
  transcricaoAberta.value = !transcricaoAberta.value
  if (!transcricaoAberta.value || !selecionado.value) return
  await Promise.all(
    selecionado.value.entradas
      .filter((entrada) => entrada.tipo === 'audio' && entrada.arquivoAudio && !entrada.audioUrl)
      .map(async (entrada) => {
        try {
          const blob = await registrosService.obterAudio(selecionado.value.id, entrada.id)
          entrada.audioUrl = URL.createObjectURL(blob)
        } catch (_err) {
          // sem áudio disponível - a entrada só fica sem player, sem travar as demais
        }
      })
  )
}

function revogarAudiosEntradas(entradas) {
  ;(entradas || []).forEach((entrada) => {
    if (entrada.audioUrl) URL.revokeObjectURL(entrada.audioUrl)
  })
}

onMounted(carregarFila)
onBeforeUnmount(() => revogarAudiosEntradas(selecionado.value?.entradas))
watch(
  () => props.id,
  (novo) => {
    if (novo && novo !== selecionado.value?.id) selecionar(novo)
  }
)

const itensIa = computed(() => selecionado.value?.resultadoIa?.payload_json?.itens || [])
const notaGeralIa = computed(() => selecionado.value?.resultadoIa?.payload_json?.notaGeral || '')

function entrarEdicao() {
  itensEdicao.value = itensIa.value.map((item) => ({ ...item }))
  notaGeralEdicao.value = notaGeralIa.value
  editando.value = true
}

function removerItemEdicao(indice) {
  itensEdicao.value.splice(indice, 1)
}

async function confirmarRegistro(itens, notaGeral) {
  confirmando.value = true
  try {
    await registrosService.confirmar(selecionado.value.id, { itens, notaGeral })
    showToast(`Registro de ${selecionado.value.aluno?.nome} confirmado e salvo no histórico.`, 'success')
    emit('registro-processado')
    await carregarFila()
  } catch (_err) {
    showToast('Não foi possível confirmar o registro.', 'warning')
  } finally {
    confirmando.value = false
  }
}

function salvarEdicaoEConfirmar() {
  confirmarRegistro(itensEdicao.value, notaGeralEdicao.value)
}
function confirmarSemEditar() {
  confirmarRegistro(itensIa.value, notaGeralIa.value)
}
</script>

<template>
  <div class="revisao-grid">
    <div>
      <div v-if="carregandoDetalhe" class="card"><div class="empty-state">Carregando…</div></div>

      <div v-else-if="!selecionado" class="card">
        <div class="empty-state">
          <div class="empty-state-icon">✅</div>
          Nenhum registro aguardando revisão no momento.<br />
          Assim que a IA processar um novo registro, ele aparece aqui.
        </div>
      </div>

      <div v-else class="card revisao-card">
        <div class="detail-header" style="margin-bottom: 14px;">
          <span class="avatar sz-md" :style="{ background: corParaId(selecionado.aluno?.id) }">{{ iniciais(selecionado.aluno?.nome) }}</span>
          <div>
            <div class="detail-header-name" style="font-size: 16px;">{{ selecionado.aluno?.nome }} — {{ selecionado.titulo || 'Registro' }}</div>
            <div class="detail-header-sub">
              Registro de {{ formatarData(selecionado.created_at) }} · {{ editando ? 'editando itens identificados' : 'iniciado às ' + formatarHora(selecionado.iniciado_em) }}
            </div>
          </div>
        </div>

        <template v-if="!editando">
          <div class="revisao-source">
            {{ resumoEntradas(selecionado.entradas || []) }} neste registro
            <button class="revisao-source-toggle" type="button" @click="alternarEntradasOriginais">
              {{ transcricaoAberta ? 'Ocultar entradas originais' : 'Ver entradas originais' }}
            </button>
          </div>
          <div class="transcript-box" :class="{ open: transcricaoAberta }">
            <div v-for="entrada in selecionado.entradas" :key="entrada.id" class="source-entry">
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

          <div v-if="notaGeralIa" class="exercise-obs" style="margin-top: 14px;">Nota geral: {{ notaGeralIa }}</div>

          <p style="font-size: 12px; font-weight: 700; color: var(--color-text-faint); text-transform: uppercase; letter-spacing: .03em; margin: 18px 0 10px;">
            A IA identificou
          </p>
          <div v-if="!itensIa.length" class="empty-state" style="padding: 20px;">A IA não identificou itens estruturáveis neste registro.</div>
          <div v-for="(item, indice) in itensIa" :key="indice" class="exercise-card">
            <div class="exercise-card-top">
              <div>
                <div class="exercise-name">{{ item.label }}</div>
                <div class="exercise-meta">{{ item.valor }}</div>
              </div>
              <span class="confidence-note" :class="item.confidence === 'alta' ? 'alta' : item.confidence === 'baixa' ? 'baixa' : 'media'">
                ● {{ item.confidence === 'alta' ? 'Alta confiança' : item.confidence === 'baixa' ? 'Baixa confiança' : 'Revisar' }}
              </span>
            </div>
            <div class="exercise-obs" :class="{ empty: !item.obs }">Observação: {{ item.obs }}</div>
          </div>

          <div class="revisao-actions">
            <button class="btn btn-secondary" type="button" @click="entrarEdicao">Editar</button>
            <button class="btn btn-primary" type="button" :disabled="confirmando" @click="confirmarSemEditar">Confirmar</button>
          </div>
        </template>

        <template v-else>
          <div v-if="!itensEdicao.length" class="empty-state" style="padding: 20px;">Nenhum item para editar.</div>
          <div v-for="(item, indice) in itensEdicao" :key="indice" class="exercise-card">
            <div class="field-row">
              <div class="field-group" style="grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: center;">
                <label style="margin: 0;">Item {{ indice + 1 }}</label>
                <button class="exercise-remove" type="button" @click="removerItemEdicao(indice)">Remover</button>
              </div>
              <div class="field-group" style="grid-column: 1 / -1;"><label>Item</label><input v-model="item.label" type="text" /></div>
              <div class="field-group" style="grid-column: 1 / -1;"><label>Valor</label><input v-model="item.valor" type="text" /></div>
              <div class="field-group obs-field">
                <label>Observação</label>
                <textarea v-model="item.obs"></textarea>
              </div>
            </div>
          </div>
          <div class="field-group" style="margin-top: 14px;">
            <label>Nota geral</label>
            <textarea v-model="notaGeralEdicao"></textarea>
          </div>

          <div class="revisao-actions">
            <button class="btn btn-primary" type="button" :disabled="confirmando" @click="salvarEdicaoEConfirmar">Salvar e confirmar</button>
            <button class="btn btn-ghost" type="button" @click="editando = false">Cancelar</button>
          </div>
        </template>
      </div>
    </div>

    <div>
      <div class="card" style="margin-bottom: 16px;">
        <div class="card-header"><h3>Fila de revisão</h3></div>
        <div v-if="!fila.length" class="empty-state" style="padding: 24px;">Fila vazia 🎉</div>
        <button
          v-for="registro in fila"
          :key="registro.id"
          class="queue-item"
          :class="{ active: registro.id === selecionado?.id }"
          type="button"
          @click="selecionar(registro.id)"
        >
          <span class="avatar sz-sm" :style="{ background: corParaId(registro.aluno?.id) }">{{ iniciais(registro.aluno?.nome) }}</span>
          <span class="queue-item-body">
            <span class="queue-item-title">{{ registro.aluno?.nome }} — {{ registro.titulo || 'Registro' }}</span>
            <span class="queue-item-sub">{{ formatarData(registro.created_at) }} — {{ formatarHora(registro.iniciado_em) }}</span>
          </span>
        </button>
      </div>
      <div class="card">
        <div class="card-header"><h3>Dicas</h3></div>
        <div class="card-pad" style="font-size: 12.5px; color: var(--color-text-secondary); line-height: 1.6;">
          Corrija números e nomes de exercícios antes de confirmar — isso ajuda a manter o histórico do aluno preciso.
        </div>
      </div>
    </div>

    <ToastStack :toasts="toasts" />
  </div>
</template>
