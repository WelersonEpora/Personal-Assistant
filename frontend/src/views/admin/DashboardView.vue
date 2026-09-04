<script setup>
import { ref, computed, onMounted } from 'vue'
import painelService from '../../services/painel.service.js'
import registrosService from '../../services/registros.service.js'
import { statusMeta, corParaId, formatarDataHora } from '../../utils/registroStatus.js'
import { formatarDataAvaliacao, rotuloMesAno } from '../../utils/avaliacaoFisica.js'
import { useToasts } from '../../composables/useToasts.js'
import ToastStack from '../../components/ToastStack.vue'
import PainelListaAlunos from '../../components/dashboard/PainelListaAlunos.vue'

// Dashboard do /admin (docs/adr/0017): um resumo agregado vindo de
// GET /api/v1/painel - antes isto baixava a lista inteira de relatos e
// calculava tudo no navegador, e só enxergava o pipeline de relatos.
const { toasts, showToast } = useToasts()
const painel = ref(null)
const carregando = ref(true)

async function carregar() {
  carregando.value = true
  try {
    painel.value = await painelService.obter()
  } finally {
    carregando.value = false
  }
}
onMounted(carregar)

const nomeUsuario = computed(() => {
  try {
    return JSON.parse(localStorage.getItem('personal_assistant_usuario') || 'null')?.nome?.split(' ')[0] || ''
  } catch (_err) {
    return ''
  }
})

const resumo = computed(() => painel.value?.resumo)
const acao = computed(() => painel.value?.acao_necessaria)
const panorama = computed(() => painel.value?.panorama)

// Legenda de cada card do panorama: o critério, vindo dos limiares do
// payload (docs/adr/0017) pra nunca desencontrar do backend.
const legendas = computed(() => {
  const l = panorama.value?.limiares
  if (!l) return {}
  const meses = Math.round(l.dias_avaliacao_fisica_vencida / 30)
  return {
    semFicha: 'nenhuma ficha marcada como ativa',
    fichaAntiga: `ativa há mais de ${l.semanas_ficha_antiga} semanas`,
    avaliacaoVencida: `sem avaliar há mais de ${meses} ${meses === 1 ? 'mês' : 'meses'}`,
    aniversariantes: `nos próximos ${l.janela_aniversariantes_dias} dias`
  }
})

const cicloMesRotulo = computed(() => {
  const am = resumo.value?.ciclo_mensal?.ano_mes
  return am ? rotuloMesAno(`${am}-01`) : ''
})

const temAcao = computed(() => {
  const a = acao.value
  return !!a && (
    a.relatos_aguardando_revisao.total ||
    a.relatos_com_erro.total ||
    a.avaliacoes_mensais_falha.total ||
    a.alunos_sem_relato.total ||
    resumo.value?.em_processamento
  )
})

const reprocessados = ref(new Set())
async function reprocessar(relato) {
  try {
    await registrosService.reprocessar(relato.id)
    reprocessados.value = new Set(reprocessados.value).add(relato.id)
    showToast('Relato reenviado para a IA.', 'neutral')
  } catch (_err) {
    showToast('Não foi possível reprocessar o relato.', 'warning')
  }
}

// --- panorama: texto auxiliar por linha ---------------------------------
function humanizarDias(dias) {
  if (dias < 60) return `há ${dias} dia${dias > 1 ? 's' : ''}`
  if (dias < 730) return `há ${Math.round(dias / 30)} meses`
  return `há ${Math.floor(dias / 365)} ano${dias >= 730 ? 's' : ''}`
}
function textoAvaliacao(aluno) {
  if (!aluno.ultima_avaliacao_fisica) return 'nunca avaliado'
  return `última ${formatarDataAvaliacao(aluno.ultima_avaliacao_fisica)} · ${humanizarDias(aluno.dias)}`
}
function textoAniversario(aluno) {
  const ddmm = formatarDataAvaliacao(aluno.data_nascimento).slice(0, 5)
  if (aluno.dias <= 0) return `🎉 hoje (${ddmm})`
  return `${ddmm} · em ${aluno.dias} dia${aluno.dias > 1 ? 's' : ''}`
}

// --- atividade recente -------------------------------------------------
const FEED_ICONE = {
  relato: '🎙️',
  avaliacao_fisica: '🩺',
  ficha_treino: '📋',
  avaliacao_mensal: '📊'
}
function descricaoEvento(ev) {
  if (ev.tipo === 'relato') {
    const quando = ev.dados.data_atendimento ? ` (atendimento ${formatarDataAvaliacao(ev.dados.data_atendimento)})` : ''
    return `${ev.dados.titulo || 'Relato'}${quando}`
  }
  if (ev.tipo === 'avaliacao_fisica') return `Avaliação física de ${formatarDataAvaliacao(ev.dados.data)}`
  if (ev.tipo === 'ficha_treino') return ev.dados.ativo ? 'Nova ficha de treino' : 'Ficha de treino substituída'
  if (ev.tipo === 'avaliacao_mensal') return `Acompanhamento de ${rotuloMesAno(`${ev.dados.ano_mes}-01`)}`
  return ''
}
</script>

