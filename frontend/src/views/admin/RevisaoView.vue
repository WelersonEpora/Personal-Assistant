<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import registrosService from '../../services/registros.service.js'
import {
  corParaId,
  iniciais,
  formatarData,
  formatarHora,
  formatarDataAtendimento,
  resumoEntradas,
  tipoMeta
} from '../../utils/registroStatus.js'
import { useToasts } from '../../composables/useToasts.js'
import { useConfirm } from '../../composables/useConfirm.js'
import ToastStack from '../../components/ToastStack.vue'
import CampoData from '../../components/CampoData.vue'
import RevisaoAvaliacaoFisica from '../../components/revisao/RevisaoAvaliacaoFisica.vue'

const props = defineProps({ id: { type: String, default: null } })
const emit = defineEmits(['registro-processado'])
const router = useRouter()
const { toasts, showToast } = useToasts()
const { confirmar } = useConfirm()

const fila = ref([])
const selecionado = ref(null)
const carregandoDetalhe = ref(false)
const editando = ref(false)
const itensEdicao = ref([])
const notaGeralEdicao = ref('')
const transcricaoAberta = ref(false)
const confirmando = ref(false)

// docs/adr/0019 - a data do atendimento é ajustada no "Editar", como se fosse
// o item 0 do relato; vai junto no payload da confirmação. Janela: dos últimos
// 60 dias (ancorada em iniciado_em) até hoje - nunca futura, nunca antiga demais.
const dataAtendimentoEdicao = ref('')
const hojeYmd = new Date().toISOString().slice(0, 10)
const minDataAtendimento = computed(() => {
  const base = selecionado.value?.iniciado_em ? new Date(selecionado.value.iniciado_em) : new Date()
  base.setDate(base.getDate() - 60)
  return base.toISOString().slice(0, 10)
})

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
  // docs/adr/0019 - a data do atendimento entra como "item 0" do formulário.
  dataAtendimentoEdicao.value = String(selecionado.value?.data_atendimento || '').slice(0, 10)
  editando.value = true
}

function removerItemEdicao(indice) {
  itensEdicao.value.splice(indice, 1)
}

async function confirmarRegistro(itens, notaGeral, dataAtendimento) {
  confirmando.value = true
  try {
    await registrosService.confirmar(selecionado.value.id, { itens, notaGeral, dataAtendimento })
    showToast(`Registro de ${selecionado.value.aluno?.nome} confirmado e salvo no histórico.`, 'success')
    emit('registro-processado')
    await carregarFila()
  } catch (err) {
    showToast(err.response?.data?.error?.message || 'Não foi possível confirmar o registro.', 'warning')
  } finally {
    confirmando.value = false
  }
}

function salvarEdicaoEConfirmar() {
  // Só manda a data quando o personal mexeu nela (senão fica como foi capturada).
  const dataAlterada =
    dataAtendimentoEdicao.value && dataAtendimentoEdicao.value !== String(selecionado.value.data_atendimento).slice(0, 10)
  confirmarRegistro(itensEdicao.value, notaGeralEdicao.value, dataAlterada ? dataAtendimentoEdicao.value : undefined)
}
function confirmarSemEditar() {
  confirmarRegistro(itensIa.value, notaGeralIa.value)
}

// docs/adr/0018 - RevisaoAvaliacaoFisica já mostrou o toast e chamou a API;
// aqui só sai do detalhe e recarrega a fila (igual ao pós-confirmação do relato).
async function aoProcessarRegistro() {
  emit('registro-processado')
  await carregarFila()
}

