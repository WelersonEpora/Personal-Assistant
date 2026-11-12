<script setup>
import { computed } from 'vue'
import { leituraComposicao, arcosRosca } from '../../utils/retratoAvaliacaoFisica.js'
import { CORES_COMPOSICAO, formatarDataAvaliacao } from '../../utils/avaliacaoFisica.js'

// Composição corporal de uma avaliação: rosca massa magra × massa gorda da
// avaliação atual (peso e % de gordura no centro) + a variação para a anterior
// do mesmo método em texto (ver leituraComposicao). SVG puro, sem ECharts - o
// mesmo componente vai no retrato do personal e no PDF do aluno (adendo
// 2026-11-12 da ADR-0029), e precisa sair igual no "salvar como PDF".
const props = defineProps({
  // { atual, anterior } - formato de montarComposicao / resumo.composicao
  composicao: { type: Object, required: true },
  // retrato do personal: rosca maior, para ocupar o card (o PDF usa o padrão)
  grande: { type: Boolean, default: false }
})

const RAIO = 48
const CIRCUNFERENCIA = 2 * Math.PI * RAIO

const leitura = computed(() => leituraComposicao(props.composicao))
const arcos = computed(() => arcosRosca(leitura.value, CIRCUNFERENCIA))
const metodo = computed(() => props.composicao.atual?.metodo_rotulo || null)
const fatias = [
  { chave: 'magra', rotulo: 'Massa magra' },
  { chave: 'gorda', rotulo: 'Massa gorda' }
]
const cores = { magra: CORES_COMPOSICAO.massa_magra, gorda: CORES_COMPOSICAO.massa_gorda }

