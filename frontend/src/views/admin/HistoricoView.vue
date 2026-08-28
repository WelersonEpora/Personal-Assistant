<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import registrosService from '../../services/registros.service.js'
import alunosService from '../../services/alunos.service.js'
import { corParaId, iniciais, formatarData, formatarDataAtendimento } from '../../utils/registroStatus.js'
import SeletorPeriodo from '../../components/SeletorPeriodo.vue'

const route = useRoute()

const registros = ref([])
const alunos = ref([])
const carregando = ref(true)

// docs/adr/0020: o Histórico não baixa mais todos os confirmados de sempre -
// abre em "Últimos 90 dias" e filtra por janela de `data_atendimento` + aluno.
// Só relatos (`tipo = atendimento`); avaliação física tem a tela do aluno.
// Vindo do perfil do aluno com um Registro específico em mente, começa em
// "Tudo" para o alvo não cair fora da janela.
const periodo = ref(null) // { de, ate } - definido pelo SeletorPeriodo na montagem
const alunoId = ref('')
const presetInicial = route.query.registro ? 'tudo' : 'ultimos_90'

async function carregar() {
  if (!periodo.value) return
  carregando.value = true
  try {
    registros.value = await registrosService.listar({
      status: 'confirmado',
      tipo: 'atendimento',
      de: periodo.value.de || undefined,
      ate: periodo.value.ate || undefined,
      alunoId: alunoId.value || undefined
    })
  } finally {
    carregando.value = false
  }
  // Vindo do perfil do aluno (ver AlunoDetalheView) - expande e rola até o
  // Registro. Mesmo padrão de RegistrosView (a tela de detalhe virou expandir
  // a linha aqui).
  if (route.query.registro && registros.value.some((r) => r.id === route.query.registro)) {
    await alternarExpandido(registros.value.find((r) => r.id === route.query.registro))
    await nextTick()
    document.getElementById(`historico-${route.query.registro}`)?.scrollIntoView({ block: 'center' })
  }
}

function aoMudarPeriodo(intervalo) {
  periodo.value = intervalo
  carregar()
}

onMounted(async () => {
  try {
    alunos.value = await alunosService.listar()
  } catch (_err) {
    alunos.value = []
  }
})

const ordenados = computed(() =>
  [...registros.value].sort((a, b) => (a.validacao?.confirmado_em < b.validacao?.confirmado_em ? 1 : -1))
)

// Clicar no card expande/colapsa - `listar()` só traz entradas leves
// (id/tipo/ordem) e a validação (ver registro.repository.js), então ao
// expandir pela 1a vez busca o detalhe completo (transcrições/itens
// confirmados) e, para as entradas de áudio, o Blob sob demanda (mesmo
// padrão de RegistrosView/RevisaoView).
const expandidoId = ref(null)