// Exclusão (soft-delete, docs/adr/0007) - mesmo padrão de RegistrosView: o
// backend já rejeita "confirmado", mas nesta tela isso nunca acontece porque
// só chegam registros 'aguardando_revisao'.
async function excluirRegistro() {
  const ok = await confirmar({
    titulo: 'Excluir este registro?',
    mensagem: 'Essa ação não pode ser desfeita.',
    perigo: true
  })
  if (!ok) return
  try {
    await registrosService.excluir(selecionado.value.id)
    showToast('Registro excluído.', 'neutral')
    await carregarFila()
  } catch (_err) {
    showToast('Não foi possível excluir o registro.', 'warning')
  }
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

      <!-- docs/adr/0018 - Registro de avaliação física tem revisão própria
           (formulário pré-preenchido pela proposta; NÃO cria validacao). -->
      <RevisaoAvaliacaoFisica
        v-else-if="selecionado.tipo === 'avaliacao_fisica'"
        :registro="selecionado"
        @processado="aoProcessarRegistro"
      />

      <div v-else class="card revisao-card">
        <div class="detail-header" style="margin-bottom: 14px;">
          <span class="avatar sz-md" :style="{ background: corParaId(selecionado.aluno?.id) }">{{ iniciais(selecionado.aluno?.nome) }}</span>
          <div>
            <div class="detail-header-name" style="font-size: 16px;">{{ selecionado.aluno?.nome }} — {{ selecionado.titulo || 'Registro' }}</div>
            <div class="detail-header-sub">
              <strong>Atendimento em {{ formatarDataAtendimento(selecionado.data_atendimento) }}</strong>
              <span class="detail-header-faint"> · registrado {{ formatarData(selecionado.created_at) }} às {{ formatarHora(selecionado.iniciado_em) }}</span>
              <span v-if="editando" class="detail-header-faint"> · ajuste a data abaixo</span>
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
            <button class="btn btn-danger-ghost" type="button" style="margin-left: auto;" @click="excluirRegistro">Excluir Registro</button>
          </div>
        </template>

        <template v-else>
          <!-- docs/adr/0019 - a data do atendimento é o "item 0" do relato -->
          <div class="exercise-card">
            <div class="field-row">
              <div class="field-group" style="grid-column: 1 / -1;">
                <label>Data do atendimento</label>
                <CampoData
                  v-model="dataAtendimentoEdicao"
                  :min="minDataAtendimento"
                  :max="hojeYmd"
                  aria-label="Data do atendimento"
                />
                <span class="field-hint">O dia em que o atendimento aconteceu — não a data de hoje nem a do registro. Últimos 60 dias.</span>
              </div>
            </div>
          </div>

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
            <button class="btn btn-danger-ghost" type="button" style="margin-left: auto;" @click="excluirRegistro">Excluir Registro</button>
          </div>
        </template>
      </div>
    </div>

    <div class="revisao-lateral">
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
            <span class="queue-item-title">
              {{ registro.aluno?.nome }} — {{ registro.titulo || 'Registro' }}
              <span v-if="registro.tipo === 'avaliacao_fisica'" class="badge badge-avaliacao" style="font-size: 10px;">{{ tipoMeta(registro.tipo).icon }} {{ tipoMeta(registro.tipo).chip }}</span>
            </span>
            <span class="queue-item-sub">Atendimento {{ formatarDataAtendimento(registro.data_atendimento) }}</span>
          </span>
        </button>
      </div>
      <div class="card revisao-dicas">
        <div class="card-header"><h3>Dicas</h3></div>
        <div class="card-pad" style="font-size: 12.5px; color: var(--color-text-secondary); line-height: 1.6;">
          Corrija números e nomes de exercícios antes de confirmar — isso ajuda a manter o histórico do aluno preciso.
        </div>
      </div>
    </div>

    <ToastStack :toasts="toasts" />
  </div>
</template>

<style scoped>
/* docs/adr/0019 - "Atendimento em" (fato do mundo) vs "registrado em" (fato do sistema) */
.detail-header-faint { color: var(--color-text-faint); font-weight: 400; }
.field-hint { display: block; margin-top: 4px; font-size: 11.5px; color: var(--color-text-faint); }

/* No mobile a coluna única fica: fila primeiro (pra escolher o relato),
   depois o detalhe; as "Dicas" saem de cena. */
@media (max-width: 760px) {
  .revisao-grid { display: flex; flex-direction: column; gap: 14px; }
  .revisao-lateral { order: -1; }
  .revisao-lateral .card { margin-bottom: 0 !important; }
  .revisao-dicas { display: none; }
  .revisao-card { padding: 16px 14px; }
  .revisao-source { flex-wrap: wrap; }
  .revisao-source-toggle { margin-left: 0; }
  .detail-header { gap: 12px; }
}
</style>