function num(n, casas = 1) {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}
function kg(n) {
  return `${num(n)} kg`
}
function pct(n) {
  return `${Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}
// Seta da variação (retrato): direção = sinal; cor = leitura favorável.
function seta(v) {
  if (v.delta === 0) return '='
  return v.delta > 0 ? '↑' : '↓'
}
function deltaCurto(v) {
  if (v.delta === 0) return 'estável'
  return `${v.delta > 0 ? '+' : '−'}${kg(Math.abs(v.delta))}`
}
function delta(v) {
  if (v.delta === 0) return 'sem variação'
  return `${v.delta > 0 ? '+' : '−'}${kg(Math.abs(v.delta))}`
}
</script>

<template>
  <div v-if="leitura" class="gc" :class="{ 'gc-grande': grande }">
    <svg
      class="gc-rosca"
      viewBox="0 0 120 120"
      role="img"
      :aria-label="`Peso ${kg(leitura.peso)}: massa magra ${kg(leitura.magra.kg)} (${pct(leitura.magra.pct)}), massa gorda ${kg(leitura.gorda.kg)} (${pct(leitura.gorda.pct)})`"
    >
      <circle cx="60" cy="60" :r="RAIO" fill="none" stroke="#f4f4f5" stroke-width="16" />
      <circle
        v-for="a in arcos"
        :key="a.chave"
        cx="60"
        cy="60"
        :r="RAIO"
        fill="none"
        :stroke="cores[a.chave]"
        stroke-width="16"
        :stroke-dasharray="`${a.comprimento} ${CIRCUNFERENCIA}`"
        :stroke-dashoffset="a.deslocamento"
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="58" text-anchor="middle" class="gc-centro-peso">{{ kg(leitura.peso) }}</text>
      <text x="60" y="74" text-anchor="middle" class="gc-centro-pct">{{ pct(leitura.pctGordura) }} gordura</text>
    </svg>

    <!-- Retrato: linha 1 = rosca (data e método embaixo); linha 2 = massa magra |
         massa gorda | variação para a anterior (setas), em colunas. -->
    <template v-if="grande">
      <div class="gcg-legenda-rosca">
        {{ formatarDataAvaliacao(leitura.data) }}<template v-if="metodo"> · {{ metodo }}</template>
      </div>
      <div class="gcg-tabela" :class="{ 'gcg-com-variacao': leitura.variacao }">
        <div v-if="leitura.variacao" class="gcg-cabeca">
          <span />
          <span class="gcg-cabeca-var">vs {{ formatarDataAvaliacao(leitura.variacao.desde) }}</span>
        </div>
        <div v-for="f in fatias" :key="f.chave" class="gcg-linha">
          <span class="gcg-rotulo">
            <span class="gcg-rotulo-nome"><i class="gc-ponto" :style="{ background: cores[f.chave] }" />{{ f.rotulo }}</span>
            <span class="gcg-pct-estreito">{{ pct(leitura[f.chave].pct) }}</span>
          </span>
          <span class="gcg-valor">{{ kg(leitura[f.chave].kg) }}</span>
          <span class="gcg-pct">{{ pct(leitura[f.chave].pct) }}</span>
          <span v-if="leitura.variacao" class="gcg-seta" :class="`gc-${leitura.variacao[f.chave].leitura}`">
            <span class="gcg-seta-ic" aria-hidden="true">{{ seta(leitura.variacao[f.chave]) }}</span>
            {{ deltaCurto(leitura.variacao[f.chave]) }}
          </span>
        </div>
      </div>
    </template>

    <div v-else class="gc-lado">
      <div class="gc-data">{{ formatarDataAvaliacao(leitura.data) }}</div>
      <ul class="gc-legenda">
        <li>
          <i class="gc-ponto" :style="{ background: cores.magra }" />
          <span class="gc-rotulo">Massa magra</span>
          <span class="gc-valor">{{ kg(leitura.magra.kg) }} <span class="gc-pct">{{ pct(leitura.magra.pct) }}</span></span>
        </li>
        <li>
          <i class="gc-ponto" :style="{ background: cores.gorda }" />
          <span class="gc-rotulo">Massa gorda</span>
          <span class="gc-valor">{{ kg(leitura.gorda.kg) }} <span class="gc-pct">{{ pct(leitura.gorda.pct) }}</span></span>
        </li>
      </ul>

      <div v-if="leitura.variacao" class="gc-variacao">
        <div class="gc-variacao-titulo">Desde {{ formatarDataAvaliacao(leitura.variacao.desde) }}</div>
        <div class="gc-variacao-itens">
          <span :class="`gc-${leitura.variacao.gorda.leitura}`">Gordura {{ delta(leitura.variacao.gorda) }}</span>
          <span :class="`gc-${leitura.variacao.magra.leitura}`">Massa magra {{ delta(leitura.variacao.magra) }}</span>
        </div>
      </div>

      <p v-if="metodo" class="gc-nota">% de gordura por {{ metodo }}.</p>
    </div>
  </div>
</template>

<style scoped>
.gc {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px 20px;
  font-size: 13px;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  break-inside: avoid;
}
.gc-rosca { width: 140px; height: 140px; flex: none; }
/* --- retrato (grande): rosca sozinha na 1ª linha, colunas na 2ª --- */
.gc-grande { flex-direction: column; flex-wrap: nowrap; gap: 0; container-type: inline-size; }
.gc-grande .gc-rosca { width: 210px; height: 210px; }
.gcg-legenda-rosca { margin: 6px 0 14px; font-size: 12px; color: #71717a; text-align: center; }
.gcg-tabela {
  align-self: stretch;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
  padding: 4px 14px;
}
.gcg-linha,
.gcg-cabeca {
  display: grid;
  grid-template-columns: 1fr auto 52px;
  align-items: baseline;
  column-gap: 12px;
}
.gcg-com-variacao .gcg-linha { grid-template-columns: 1fr auto 52px 92px; }
.gcg-com-variacao .gcg-cabeca { grid-template-columns: 1fr 92px; }
.gcg-linha { padding: 8px 0; font-size: 14px; }
.gcg-linha + .gcg-linha { border-top: 1px solid var(--color-border, #e5e7eb); }
.gcg-cabeca { padding-top: 6px; }
.gcg-cabeca-var {
  text-align: right;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #71717a;
  white-space: nowrap;
}
.gcg-rotulo { min-width: 0; }
.gcg-rotulo-nome { white-space: nowrap; }
.gcg-pct-estreito { display: none; }
.gcg-rotulo .gc-ponto { margin-right: 8px; }
.gcg-valor { font-size: 16px; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; text-align: right; }
.gcg-pct { font-size: 12.5px; color: #71717a; font-variant-numeric: tabular-nums; text-align: right; }
.gcg-seta { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; text-align: right; }
.gcg-seta-ic { font-size: 15px; margin-right: 2px; }
/* card estreito (celular): a % desce para baixo do nome e libera a coluna */
@container (max-width: 380px) {
  .gcg-tabela { padding: 4px 12px; }
  .gcg-linha, .gcg-cabeca { column-gap: 8px; }
  .gcg-linha { grid-template-columns: 1fr auto; }
  .gcg-com-variacao .gcg-linha { grid-template-columns: 1fr auto 84px; }
  .gcg-com-variacao .gcg-cabeca { grid-template-columns: 1fr 84px; }
  .gcg-pct { display: none; }
  .gcg-pct-estreito { display: block; padding-left: 18px; font-size: 12px; color: #71717a; font-variant-numeric: tabular-nums; }
}

.gc-centro-peso { font-size: 15px; font-weight: 800; fill: #18181b; font-variant-numeric: tabular-nums; }
.gc-centro-pct { font-size: 9.5px; fill: #52525b; font-variant-numeric: tabular-nums; }
.gc-lado { flex: 1 1 200px; min-width: 0; max-width: 340px; }
.gc-data { font-size: 12px; font-weight: 700; color: #52525b; margin-bottom: 6px; }
.gc-legenda { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.gc-legenda li { display: flex; align-items: baseline; gap: 8px; }
.gc-ponto { display: inline-block; width: 10px; height: 10px; border-radius: 2px; flex: none; transform: translateY(1px); }
.gc-rotulo { flex: 1; }
.gc-valor { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.gc-pct { font-weight: 400; color: #71717a; margin-left: 4px; }
.gc-variacao { margin-top: 10px; padding-top: 8px; border-top: 1px solid #ececee; }
.gc-variacao-titulo { font-size: 11.5px; color: #71717a; margin-bottom: 2px; }
.gc-variacao-itens { display: flex; flex-wrap: wrap; gap: 4px 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
.gc-favoravel { color: #15803d; }
.gc-desfavoravel { color: #b45309; }
.gc-neutra { color: #52525b; }
.gc-nota { margin: 8px 0 0; font-size: 11.5px; color: #71717a; }
</style>
