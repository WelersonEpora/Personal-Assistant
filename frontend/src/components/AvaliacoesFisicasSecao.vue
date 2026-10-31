<script setup>
import { ref, computed, onMounted } from 'vue'
import avaliacoesFisicasService from '../services/avaliacoesFisicas.service.js'
import alunosService from '../services/alunos.service.js'
import { useToasts } from '../composables/useToasts.js'
import { useConfirm } from '../composables/useConfirm.js'
import ToastStack from './ToastStack.vue'
import AvaliacaoFisicaDetalhe from './avaliacaoFisica/AvaliacaoFisicaDetalhe.vue'
import AvaliacaoFisicaForm from './avaliacaoFisica/AvaliacaoFisicaForm.vue'
import AvaliacaoFisicaComparar from './avaliacaoFisica/AvaliacaoFisicaComparar.vue'
import SeloReferencia from './avaliacaoFisica/SeloReferencia.vue'
import ChevronExpandir from './ChevronExpandir.vue'
import { formatarDataAvaliacao } from '../utils/avaliacaoFisica.js'
import { classificar, contextoDoAluno } from '../utils/referenciasAvaliacaoFisica.js'

// Seção "Avaliações Físicas" da tela do aluno (docs/adr/0015 estendida, 0016):
// deixou de ser tela própria - vive num slot com abas no AlunoDetalheView. O
// "modo" (comparar / novo / editar) troca só o conteúdo da seção; o card de
// identidade e as abas continuam visíveis por cima.
const props = defineProps({ id: { type: String, required: true } })
const { toasts, showToast } = useToasts()
const { confirmar } = useConfirm()

const metricas = ref([])
const avaliacoes = ref([])
const aluno = ref(null)
const carregando = ref(true)
const salvandoDispensa = ref(false)

// Aluno que não faz avaliação física com o personal (docs/adr/0017): sai do
// alerta "avaliação física vencida" do painel. O histórico continua visível.
const dispensaAvaliacao = computed(() => aluno.value?.dispensa_avaliacao_fisica === true)

// 'lista' | 'comparar' | 'novo' | 'editar' - "ver" é expansão inline do card.
const modo = ref('lista')
const selecionada = ref(null)
const expandidoId = ref(null)

async function carregar() {
  carregando.value = true
  try {
    const [dadosMetricas, dadosAvaliacoes, dadosAluno] = await Promise.all([
      avaliacoesFisicasService.listarMetricas(),
      avaliacoesFisicasService.listar(props.id),
      alunosService.obter(props.id)
    ])
    metricas.value = dadosMetricas
    avaliacoes.value = dadosAvaliacoes
    aluno.value = dadosAluno
  } finally {
    carregando.value = false
  }
}
onMounted(carregar)

async function alternarDispensa() {
  const marcar = !dispensaAvaliacao.value
  salvandoDispensa.value = true
  try {
    aluno.value = await alunosService.atualizar(props.id, { dispensa_avaliacao_fisica: marcar })
    showToast(
      marcar ? 'Aluno marcado como “não faz avaliação física”.' : 'Avaliação física reativada para este aluno.',
      'neutral'
    )
  } catch (_err) {
    showToast('Não foi possível atualizar.', 'warning')
  } finally {
    salvandoDispensa.value = false
  }
}

// resumo da lista (medida principal): peso, IMC, % gordura, massa magra/gorda
function principal(av, codigo) {
  return (av.medidas || []).find((m) => m.metrica_codigo === codigo && m.principal)
}
function valorResumo(av, codigo) {
  const m = principal(av, codigo)
  if (!m) return '—'
  const casas = m.metrica?.casas_decimais ?? 1
  const n = Number(m.valor)
  return Number.isFinite(n) ? n.toFixed(casas) : m.valor
}

