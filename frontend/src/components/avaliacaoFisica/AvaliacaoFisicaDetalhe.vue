<script setup>
import { computed } from 'vue'
import {
  formatarDataAvaliacao,
  rotuloMetodo,
  CATEGORIA_ROTULO,
  CATEGORIA_ORDEM,
  ANAMNESE_CAMPOS_TEXTO,
  POSTURAL_SECOES,
  POSTURAL_SECOES_LADO,
  LADOS
} from '../../utils/avaliacaoFisica.js'

const props = defineProps({
  avaliacao: { type: Object, required: true },
  // compacto: expansão inline dentro de um card da listagem - esconde o
  // cabeçalho (data/origem já aparecem no card).
  compacto: { type: Boolean, default: false }
})

const importada = computed(() => props.avaliacao.origem === 'legado_bodymove')

// Cada bloco é um card na tela cheia; na expansão inline vira só uma seção
// separada por linha, sem card aninhado.
const blocoClass = computed(() => (props.compacto ? 'af-secao' : 'card card-pad af-bloco'))

// medidas agrupadas por categoria do catálogo, na ordem de exibição.
const gruposMedidas = computed(() => {
  const porCategoria = {}
  for (const m of props.avaliacao.medidas || []) {
    const cat = m.metrica?.categoria || 'outros'
    ;(porCategoria[cat] ||= []).push(m)
  }
  return CATEGORIA_ORDEM
    .filter((cat) => porCategoria[cat]?.length)
    .map((cat) => ({ categoria: cat, rotulo: CATEGORIA_ROTULO[cat] || cat, medidas: porCategoria[cat] }))
})

function valorFormatado(m) {
  const casas = m.metrica?.casas_decimais ?? 1
  const n = Number(m.valor)
  return Number.isFinite(n) ? n.toFixed(casas) : m.valor
}

const anamnese = computed(() => props.avaliacao.anamnese_json || null)
const tabagismoTexto = computed(() => {
  const t = anamnese.value?.tabagismo
  if (!t) return null
  const partes = [t.fuma ? 'fuma' : 'não fuma']
  if (t.cigarros_dia) partes.push(`${t.cigarros_dia}/dia`)
  if (t.tempo) partes.push(t.tempo)
  return partes.join(' · ')
})

const postural = computed(() => props.avaliacao.postural_json || null)
function achadosPresentes(obj, achados) {
  return achados.filter(([chave]) => obj?.[chave]).map(([, rotulo]) => rotulo)
}
const temPostural = computed(() => {
  if (!postural.value) return false
  return Object.keys(postural.value).some((k) => k !== 'observacoes')
})
</script>

