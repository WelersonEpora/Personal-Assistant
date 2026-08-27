<script setup>
import { ref, computed, onMounted } from 'vue'
import alunosService from '../../services/alunos.service.js'
import avaliacoesMensaisService from '../../services/avaliacoesMensais.service.js'
import analisesSobDemandaService from '../../services/analisesSobDemanda.service.js'
import { formatarData, formatarDataHora } from '../../utils/registroStatus.js'
import { useToasts } from '../../composables/useToasts.js'
import ToastStack from '../../components/ToastStack.vue'

const props = defineProps({ id: { type: String, required: true } })
const { toasts, showToast } = useToasts()

const aluno = ref(null)
const avaliacoes = ref([])
const carregando = ref(true)
const gerando = ref(false)
const expandidoMes = ref(null)
const detalhe = ref(null)
const carregandoDetalhe = ref(false)

// Análise sob demanda (docs/adr/0015) - separada do ciclo mensal.
const analises = ref([])
const disponibilidade = ref(null)
const solicitandoAnalise = ref(false)
const analiseExpandidaId = ref(null)
// Mensagem quando a IA não chega a produzir análise (sem relatos recentes /
// dados insuficientes): nada é registrado nem consome a janela de 7 dias.
const mensagemInsuficiente = ref('')

// Mês de referência default: o mês anterior (o que o job mensal fecha).
function mesAnterior() {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const mesSelecionado = ref(mesAnterior())

const STATUS_META = {
  gerada: { label: 'Gerada', badge: 'badge-success' },
  dados_insuficientes: { label: 'Dados insuficientes', badge: 'badge-neutral' },
  falha: { label: 'Falha ao gerar', badge: 'badge-danger' }
}
function statusMeta(status) {
  return STATUS_META[status] || { label: status, badge: 'badge-neutral' }
}

function rotuloMes(anoMes) {
  if (!anoMes) return ''
  const [ano, mes] = anoMes.split('-')
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${nomes[Number(mes) - 1]}/${ano}`
}

function classeConfianca(nivel) {
  return nivel === 'alta' ? 'alta' : nivel === 'baixa' ? 'baixa' : 'media'
}

const jaExisteMesSelecionado = computed(() => avaliacoes.value.some((a) => a.ano_mes === mesSelecionado.value))

async function carregarAnalises() {
  const { analises: lista, disponibilidade: disp } = await analisesSobDemandaService.listar(props.id)
  analises.value = lista
  disponibilidade.value = disp
}

async function carregar() {
  carregando.value = true
  try {
    const [dadosAluno, lista] = await Promise.all([
      alunosService.obter(props.id),
      avaliacoesMensaisService.listarPorAluno(props.id),
      carregarAnalises()
    ])
    aluno.value = dadosAluno
    avaliacoes.value = lista
  } finally {
    carregando.value = false
  }
}
onMounted(carregar)

async function solicitarAnalise() {
  solicitandoAnalise.value = true
  mensagemInsuficiente.value = ''
  try {
    const resultado = await analisesSobDemandaService.solicitar(props.id)

    // Nada foi produzido: não entra no histórico e não consome a janela.
    if (resultado.persistida === false) {
      mensagemInsuficiente.value = resultado.mensagem
      showToast('Dados insuficientes para uma análise — nada foi consumido.', 'neutral')
      return
    }

    await carregarAnalises()
    analiseExpandidaId.value = resultado.id
    if (resultado.status === 'gerada') {
      showToast('Análise gerada.', 'success')
    } else {
      showToast('A IA não conseguiu gerar a análise. Tente novamente em instantes.', 'warning')
    }
  } catch (err) {
    const msg = err?.response?.data?.error?.message || 'Não foi possível solicitar a análise.'
    showToast(msg, 'warning')
    await carregarAnalises()
  } finally {
    solicitandoAnalise.value = false
  }
}

function alternarAnalise(id) {
  analiseExpandidaId.value = analiseExpandidaId.value === id ? null : id
}

async function abrirDetalhe(anoMes) {
  if (expandidoMes.value === anoMes) {
    expandidoMes.value = null
    detalhe.value = null
    return
  }
  expandidoMes.value = anoMes
  detalhe.value = null
  carregandoDetalhe.value = true
  try {
    detalhe.value = await avaliacoesMensaisService.obter(props.id, anoMes)
  } catch (_err) {
    showToast('Não foi possível carregar a avaliação deste mês.', 'warning')
    expandidoMes.value = null
  } finally {
    carregandoDetalhe.value = false
  }
}

async function gerar() {
  gerando.value = true
  try {
    const avaliacao = await avaliacoesMensaisService.gerar(props.id, mesSelecionado.value)
    await carregar()
    expandidoMes.value = null
    await abrirDetalhe(avaliacao.ano_mes)
    if (avaliacao.status === 'gerada') {
      showToast(`Avaliação de ${rotuloMes(avaliacao.ano_mes)} gerada.`, 'success')
    } else if (avaliacao.status === 'dados_insuficientes') {
      showToast(`Menos de 5 relatos confirmados em ${rotuloMes(avaliacao.ano_mes)} — ciclo registrado como dados insuficientes.`, 'neutral')
    } else {
      showToast('A IA não conseguiu gerar a avaliação. Tente novamente em instantes.', 'warning')
    }
  } catch (err) {
    const msg = err?.response?.data?.error?.message || 'Não foi possível gerar a avaliação.'
    showToast(msg, 'warning')
  } finally {
    gerando.value = false
  }
}

const avaliacaoJson = computed(() => detalhe.value?.avaliacao_json || null)
const contexto = computed(() => detalhe.value?.contexto_consolidado_json || null)
</script>

<template>
  <div v-if="aluno">
    <router-link class="detail-back" :to="{ name: 'admin-aluno-detalhe', params: { id: props.id } }">← Voltar para {{ aluno.nome }}</router-link>

    <div class="view-header">
      <div>
        <h1>Acompanhamento</h1>
        <p>{{ aluno.nome }}</p>
      </div>
    </div>

    <div class="exercise-obs" style="margin-bottom: 22px;">
      As análises abaixo são <strong>apoio técnico da IA</strong> à sua avaliação — não são dado oficial e não
      substituem sua decisão profissional. Para corrigir ou complementar algo, registre um novo relato normalmente.
    </div>

    <!-- ================= Análise sob demanda ================= -->
    <div class="card card-pad" style="margin-bottom: 16px;">
      <div style="font-size: 15px; font-weight: 700; margin-bottom: 4px;">🔎 Análise sob demanda</div>
      <p class="list-row-sub" style="margin-bottom: 12px;">
        Uma leitura pontual da IA sobre o momento atual do aluno, a partir dos relatos confirmados ainda não
        fechados no ciclo mensal. Não substitui o acompanhamento mensal nem altera o contexto consolidado.
        Limite de 1 análise a cada 7 dias por aluno.
      </p>
      <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="solicitandoAnalise || (disponibilidade && !disponibilidade.disponivel_agora)"
          @click="solicitarAnalise"
        >
          {{ solicitandoAnalise ? 'Analisando…' : 'Solicitar análise' }}
        </button>
        <span v-if="disponibilidade && !disponibilidade.disponivel_agora" class="list-row-sub">
          Próxima análise disponível em <strong>{{ formatarDataHora(disponibilidade.proxima_disponivel_em) }}</strong>.
        </span>
        <span v-else-if="disponibilidade" class="list-row-sub">Disponível agora.</span>
      </div>

      <div v-if="mensagemInsuficiente" class="exercise-obs" style="margin-top: 12px;">
        {{ mensagemInsuficiente }}
      </div>
    </div>

    <div v-if="analises.length" class="registros-list" style="margin-bottom: 28px;">
      <div v-for="analise in analises" :key="analise.id" class="card registro-card">
        <div class="registro-card-head row-clickable" @click="alternarAnalise(analise.id)">
          <div class="registro-card-who">
            <span class="list-row-title">Análise de {{ formatarDataHora(analise.solicitada_em) }}</span>
            <span class="list-row-sub">{{ analise.relatos_considerados }} relato(s) recente(s) considerado(s)</span>
          </div>
          <span class="badge" :class="statusMeta(analise.status).badge">{{ statusMeta(analise.status).label }}</span>
        </div>

        <div v-if="analiseExpandidaId === analise.id" class="transcript-box open" @click.stop>
          <div v-if="analise.status === 'falha'" class="exercise-obs" style="color: var(--color-danger); background: var(--color-danger-light);">
            A IA não conseguiu gerar esta análise.<template v-if="analise.erro"> ({{ analise.erro }})</template>
          </div>
          <template v-else-if="analise.analise_json">
            <div class="exercise-obs" style="margin-bottom: 16px;">{{ analise.analise_json.resumo_geral }}</div>
            <template v-if="!analise.analise_json.dados_insuficientes">
              <p class="acomp-section">Leitura por dimensão</p>
              <div v-if="!(analise.analise_json.dimensoes || []).length" class="empty-state" style="padding: 16px;">Sem dimensões avaliadas.</div>
              <div v-for="(dim, i) in analise.analise_json.dimensoes || []" :key="i" class="exercise-card">
                <div class="exercise-card-top">
                  <div>
                    <div class="exercise-name">{{ dim.nome }}</div>
                    <div class="exercise-meta">{{ dim.situacao_atual }}</div>
                  </div>
                  <span class="confidence-note" :class="classeConfianca(dim.confianca)">● {{ dim.confianca }}</span>
                </div>
                <div style="font-size: 13px; margin-top: 8px;">{{ dim.evolucao_recente }}</div>
                <ul v-if="(dim.evidencias || []).length" class="acomp-evidencias">
                  <li v-for="(ev, j) in dim.evidencias" :key="j">
                    "{{ ev.texto }}"
                    <span class="list-row-sub">— {{ ev.origem }}<template v-if="ev.data"> · {{ ev.data }}</template></span>
                  </li>
                </ul>
              </div>

              <template v-if="(analise.analise_json.destaques || []).length">
                <p class="acomp-section">Destaques</p>
                <ul class="acomp-lista"><li v-for="(d, i) in analise.analise_json.destaques" :key="i">{{ d }}</li></ul>
              </template>
              <template v-if="(analise.analise_json.alertas || []).length">
                <p class="acomp-section">Alertas</p>
                <ul class="acomp-lista">
                  <li v-for="(a, i) in analise.analise_json.alertas" :key="i">
                    <span class="confidence-note" :class="classeConfianca(a.gravidade)" style="display: inline-flex;">●</span>
                    {{ a.texto }}
                  </li>
                </ul>
              </template>
              <template v-if="(analise.analise_json.recomendacoes || []).length">
                <p class="acomp-section">Recomendações</p>
                <ul class="acomp-lista"><li v-for="(r, i) in analise.analise_json.recomendacoes" :key="i">{{ r }}</li></ul>
              </template>
              <template v-if="(analise.analise_json.pendencias_confirmacao || []).length">
                <p class="acomp-section">Pendências / a confirmar</p>
                <ul class="acomp-lista">
                  <li v-for="(p, i) in analise.analise_json.pendencias_confirmacao" :key="i">
                    {{ p.afirmacao }}
                    <span class="list-row-sub">— {{ p.motivo }}<template v-if="p.confianca"> · confiança {{ p.confianca }}</template></span>
                  </li>
                </ul>
              </template>
            </template>
          </template>
        </div>
      </div>
    </div>

    <!-- ================= Acompanhamento mensal ================= -->
    <p style="font-size: 12px; font-weight: 700; color: var(--color-text-faint); text-transform: uppercase; letter-spacing: .03em; margin: 0 0 10px;">
      Acompanhamento mensal
    </p>

    <div class="card card-pad" style="margin-bottom: 26px;">
      <div style="font-size: 15px; font-weight: 700; margin-bottom: 4px;">Gerar avaliação de um mês</div>
      <p class="list-row-sub" style="margin-bottom: 12px;">
        Usa os relatos confirmados no mês escolhido + o contexto consolidado do mês anterior.
        Precisa de pelo menos 5 relatos confirmados. Gerar de novo um mês já feito substitui a avaliação.
      </p>
      <div style="display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap;">
        <div class="form-field">
          <label>Mês de referência</label>
          <input v-model="mesSelecionado" type="month" />
        </div>
        <button type="button" class="btn btn-primary" :disabled="gerando" @click="gerar">
          {{ gerando ? 'Gerando…' : jaExisteMesSelecionado ? 'Regenerar este mês' : 'Gerar avaliação' }}
        </button>
      </div>
    </div>

    <p style="font-size: 12px; font-weight: 700; color: var(--color-text-faint); text-transform: uppercase; letter-spacing: .03em; margin: 0 0 10px;">
      Avaliações geradas
    </p>
    <div v-if="carregando" class="card empty-state">Carregando…</div>
    <div v-else-if="!avaliacoes.length" class="card empty-state">
      <div class="empty-state-icon">📈</div>Nenhuma avaliação mensal ainda.
    </div>

    <div class="registros-list">
      <div v-for="avaliacao in avaliacoes" :key="avaliacao.ano_mes" class="card registro-card">
        <div class="registro-card-head row-clickable" @click="abrirDetalhe(avaliacao.ano_mes)">
          <div class="registro-card-who">
            <span class="list-row-title">{{ rotuloMes(avaliacao.ano_mes) }}</span>
            <span class="list-row-sub">
              {{ avaliacao.relatos_considerados }} relato(s) confirmado(s) ·
              gerada em {{ formatarData(avaliacao.gerada_em) }}
              <template v-if="avaliacao.origem === 'manual'"> · manual</template>
            </span>
          </div>
          <span class="badge" :class="statusMeta(avaliacao.status).badge">{{ statusMeta(avaliacao.status).label }}</span>
        </div>

        <div v-if="expandidoMes === avaliacao.ano_mes" class="transcript-box open" @click.stop>
          <div v-if="carregandoDetalhe" class="empty-state" style="padding: 20px;">Carregando…</div>

          <template v-else-if="detalhe">
            <div v-if="detalhe.status === 'falha'" class="exercise-obs" style="color: var(--color-danger); background: var(--color-danger-light);">
              A IA não conseguiu gerar esta avaliação.<template v-if="detalhe.erro"> ({{ detalhe.erro }})</template>
              Você pode tentar regenerar este mês acima.
            </div>

            <!-- ===== Avaliação Mensal ===== -->
            <template v-if="avaliacaoJson">
              <div class="exercise-obs" style="margin-bottom: 16px;">{{ avaliacaoJson.resumo_geral }}</div>

              <template v-if="!avaliacaoJson.dados_insuficientes">
                <p class="acomp-section">Evolução por dimensão</p>
                <div v-if="!(avaliacaoJson.dimensoes || []).length" class="empty-state" style="padding: 16px;">Sem dimensões avaliadas.</div>
                <div v-for="(dim, i) in avaliacaoJson.dimensoes || []" :key="i" class="exercise-card">
                  <div class="exercise-card-top">
                    <div>
                      <div class="exercise-name">{{ dim.nome }}</div>
                      <div class="exercise-meta">{{ dim.situacao_atual }}</div>
                    </div>
                    <span class="confidence-note" :class="classeConfianca(dim.confianca)">● {{ dim.confianca }}</span>
                  </div>
                  <div style="font-size: 13px; margin-top: 8px;">{{ dim.evolucao_no_mes }}</div>
                  <ul v-if="(dim.evidencias || []).length" class="acomp-evidencias">
                    <li v-for="(ev, j) in dim.evidencias" :key="j">
                      "{{ ev.texto }}"
                      <span class="list-row-sub">— {{ ev.origem }}<template v-if="ev.data"> · {{ ev.data }}</template></span>
                    </li>
                  </ul>
                </div>

                <template v-if="(avaliacaoJson.destaques || []).length">
                  <p class="acomp-section">Destaques</p>
                  <ul class="acomp-lista"><li v-for="(d, i) in avaliacaoJson.destaques" :key="i">{{ d }}</li></ul>
                </template>

                <template v-if="(avaliacaoJson.alertas || []).length">
                  <p class="acomp-section">Alertas</p>
                  <ul class="acomp-lista">
                    <li v-for="(a, i) in avaliacaoJson.alertas" :key="i">
                      <span class="confidence-note" :class="classeConfianca(a.gravidade)" style="display: inline-flex;">●</span>
                      {{ a.texto }}
                    </li>
                  </ul>
                </template>

                <template v-if="(avaliacaoJson.recomendacoes || []).length">
                  <p class="acomp-section">Recomendações</p>
                  <ul class="acomp-lista"><li v-for="(r, i) in avaliacaoJson.recomendacoes" :key="i">{{ r }}</li></ul>
                </template>

                <template v-if="(avaliacaoJson.pendencias_confirmacao || []).length">
                  <p class="acomp-section">Pendências / a confirmar</p>
                  <ul class="acomp-lista">
                    <li v-for="(p, i) in avaliacaoJson.pendencias_confirmacao" :key="i">
                      {{ p.afirmacao }}
                      <span class="list-row-sub">— {{ p.motivo }}<template v-if="p.confianca"> · confiança {{ p.confianca }}</template></span>
                    </li>
                  </ul>
                </template>

                <template v-if="(avaliacaoJson.mudancas_vs_mes_anterior || []).length">
                  <p class="acomp-section">Mudanças em relação ao mês anterior</p>
                  <ul class="acomp-lista"><li v-for="(m, i) in avaliacaoJson.mudancas_vs_mes_anterior" :key="i">{{ m }}</li></ul>
                </template>
              </template>
            </template>

            <!-- ===== Contexto Consolidado ===== -->
            <template v-if="contexto">
              <p class="acomp-section" style="border-top: 1px solid var(--color-border); padding-top: 16px;">
                Contexto consolidado — entrada da IA no próximo ciclo
              </p>
              <p class="list-row-sub" style="margin-bottom: 12px;">Cobre até {{ rotuloMes(contexto.cobre_ate) }} · gerado em {{ contexto.gerado_em }}</p>

              <div v-if="(contexto.linha_de_base || []).length" class="acomp-bloco">
                <div class="acomp-bloco-titulo">Linha de base</div>
                <div v-for="(item, i) in contexto.linha_de_base" :key="i" class="acomp-item">
                  <strong>{{ item.rotulo }}:</strong> {{ item.valor }}
                  <span class="list-row-sub">[{{ item.tipo }}]<template v-if="item.origem"> · {{ item.origem }}</template><template v-if="item.confianca"> · {{ item.confianca }}</template></span>
                </div>
              </div>

              <div v-if="(contexto.estado_atual || []).length" class="acomp-bloco">
                <div class="acomp-bloco-titulo">Estado atual</div>
                <div v-for="(item, i) in contexto.estado_atual" :key="i" class="acomp-item">
                  <strong>{{ item.dimensao }}:</strong> {{ item.situacao }}
                  <span class="list-row-sub">[{{ item.tipo }}]<template v-if="item.atualizado_em"> · {{ item.atualizado_em }}</template></span>
                </div>
              </div>

              <div v-if="(contexto.evolucao_relevante || []).length" class="acomp-bloco">
                <div class="acomp-bloco-titulo">Evolução relevante</div>
                <div v-for="(item, i) in contexto.evolucao_relevante" :key="i" class="acomp-item">
                  <strong>{{ item.dimensao }}:</strong> {{ item.trajetoria }}
                  <span v-if="item.confianca" class="list-row-sub">· {{ item.confianca }}</span>
                </div>
              </div>

              <div v-if="(contexto.marcos || []).length" class="acomp-bloco">
                <div class="acomp-bloco-titulo">Marcos</div>
                <div v-for="(item, i) in contexto.marcos" :key="i" class="acomp-item">
                  <strong>{{ item.data }}</strong> — {{ item.evento }}
                  <span v-if="item.origem" class="list-row-sub">· {{ item.origem }}</span>
                </div>
              </div>

              <div v-if="(contexto.hipoteses_abertas || []).length" class="acomp-bloco">
                <div class="acomp-bloco-titulo">Hipóteses abertas</div>
                <div v-for="(item, i) in contexto.hipoteses_abertas" :key="i" class="acomp-item">
                  {{ item.hipotese }}
                  <span class="list-row-sub">
                    <template v-if="item.confianca">· {{ item.confianca }}</template>
                    <template v-if="item.status"> · {{ item.status }}</template>
                    <template v-if="item.ciclos_sem_reforco != null"> · {{ item.ciclos_sem_reforco }} ciclo(s) sem reforço</template>
                  </span>
                </div>
              </div>

              <div v-if="(contexto.lacunas || []).length" class="acomp-bloco">
                <div class="acomp-bloco-titulo">Lacunas</div>
                <ul class="acomp-lista"><li v-for="(l, i) in contexto.lacunas" :key="i">{{ l }}</li></ul>
              </div>
            </template>
          </template>
        </div>
      </div>
    </div>

    <ToastStack :toasts="toasts" />
  </div>
  <div v-else-if="!carregando" class="empty-state">Aluno não encontrado.</div>
</template>

<style scoped>
.acomp-section {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-faint);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin: 18px 0 10px;
}
.acomp-lista {
  list-style: disc;
  padding-left: 20px;
  font-size: 13px;
  line-height: 1.7;
}
.acomp-evidencias {
  list-style: none;
  padding-left: 0;
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--color-text-secondary);
  line-height: 1.6;
}
.acomp-bloco {
  margin-bottom: 14px;
}
.acomp-bloco-titulo {
  font-size: 12.5px;
  font-weight: 700;
  margin-bottom: 4px;
}
.acomp-item {
  font-size: 13px;
  line-height: 1.6;
  padding: 3px 0;
}
</style>