const RESUMO_CAMPOS = [
  { codigo: 'peso', rotulo: 'Peso', unidade: 'kg' },
  { codigo: 'imc', rotulo: 'IMC', unidade: '' },
  { codigo: 'percentual_gordura', rotulo: '% gordura', unidade: '' },
  { codigo: 'massa_magra', rotulo: 'Massa magra', unidade: 'kg' },
  { codigo: 'massa_gorda', rotulo: 'Massa gorda', unidade: 'kg' }
]
// docs/adr/0031 - IMC e % de gordura levam a etiqueta da referência já no
// card fechado.
const RESUMO_COM_SELO = ['imc', 'percentual_gordura']
function resumoLinha(av) {
  const ctx = contextoDoAluno(aluno.value, av.data)
  return RESUMO_CAMPOS.map((c) => {
    const v = valorResumo(av, c.codigo)
    if (v === '—') return { codigo: c.codigo, texto: `${c.rotulo} —`, classificacao: null }
    const unidade = c.unidade ? ` ${c.unidade}` : ''
    const classificacao = RESUMO_COM_SELO.includes(c.codigo) ? classificar(c.codigo, v, ctx) : null
    return { codigo: c.codigo, texto: `${c.rotulo} ${v}${unidade}`, classificacao }
  })
}

const listaOrdenada = computed(() =>
  [...avaliacoes.value].sort((a, b) => String(b.data).localeCompare(String(a.data)))
)
// a lista é da mais recente para a mais antiga: a anterior é a seguinte
function anteriorDe(av) {
  const i = listaOrdenada.value.findIndex((x) => x.id === av.id)
  return listaOrdenada.value[i + 1] || null
}

function alternarExpandido(av) {
  expandidoId.value = expandidoId.value === av.id ? null : av.id
  abrirCodigo.value = null
}
// toque no selo do card fechado: abre o card já com a explicação da medida
const abrirCodigo = ref(null)
function abrirNaMedida(av, codigo) {
  expandidoId.value = av.id
  abrirCodigo.value = codigo
}
function abrirNovo() {
  selecionada.value = null
  modo.value = 'novo'
}
function abrirEditar(av) {
  selecionada.value = av
  modo.value = 'editar'
}
function voltarLista() {
  modo.value = 'lista'
  selecionada.value = null
}

async function aoSalvar() {
  await carregar()
  voltarLista()
}

async function excluir(av) {
  const ok = await confirmar({
    titulo: `Excluir a avaliação de ${formatarDataAvaliacao(av.data)}?`,
    mensagem: 'Todas as medidas dessa avaliação são removidas. Essa ação não pode ser desfeita.',
    perigo: true,
    confirmarLabel: 'Excluir avaliação'
  })
  if (!ok) return
  try {
    await avaliacoesFisicasService.excluir(props.id, av.id)
    showToast('Avaliação excluída.', 'neutral')
    if (expandidoId.value === av.id) expandidoId.value = null
    await carregar()
  } catch (_err) {
    showToast('Não foi possível excluir a avaliação.', 'warning')
  }
}
</script>