async function alternarExpandido(registro) {
  expandidoId.value = expandidoId.value === registro.id ? null : registro.id
  if (expandidoId.value !== registro.id) return

  if (!registro.detalhado) {
    try {
      const detalhe = await registrosService.obter(registro.id)
      registro.entradas = detalhe.entradas || []
      registro.validacao = detalhe.validacao
      registro.detalhado = true
    } catch (_err) {
      return // sem detalhe disponível - fica só com o resumo do card
    }
  }

  await Promise.all(
    registro.entradas
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

function revogarAudios() {
  registros.value.forEach((registro) => {
    (registro.entradas || []).forEach((entrada) => {
      if (entrada.audioUrl) URL.revokeObjectURL(entrada.audioUrl)
    })
  })
}
onBeforeUnmount(revogarAudios)

function itensConfirmados(registro) {
  return registro.validacao?.payload_confirmado_json?.itens || []
}
function notaGeralConfirmada(registro) {
  return registro.validacao?.payload_confirmado_json?.notaGeral || ''
}
</script>

<template>
  <div>
    <div class="view-header">
      <div>
        <h1>Histórico</h1>
        <p>Registros já confirmados e salvos no perfil de cada aluno.</p>
      </div>
    </div>

    <div class="card card-pad hist-filtros">
      <SeletorPeriodo :inicial="presetInicial" @change="aoMudarPeriodo" />
      <div class="field-group hist-aluno">
        <label>Aluno</label>
        <select v-model="alunoId" @change="carregar">
          <option value="">Todos os alunos</option>
          <option v-for="a in alunos" :key="a.id" :value="a.id">{{ a.nome }}</option>
        </select>
      </div>
    </div>

    <div v-if="carregando && !registros.length" class="empty-state">Carregando…</div>

    <div v-else class="registros-list">
      <div
        v-for="registro in ordenados"
        :id="`historico-${registro.id}`"
        :key="registro.id"
        class="card registro-card row-clickable"
        @click="alternarExpandido(registro)"
      >
        <div class="registro-card-head">
          <div class="registro-card-who">
            <span class="avatar sz-sm" :style="{ background: corParaId(registro.aluno?.id) }">{{ iniciais(registro.aluno?.nome) }}</span>
            <div>
              <div class="list-row-title">{{ registro.aluno?.nome }} — {{ registro.titulo || 'Registro' }}</div>
              <div class="list-row-sub">
                Atendimento em {{ formatarDataAtendimento(registro.data_atendimento) }} ·
                confirmado em {{ formatarData(registro.validacao?.confirmado_em || registro.created_at) }} ·
                {{ registro.validacao?.payload_confirmado_json?.itens?.length || 0 }} item(ns)
              </div>
            </div>
          </div>
          <span class="badge badge-success">Confirmado</span>
        </div>

        <div v-if="expandidoId === registro.id" class="transcript-box open" @click.stop>
          <p style="font-size: 12px; font-weight: 700; color: var(--color-text-faint); text-transform: uppercase; letter-spacing: .03em; margin: 0 0 10px;">
            Entradas originais
          </p>
          <div v-for="entrada in registro.entradas || []" :key="entrada.id" class="source-entry">
            <span class="source-entry-icon">{{ entrada.tipo === 'audio' ? '🎙️' : '⌨️' }}</span>
            <div class="source-entry-body">
              <div class="source-entry-meta">{{ entrada.tipo === 'audio' ? `Áudio${entrada.duracao_segundos ? ' · ' + entrada.duracao_segundos + 's' : ''}` : 'Texto' }}</div>
              <template v-if="entrada.tipo === 'audio'">
                <audio v-if="entrada.audioUrl" :src="entrada.audioUrl" controls class="source-entry-audio"></audio>
                <span v-else class="source-entry-text" style="font-style: normal;">Áudio indisponível.</span>
                <div class="source-entry-text">
                  <template v-if="entrada.arquivoAudio?.transcricao?.texto">"{{ entrada.arquivoAudio.transcricao.texto }}"</template>
                  <span v-else style="font-style: normal; color: var(--color-text-faint);">Transcrição não disponível.</span>
                </div>
              </template>
              <div v-else class="source-entry-text">"{{ entrada.conteudo_texto }}"</div>
            </div>
          </div>

          <div v-if="notaGeralConfirmada(registro)" class="exercise-obs" style="margin-top: 14px;">Nota geral: {{ notaGeralConfirmada(registro) }}</div>

          <p style="font-size: 12px; font-weight: 700; color: var(--color-text-faint); text-transform: uppercase; letter-spacing: .03em; margin: 18px 0 10px;">
            Itens confirmados
          </p>
          <div v-if="!itensConfirmados(registro).length" class="empty-state" style="padding: 20px;">Nenhum item confirmado neste registro.</div>
          <div v-for="(item, indice) in itensConfirmados(registro)" :key="indice" class="exercise-card">
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

      <div v-if="!carregando && !ordenados.length" class="empty-state">Nenhum registro confirmado no período.</div>
    </div>
  </div>
</template>

<style scoped>
.hist-filtros {
  margin-bottom: 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.hist-aluno { max-width: 280px; }
.hist-aluno select { width: 100%; }
</style>