<template>
  <div>
    <div v-if="!compacto" class="view-header">
      <div>
        <h1>Avaliação de {{ formatarDataAvaliacao(avaliacao.data) }}</h1>
        <p>
          <span v-if="importada" class="badge badge-neutral">Importada do BodyMove</span>
          <span v-else class="badge badge-success">Manual</span>
        </p>
      </div>
      <slot name="acoes" />
    </div>

    <div v-if="avaliacao.observacoes" :class="blocoClass">
      <div class="exercise-obs">{{ avaliacao.observacoes }}</div>
    </div>

    <div v-for="grupo in gruposMedidas" :key="grupo.categoria" :class="blocoClass">
      <div style="font-size: 15px; font-weight: 700; margin-bottom: 10px;">{{ grupo.rotulo }}</div>
      <table class="af-tabela">
        <tbody>
          <tr v-for="m in grupo.medidas" :key="m.id">
            <td>{{ m.metrica?.rotulo || m.metrica_codigo }}</td>
            <td class="af-valor">{{ valorFormatado(m) }} <span class="af-unidade">{{ m.metrica?.unidade }}</span></td>
            <td>
              <span v-if="m.metodo !== 'direto'" class="badge badge-neutral">{{ rotuloMetodo(m.metodo) }}</span>
              <span v-if="m.principal && (m.metodo !== 'direto')" class="badge badge-success" style="margin-left: 4px;">acompanhado</span>
              <span v-if="m.origem_valor === 'calculado'" class="badge badge-neutral" style="margin-left: 4px;">calculado</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="anamnese" :class="blocoClass">
      <div style="font-size: 15px; font-weight: 700; margin-bottom: 10px;">Anamnese</div>
      <dl class="af-dl">
        <template v-if="anamnese.pratica_atividade !== undefined">
          <dt>Pratica atividade</dt><dd>{{ anamnese.pratica_atividade ? 'Sim' : 'Não' }}</dd>
        </template>
        <template v-if="anamnese.atividade_frequencia_semanal">
          <dt>Frequência semanal</dt><dd>{{ anamnese.atividade_frequencia_semanal }}x</dd>
        </template>
        <template v-for="campo in ANAMNESE_CAMPOS_TEXTO" :key="campo.chave">
          <template v-if="anamnese[campo.chave]">
            <dt>{{ campo.rotulo }}</dt><dd>{{ anamnese[campo.chave] }}</dd>
          </template>
        </template>
        <template v-if="tabagismoTexto"><dt>Tabagismo</dt><dd>{{ tabagismoTexto }}</dd></template>
        <template v-if="anamnese.historico_familiar?.length">
          <dt>Histórico familiar</dt><dd>{{ anamnese.historico_familiar.join(', ') }}</dd>
        </template>
      </dl>
    </div>

    <div v-if="temPostural || postural?.observacoes" :class="blocoClass">
      <div style="font-size: 15px; font-weight: 700; margin-bottom: 10px;">Avaliação postural</div>
      <dl class="af-dl">
        <template v-for="secao in POSTURAL_SECOES" :key="secao.regiao">
          <template v-if="achadosPresentes(postural?.[secao.regiao], secao.achados).length">
            <dt>{{ secao.rotulo }}</dt>
            <dd>{{ achadosPresentes(postural[secao.regiao], secao.achados).join(', ') }}</dd>
          </template>
        </template>
        <template v-for="secao in POSTURAL_SECOES_LADO" :key="secao.regiao">
          <template v-for="[lado, rotuloLado] in LADOS" :key="lado">
            <template v-if="achadosPresentes(postural?.[secao.regiao]?.[lado], secao.achados).length">
              <dt>{{ secao.rotulo }} ({{ rotuloLado.toLowerCase() }})</dt>
              <dd>{{ achadosPresentes(postural[secao.regiao][lado], secao.achados).join(', ') }}</dd>
            </template>
          </template>
        </template>
        <template v-if="postural?.observacoes"><dt>Observações</dt><dd>{{ postural.observacoes }}</dd></template>
      </dl>
      <p v-if="!temPostural && !postural?.observacoes" class="list-row-sub">Sem achados posturais registrados.</p>
    </div>
  </div>
</template>

<style scoped>
.af-tabela { width: 100%; border-collapse: collapse; font-size: 14px; }
.af-tabela td { padding: 6px 8px; border-bottom: 1px solid var(--color-border, #e5e5e5); vertical-align: top; }
.af-tabela tr:last-child td { border-bottom: none; }
.af-valor { white-space: nowrap; font-variant-numeric: tabular-nums; font-weight: 600; }
.af-unidade { font-weight: 400; color: var(--color-text-faint, #888); font-size: 12px; }
.af-dl { display: grid; grid-template-columns: minmax(140px, auto) 1fr; gap: 4px 16px; font-size: 14px; margin: 0; }
.af-dl dt { font-weight: 600; color: var(--color-text-faint, #666); }
.af-dl dd { margin: 0; }

.af-bloco { margin-bottom: 16px; }
.af-secao { padding: 14px 0; border-top: 1px solid var(--color-border, #e5e5e5); }
.af-secao:first-child { border-top: none; padding-top: 2px; }
</style>