<template>
  <div>
    <div class="view-header">
      <div>
        <h1>Olá{{ nomeUsuario ? ', ' + nomeUsuario : '' }} 👋</h1>
        <p>Aqui está o resumo do seu dia.</p>
      </div>
    </div>

    <div v-if="carregando && !painel" class="empty-state">Carregando…</div>

    <template v-else-if="painel">
      <!-- Ação necessária: só aparece quando há algo pendente -->
      <div v-if="temAcao" class="card acao-card">
        <div class="card-header"><h3>⚡ Ação necessária</h3></div>

        <router-link
          v-if="acao.relatos_aguardando_revisao.total"
          class="list-row row-clickable acao-row"
          :to="{ name: 'admin-revisao' }"
        >
          <span class="acao-row-icone">📝</span>
          <span class="list-row-body">
            <span class="list-row-title">{{ acao.relatos_aguardando_revisao.total }} relato(s) aguardando revisão</span>
            <span class="list-row-sub">{{ acao.relatos_aguardando_revisao.itens.map((r) => r.aluno?.nome).filter(Boolean).join(', ') }}</span>
          </span>
          <span class="badge badge-primary">Revisar</span>
        </router-link>

        <div v-for="relato in acao.relatos_com_erro.itens" :key="relato.id" class="list-row acao-row">
          <span class="acao-row-icone">⚠️</span>
          <span class="list-row-body">
            <span class="list-row-title">{{ relato.aluno?.nome }} — {{ statusMeta(relato.status).label }}</span>
            <span class="list-row-sub">{{ relato.titulo || 'Relato' }}</span>
          </span>
          <button
            v-if="!reprocessados.has(relato.id)"
            type="button"
            class="btn btn-ghost btn-sm"
            @click="reprocessar(relato)"
          >
            🔁 Reprocessar
          </button>
          <span v-else class="badge badge-info">Reenviado</span>
        </div>

        <router-link
          v-if="acao.avaliacoes_mensais_falha.total"
          class="list-row row-clickable acao-row"
          :to="acao.avaliacoes_mensais_falha.itens[0]?.aluno
            ? { name: 'admin-aluno-detalhe', params: { id: acao.avaliacoes_mensais_falha.itens[0].aluno.id } }
            : { name: 'admin-alunos' }"
        >
          <span class="acao-row-icone">📊</span>
          <span class="list-row-body">
            <span class="list-row-title">{{ acao.avaliacoes_mensais_falha.total }} acompanhamento(s) mensal(is) falharam</span>
            <span class="list-row-sub">{{ acao.avaliacoes_mensais_falha.itens.map((a) => a.aluno?.nome).filter(Boolean).join(', ') }} — gerar de novo na tela do aluno</span>
          </span>
        </router-link>

        <router-link
          v-if="acao.alunos_sem_relato.total"
          class="list-row row-clickable acao-row"
          :to="{ name: 'admin-alunos' }"
        >
          <span class="acao-row-icone">🕰️</span>
          <span class="list-row-body">
            <span class="list-row-title">{{ acao.alunos_sem_relato.total }} aluno(s) ativo(s) sem relato recente</span>
            <span class="list-row-sub">{{ acao.alunos_sem_relato.itens.map((a) => a.nome).join(', ') }}</span>
          </span>
        </router-link>

        <div v-if="resumo.em_processamento" class="list-row acao-row acao-row-info">
          <span class="acao-row-icone">⏳</span>
          <span class="list-row-body">
            <span class="list-row-title">{{ resumo.em_processamento }} relato(s) em processamento pela IA</span>
            <span class="list-row-sub">Transcrição/interpretação em andamento — a fila de revisão atualiza sozinha.</span>
          </span>
        </div>
      </div>

      <!-- KPIs -->
      <div class="kpi-grid">
        <div class="card kpi-card">
          <div class="kpi-label">Alunos ativos</div>
          <div class="kpi-value">{{ resumo.alunos_ativos }}</div>
          <div class="kpi-sub">de {{ resumo.alunos_total }} cadastrado(s)</div>
        </div>
        <div class="card kpi-card">
          <div class="kpi-label">Relatos confirmados · 7 dias</div>
          <div class="kpi-value">{{ resumo.relatos_confirmados_7d }}</div>
          <div class="kpi-sub up">{{ resumo.relatos_confirmados_30d }} no total dos últimos 30 dias</div>
        </div>
        <div class="card kpi-card">
          <div class="kpi-label">Relatos capturados · 30 dias</div>
          <div class="kpi-value">{{ resumo.relatos_capturados_30d }}</div>
          <div class="kpi-sub">Registros recebidos do celular</div>
        </div>
        <div class="card kpi-card">
          <div class="kpi-label">Acompanhamento {{ cicloMesRotulo }}</div>
          <div class="kpi-value">{{ resumo.ciclo_mensal.gerados }}<span class="kpi-value-sub">/{{ resumo.ciclo_mensal.alunos_ativos }}</span></div>
          <div class="kpi-sub" :class="{ warn: resumo.ciclo_mensal.pendentes }">
            {{ resumo.ciclo_mensal.pendentes }} pendente(s) ·
            {{ resumo.ciclo_mensal.dados_insuficientes }} sem dados
          </div>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="painel-coluna">
          <div class="painel-secao-titulo">Panorama dos alunos</div>
          <PainelListaAlunos
            titulo="Sem ficha de treino ativa"
            icone="📋"
            aba="ficha"
            :descricao="legendas.semFicha"
            :itens="panorama.sem_ficha_ativa.itens"
            :total="panorama.sem_ficha_ativa.total"
            vazio="Todos os alunos ativos têm ficha."
          />
          <PainelListaAlunos
            titulo="Ficha de treino antiga"
            icone="🗓️"
            aba="ficha"
            :descricao="legendas.fichaAntiga"
            :itens="panorama.ficha_antiga.itens"
            :total="panorama.ficha_antiga.total"
            :sub="(a) => `ativa há ${Math.floor(a.dias / 7)} semanas`"
            vazio="Nenhuma ficha antiga."
          />
          <PainelListaAlunos
            titulo="Avaliação física vencida"
            icone="🩺"
            aba="avaliacoes"
            :descricao="legendas.avaliacaoVencida"
            :itens="panorama.avaliacao_fisica_vencida.itens"
            :total="panorama.avaliacao_fisica_vencida.total"
            :sub="textoAvaliacao"
            vazio="Nenhuma avaliação vencida."
          />
          <PainelListaAlunos
            titulo="Aniversariantes"
            icone="🎂"
            :descricao="legendas.aniversariantes"
            :itens="panorama.aniversariantes.itens"
            :total="panorama.aniversariantes.total"
            :sub="textoAniversario"
            vazio="Ninguém faz aniversário nos próximos 30 dias."
          />
        </div>

        <div class="painel-coluna">
          <div class="painel-secao-titulo">Atividade recente</div>
          <div class="card">
            <div v-for="(ev, i) in painel.atividade_recente" :key="i" class="sidebar-card-item">
              <span class="dot" :style="{ background: corParaId(ev.aluno?.id) }"></span>
              <span>
                <strong>{{ ev.aluno?.nome || 'Aluno' }}</strong>
                — {{ FEED_ICONE[ev.tipo] }} {{ descricaoEvento(ev) }}
                · {{ formatarDataHora(ev.quando) }}<br />
                <span
                  v-if="ev.tipo === 'relato'"
                  class="badge"
                  :class="'badge-' + statusMeta(ev.dados.status).badge"
                  style="margin-top: 4px;"
                >
                  {{ statusMeta(ev.dados.status).icon }} {{ statusMeta(ev.dados.status).label }}
                </span>
              </span>
            </div>
            <div v-if="!painel.atividade_recente.length" class="empty-state" style="padding: 26px;">
              Nenhuma atividade ainda.
            </div>
          </div>

          <div class="painel-catalogo">
            {{ painel.catalogo.exercicios }} exercício(s) no catálogo ·
            {{ painel.catalogo.fichas_ativas }} ficha(s) ativa(s)
          </div>
        </div>
      </div>
    </template>

    <ToastStack :toasts="toasts" />
  </div>
</template>

<style scoped>
.acao-card { margin-bottom: 22px; border-color: var(--color-warning-light); }
.acao-row { gap: 12px; text-decoration: none; color: inherit; }
.acao-row .list-row-body { display: flex; flex-direction: column; }
.acao-row-icone { font-size: 16px; width: 22px; text-align: center; flex: none; }
.acao-row-info .list-row-title { font-weight: 600; color: var(--color-text-secondary); }
.btn-sm { padding: 5px 10px; font-size: 12px; }

.kpi-value-sub { font-size: 16px; font-weight: 700; color: var(--color-text-faint); }

.painel-coluna { display: flex; flex-direction: column; gap: 14px; }
.painel-secao-titulo {
  font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em;
  color: var(--color-text-faint);
}
.painel-catalogo {
  font-size: 12.5px; color: var(--color-text-faint); padding: 2px 4px;
}
</style>
