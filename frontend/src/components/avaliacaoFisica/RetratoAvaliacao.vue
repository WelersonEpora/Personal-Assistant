<script setup>
import { computed } from 'vue'
import { contextoDoAluno } from '../../utils/referenciasAvaliacaoFisica.js'
import {
  montarComposicao,
  indicadoresComReferencia,
  montarPerimetros,
  resumoComposicao,
  resumoIndicadores,
  resumoPerimetros
} from '../../utils/retratoAvaliacaoFisica.js'
import { PALETA_SERIES } from '../../utils/avaliacaoFisica.js'
import GraficoComposicao from './GraficoComposicao.vue'
import ReguaReferencia from './ReguaReferencia.vue'

// Retrato da avaliação: leitura visual de UMA avaliação, desde a primeira
// (a evolução no tempo fica no "Comparar", com 2+), em três "Cards Resumo" -
// composição corporal, indicadores na régua de referência (ADR-0031 -
// linguagem de referência, nunca de diagnóstico) e perímetros. Cada card abre
// com uma linha de leitura (o personal sabe de relance se precisa olhar o
// resto). Só tela do personal; no PDF do aluno vai apenas o gráfico de
// composição (adendo 2026-11-12 da ADR-0029).
const props = defineProps({
  avaliacao: { type: Object, required: true },
  anterior: { type: Object, default: null },
  aluno: { type: Object, default: null }
})
const emit = defineEmits(['abrir']) // codigo da métrica - abre a explicação na lista

const composicao = computed(() => montarComposicao(props.avaliacao, props.anterior))
const indicadores = computed(() => {
  const valores = {}
  for (const m of props.avaliacao.medidas || []) if (m.principal) valores[m.metrica_codigo] = Number(m.valor)
  return indicadoresComReferencia(props.avaliacao, contextoDoAluno(props.aluno, props.avaliacao.data, valores))
})
const perimetros = computed(() => montarPerimetros(props.avaliacao))
const vazio = computed(() => !composicao.value && !indicadores.value.length && !perimetros.value.length)

const resumoComp = computed(() => resumoComposicao(composicao.value))
const resumoInd = computed(() => resumoIndicadores(indicadores.value))
const resumoPer = computed(() => resumoPerimetros(perimetros.value))

const corPerimetro = PALETA_SERIES[0]

function fmt(n, casas = 1) {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}
</script>

<template>
  <div v-if="!vazio" class="retrato">
    <div class="retrato-titulo">Retrato da avaliação</div>

    <div class="retrato-grade">
      <section v-if="composicao" class="card-resumo">
        <header class="cr-cabeca">
          <h3>Composição corporal</h3>
          <p class="cr-resumo">
            <span class="cr-resumo-principal">{{ resumoComp.principal }}</span>
            <template v-if="resumoComp.variacao">
              · <span :class="`cr-tom-${resumoComp.tom}`">{{ resumoComp.variacao }}</span>
            </template>
          </p>
        </header>
        <div class="cr-corpo-centro">
          <GraficoComposicao :composicao="composicao" grande />
        </div>
      </section>

      <section v-if="indicadores.length" class="card-resumo">
        <header class="cr-cabeca">
          <h3>Indicadores × referência</h3>
          <p class="cr-resumo" :class="`cr-tom-${resumoInd.tom}`">{{ resumoInd.texto }}</p>
        </header>
        <button
          v-for="ind in indicadores"
          :key="ind.codigo"
          type="button"
          class="retrato-indicador"
          :title="`Ver o que significa: ${ind.medida.metrica?.rotulo || ind.codigo}`"
          @click="emit('abrir', ind.codigo)"
        >
          <span class="ri-cabeca">
            <span class="ri-rotulo">{{ ind.medida.metrica?.rotulo || ind.codigo }}</span>
            <span class="ri-valor">
              {{ fmt(ind.valor, ind.medida.metrica?.casas_decimais ?? 1) }}
              <span class="ri-unidade">{{ ind.medida.metrica?.unidade === 'adimensional' ? '' : ind.medida.metrica?.unidade }}</span>
              <span class="badge" :class="`badge-${ind.classificacao.tom}`">{{ ind.classificacao.rotulo }}</span>
            </span>
          </span>
          <ReguaReferencia
            :classificacao="ind.classificacao"
            :valor="ind.valor"
            :casas="ind.medida.metrica?.casas_decimais ?? 1"
            :rotulo="ind.medida.metrica?.rotulo || ind.codigo"
          />
        </button>
        <p class="retrato-nota">Faixas de referência, não diagnóstico. Toque para ver a fonte e as faixas.</p>
      </section>

      <section v-if="perimetros.length" class="card-resumo card-resumo-largo">
        <header class="cr-cabeca">
          <h3>Perímetros</h3>
          <p class="cr-resumo" :class="`cr-tom-${resumoPer.tom}`">{{ resumoPer.texto }}</p>
        </header>
        <div class="rp-grupos">
          <div v-for="g in perimetros" :key="g.titulo" class="rp-grupo">
            <div class="rp-grupo-titulo">{{ g.titulo }}</div>
            <div v-for="l in g.linhas" :key="l.regiao" class="rp-linha">
              <div class="rp-rotulo">
                {{ l.rotulo }}
                <span
                  v-if="l.assimetria"
                  class="badge badge-warning rp-assimetria"
                  title="Diferença entre os lados a partir de 1 cm — informativo"
                >{{ l.assimetria.maior }} +{{ fmt(l.assimetria.diferenca) }} cm</span>
              </div>
              <div class="rp-barras">
                <div v-for="v in l.valores" :key="v.lado || 'u'" class="rp-barra-linha">
                  <span class="rp-lado">{{ v.lado || '' }}</span>
                  <div class="rp-trilho">
                    <div
                      class="rp-barra"
                      :class="{ 'rp-barra-e': v.lado === 'E' }"
                      :style="{ width: `${v.largura}%`, background: corPerimetro }"
                    />
                  </div>
                  <span class="rp-valor">{{ fmt(v.valor) }} cm</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.retrato-titulo { font-size: 15px; font-weight: 700; margin-bottom: 12px; }