<template>
  <div>
    <!-- LISTA -->
    <template v-if="modo === 'lista'">
      <div class="secao-cabecalho">
        <h2 class="secao-titulo">Avaliações Físicas</h2>
        <div class="secao-acoes">
          <button
            v-if="listaOrdenada.length >= 2"
            type="button"
            class="btn btn-primary btn-sm"
            @click="modo = 'comparar'"
          >
            <span aria-hidden="true">📊</span>
            Comparar
          </button>
          <button v-if="!dispensaAvaliacao" type="button" class="btn btn-primary btn-sm" @click="abrirNovo">
            <span aria-hidden="true">📏</span>
            Nova avaliação
          </button>
        </div>
      </div>

      <label class="dispensa-toggle">
        <input type="checkbox" :checked="dispensaAvaliacao" :disabled="salvandoDispensa" @change="alternarDispensa" />
        <span>Não faz avaliação física</span>
      </label>

      <p v-if="dispensaAvaliacao" class="dispensa-aviso">
        Fora do alerta “avaliação física vencida” do painel. O histórico abaixo continua disponível.
      </p>

      <div v-if="carregando" class="empty-state">Carregando…</div>
      <div v-else-if="!listaOrdenada.length" class="card empty-state">
        <div class="empty-state-icon">🩺</div>Nenhuma avaliação física registrada.
      </div>
      <div v-else class="registros-list">
        <div v-for="av in listaOrdenada" :key="av.id" class="card registro-card">
          <div class="registro-card-head row-clickable" @click="alternarExpandido(av)">
            <div class="registro-card-who">
              <span class="list-row-title">{{ formatarDataAvaliacao(av.data) }}</span>
              <span class="list-row-sub af-resumo">
                <span v-for="(item, i) in resumoLinha(av)" :key="item.codigo" class="af-resumo-item">
                  <template v-if="i > 0">· </template>{{ item.texto }}
                  <SeloReferencia
                    :classificacao="item.classificacao"
                    expansivel
                    @click.stop="abrirNaMedida(av, item.codigo)"
                  />
                </span>
              </span>
            </div>
            <div class="af-card-fim">
              <span class="badge" :class="av.origem === 'legado_bodymove' ? 'badge-neutral' : 'badge-success'">
                {{ av.origem === 'legado_bodymove' ? 'Importada' : 'Manual' }}
              </span>
              <ChevronExpandir :aberto="expandidoId === av.id" />
            </div>
          </div>

          <div v-if="expandidoId === av.id" class="af-expandido" @click.stop>
            <div class="af-acoes">
              <button type="button" class="btn btn-primary btn-sm" @click="abrirEditar(av)">Editar</button>
              <button type="button" class="btn btn-danger-ghost btn-sm" @click="excluir(av)">Excluir</button>
            </div>
            <AvaliacaoFisicaDetalhe
              :avaliacao="av"
              :aluno="aluno"
              :anterior="anteriorDe(av)"
              :abrir-codigo="abrirCodigo"
              compacto
            />
          </div>
        </div>
      </div>
    </template>

    <!-- COMPARAR -->
    <template v-else-if="modo === 'comparar'">
      <button type="button" class="detail-back" style="background: none; border: none; cursor: pointer;" @click="voltarLista">
        ← Voltar para a lista
      </button>
      <AvaliacaoFisicaComparar :avaliacoes="avaliacoes" :metricas="metricas" :aluno="aluno" />
    </template>

    <!-- NOVO / EDITAR -->
    <template v-else>
      <button type="button" class="detail-back" style="background: none; border: none; cursor: pointer;" @click="voltarLista">
        ← Voltar para a lista
      </button>
      <AvaliacaoFisicaForm
        :aluno-id="props.id"
        :aluno="aluno"
        :metricas="metricas"
        :avaliacao="modo === 'editar' ? selecionada : null"
        @salvo="aoSalvar"
        @cancelar="voltarLista"
      />
    </template>

    <ToastStack :toasts="toasts" />
  </div>
</template>

<style scoped>
.secao-cabecalho {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.secao-titulo {
  font-size: 17px;
  font-weight: 800;
}
/* mesmo padrão dos botões da Linha do Tempo (acomp-acoes-grupo) */
.secao-acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.secao-acoes .btn {
  font-weight: 400;
}
.dispensa-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  cursor: pointer;
  user-select: none;
}
.dispensa-toggle input {
  width: 15px;
  height: 15px;
  cursor: pointer;
  accent-color: var(--color-primary);
}
.dispensa-aviso {
  font-size: 12.5px;
  color: var(--color-text-faint);
  margin-bottom: 16px;
}
.af-acoes { display: flex; gap: 6px; margin-bottom: 14px; }
.af-card-fim { display: flex; align-items: center; gap: 8px; flex: none; }
.af-resumo { display: flex; flex-wrap: wrap; gap: 2px 6px; align-items: center; }
.af-resumo-item { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.af-expandido {
  margin-top: 12px;
  padding-top: 4px;
  border-top: 1px solid var(--color-border, #e5e5e5);
}
</style>
