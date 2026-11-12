<script setup>
import { computed } from 'vue'
import { explicacao, descreverFaixas, variacao, TEXTO_DIRECAO } from '../../utils/referenciasAvaliacaoFisica.js'
import { formatarDataAvaliacao } from '../../utils/avaliacaoFisica.js'
import ReguaReferencia from './ReguaReferencia.vue'

// docs/adr/0031 - o que abre ao tocar na linha da medida: o que ela é, a
// régua com as faixas (quando há referência), a fonte e a comparação com a
// avaliação anterior.
const props = defineProps({
  metrica: { type: Object, required: true }, // linha do catálogo
  valor: { type: [Number, String], required: true },
  classificacao: { type: Object, default: null },
  // { valor, data } da mesma métrica na avaliação anterior
  anterior: { type: Object, default: null }
})

const casas = computed(() => props.metrica.casas_decimais ?? 1)
const texto = computed(() => explicacao(props.metrica.codigo, props.metrica.categoria))
const direcao = computed(() => TEXTO_DIRECAO[props.metrica.direcao_favoravel] || null)

const comReferencia = computed(() => props.classificacao && !props.classificacao.semReferencia)
const faixasTexto = computed(() =>
  comReferencia.value ? descreverFaixas(props.classificacao.faixas, casas.value) : []
)

function fmt(n) {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: casas.value, maximumFractionDigits: casas.value })
}

const comparacao = computed(() => {
  if (!props.anterior) return null
  const v = variacao(props.valor, props.anterior.valor, props.metrica.direcao_favoravel)
  if (!v) return null
  const sinal = v.delta > 0 ? '↑' : '↓'
  return {
    texto: `${fmt(props.anterior.valor)} ${props.metrica.unidade || ''}`.trim(),
    data: formatarDataAvaliacao(props.anterior.data),
    delta: v.delta === 0 ? 'sem mudança' : `${sinal} ${fmt(Math.abs(v.delta))}`,
    leitura: v.leitura
  }
})
</script>

<template>
  <div class="ref-painel">
    <p v-if="texto" class="ref-texto">
      {{ texto }}
      <template v-if="direcao && !comReferencia"> {{ direcao }}</template>
    </p>

    <template v-if="comReferencia">
      <ReguaReferencia class="ref-regua-painel" :classificacao="classificacao" :valor="valor" :casas="casas" />

      <ul class="ref-faixas">
        <li v-for="(f, i) in faixasTexto" :key="f.rotulo" :class="{ atual: i === classificacao.indice }">
          <span class="ref-ponto" :class="`ref-${f.tom}`" />
          <span class="ref-faixa-rotulo">{{ f.rotulo }}</span>
          <span class="ref-faixa-intervalo">{{ f.intervalo }}</span>
        </li>
      </ul>

      <p v-if="classificacao.combinada" class="ref-linha">
        Com sistólica e diastólica juntas, vale a maior das duas:
        <strong>{{ classificacao.combinada.rotulo }}</strong>
        <span class="ref-fraco">(na diretriz, “{{ classificacao.combinada.diretriz }}”)</span>.
      </p>
      <p v-if="classificacao.alerta" class="ref-alerta">{{ classificacao.alerta }}</p>
      <p v-if="classificacao.nota" class="ref-nota">⚠ {{ classificacao.nota }}</p>
      <p class="ref-fonte">Referência: {{ classificacao.fonte }}</p>
    </template>

    <p v-else-if="classificacao?.semReferencia" class="ref-nota">{{ classificacao.motivo }}</p>

    <p v-if="comparacao" class="ref-linha">
      Na avaliação anterior ({{ comparacao.data }}): {{ comparacao.texto }}
      <span class="ref-delta" :class="comparacao.leitura">({{ comparacao.delta }})</span>
    </p>
  </div>
</template>

<style scoped>
.ref-painel {
  margin: 2px 0 8px;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  background: var(--color-surface-alt);
  border: 1px solid var(--color-border);
  font-size: 13px;
  line-height: 1.5;
}
.ref-painel p { margin: 0 0 8px; }
.ref-painel p:last-child { margin-bottom: 0; }
.ref-texto { color: var(--color-text-secondary); }

.ref-regua-painel { margin: 6px 0 14px; }

.ref-faixas { list-style: none; margin: 0 0 10px; padding: 0; display: grid; gap: 2px; }
.ref-faixas li { display: flex; align-items: center; gap: 8px; color: var(--color-text-secondary); }
.ref-faixas li.atual { color: var(--color-text, #111); font-weight: 700; }
.ref-faixa-rotulo { flex: 1; }
.ref-faixa-intervalo { font-variant-numeric: tabular-nums; white-space: nowrap; }
.ref-ponto { width: 8px; height: 8px; border-radius: 50%; background: currentColor; flex: none; }
.ref-faixas li .ref-ponto { color: inherit; }
.ref-faixas li .ref-ponto.ref-success { color: var(--color-success); }
.ref-faixas li .ref-ponto.ref-warning { color: var(--color-warning); }
.ref-faixas li .ref-ponto.ref-danger { color: var(--color-danger); }
.ref-faixas li .ref-ponto.ref-info { color: var(--color-info); }

.ref-success { color: var(--color-success); }
.ref-warning { color: var(--color-warning); }
.ref-danger { color: var(--color-danger); }
.ref-info { color: var(--color-info); }

.ref-alerta {
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: var(--color-danger-light);
  color: var(--color-danger);
  font-weight: 600;
}
.ref-nota { color: var(--color-text-secondary); font-size: 12.5px; }
.ref-fonte { color: var(--color-text-faint); font-size: 12px; }
.ref-fraco { color: var(--color-text-faint); }
.ref-delta { font-variant-numeric: tabular-nums; color: var(--color-text-faint); }
.ref-delta.favoravel { color: var(--color-success-dark); }
.ref-delta.desfavoravel { color: var(--color-warning); }
</style>