.retrato-grade { display: grid; grid-template-columns: 1fr; gap: 12px; }
@media (min-width: 900px) {
  .retrato-grade { grid-template-columns: 1fr 1fr; }
  .card-resumo-largo { grid-column: 1 / -1; }
  .rp-grupos { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
}

/* Card Resumo: bloco de fundo levemente cinza, sem sombra - fica dentro do
   card expandido da avaliação sem parecer uma segunda camada de card. */
.card-resumo {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 14px 16px;
  border-radius: var(--radius-md, 10px);
  background: var(--color-surface-alt);
  border: 1px solid var(--color-border);
}
/* card mais baixo que o vizinho da linha: o conteúdo centraliza na altura */
.cr-corpo-centro { flex: 1; display: flex; flex-direction: column; justify-content: center; }
.cr-cabeca { margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--color-border); }
.cr-cabeca h3 {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-secondary);
  margin: 0 0 2px;
}
.cr-resumo { margin: 0; font-size: 14.5px; font-weight: 700; }
.cr-resumo-principal { color: var(--color-text); }
.cr-tom-success { color: var(--color-success-dark, #15803d); }
.cr-tom-warning { color: var(--color-warning); }
.cr-tom-danger { color: var(--color-danger); }
.cr-tom-neutral { color: var(--color-text); }
.retrato-nota { font-size: 12px; color: var(--color-text-faint); margin: 4px 0 0; }

.retrato-indicador {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  padding: 6px 8px 0;
  margin: 0 -8px 2px;
  box-sizing: content-box;
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.retrato-indicador:hover,
.retrato-indicador:focus-visible { background: var(--color-surface); }
.ri-cabeca { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 13.5px; }
.ri-rotulo { color: var(--color-text-secondary); }
.ri-valor { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ri-unidade { font-weight: 400; font-size: 12px; color: var(--color-text-faint); }
.ri-valor .badge { margin-left: 6px; }

.rp-grupo { min-width: 0; }
.rp-grupo + .rp-grupo { margin-top: 12px; }
@media (min-width: 900px) { .rp-grupo + .rp-grupo { margin-top: 0; } }
.rp-grupo-titulo { font-size: 12px; font-weight: 600; color: var(--color-text-faint); margin-bottom: 6px; }
.rp-linha { display: grid; grid-template-columns: 112px 1fr; gap: 8px; align-items: center; padding: 4px 0; font-size: 13px; }
.rp-rotulo { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
.rp-assimetria { font-size: 10.5px; }
.rp-barras { display: grid; gap: 3px; min-width: 0; }
.rp-barra-linha { display: grid; grid-template-columns: auto 1fr 64px; gap: 6px; align-items: center; }
.rp-lado { font-size: 11px; font-weight: 700; color: var(--color-text-faint); width: 10px; }
.rp-trilho { height: 10px; background: var(--color-border); border-radius: 3px; overflow: hidden; }
.rp-barra { height: 100%; border-radius: 3px; }
.rp-barra-e { opacity: 0.55; }
.rp-valor { text-align: right; font-variant-numeric: tabular-nums; font-size: 12.5px; white-space: nowrap; }
</style>
