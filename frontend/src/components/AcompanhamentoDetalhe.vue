<script setup>
import { ref } from 'vue'

// Detalhe expandido de uma avaliação de IA - serve tanto o acompanhamento
// mensal quanto a análise sob demanda (docs/adr/0015). O contexto
// consolidado só é passado para a mensal.
defineProps({
  avaliacao: { type: Object, default: null },
  contexto: { type: Object, default: null },
  status: { type: String, default: 'gerada' },
  erro: { type: String, default: '' }
})

// O contexto consolidado (entrada da IA no próximo ciclo) é secundário para a
// leitura do personal - entra colapsado.
const contextoAberto = ref(false)

function classeConfianca(nivel) {
  return nivel === 'alta' ? 'alta' : nivel === 'baixa' ? 'baixa' : 'media'
}

function rotuloMes(anoMes) {
  if (!anoMes) return ''
  const [ano, mes] = String(anoMes).split('-')
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${nomes[Number(mes) - 1]}/${ano}`
}
</script>

<template>
  <div>
    <div v-if="status === 'falha'" class="exercise-obs" style="color: var(--color-danger); background: var(--color-danger-light);">
      A IA não conseguiu gerar isto.<template v-if="erro"> ({{ erro }})</template>
    </div>

    <template v-else-if="avaliacao">
      <div class="exercise-obs" style="margin-bottom: 16px;">{{ avaliacao.resumo_geral }}</div>

      <template v-if="!avaliacao.dados_insuficientes">
        <p class="acomp-section">Evolução por dimensão</p>
        <div v-if="!(avaliacao.dimensoes || []).length" class="empty-state" style="padding: 16px;">Sem dimensões avaliadas.</div>
        <div v-for="(dim, i) in avaliacao.dimensoes || []" :key="i" class="exercise-card">
          <div class="exercise-card-top">
            <div>
              <div class="exercise-name">{{ dim.nome }}</div>
              <div class="exercise-meta">{{ dim.situacao_atual }}</div>
            </div>
            <span class="confidence-note" :class="classeConfianca(dim.confianca)">● {{ dim.confianca }}</span>
          </div>
          <div style="font-size: 13px; margin-top: 8px;">{{ dim.evolucao_no_mes || dim.evolucao_recente }}</div>
          <ul v-if="(dim.evidencias || []).length" class="acomp-evidencias">
            <li v-for="(ev, j) in dim.evidencias" :key="j">
              "{{ ev.texto }}"
              <span class="list-row-sub">— {{ ev.origem }}<template v-if="ev.data"> · {{ ev.data }}</template></span>
            </li>
          </ul>
        </div>

        <template v-if="(avaliacao.destaques || []).length">
          <p class="acomp-section">Destaques</p>
          <ul class="acomp-lista"><li v-for="(d, i) in avaliacao.destaques" :key="i">{{ d }}</li></ul>
        </template>

        <template v-if="(avaliacao.alertas || []).length">
          <p class="acomp-section">Alertas</p>
          <ul class="acomp-lista">
            <li v-for="(a, i) in avaliacao.alertas" :key="i">
              <span class="confidence-note" :class="classeConfianca(a.gravidade)" style="display: inline-flex;">●</span>
              {{ a.texto }}
            </li>
          </ul>
        </template>

        <template v-if="(avaliacao.recomendacoes || []).length">
          <p class="acomp-section">Recomendações</p>
          <ul class="acomp-lista"><li v-for="(r, i) in avaliacao.recomendacoes" :key="i">{{ r }}</li></ul>
        </template>

        <template v-if="(avaliacao.pendencias_confirmacao || []).length">
          <p class="acomp-section">Pendências / a confirmar</p>
          <ul class="acomp-lista">
            <li v-for="(p, i) in avaliacao.pendencias_confirmacao" :key="i">
              {{ p.afirmacao }}
              <span class="list-row-sub">— {{ p.motivo }}<template v-if="p.confianca"> · confiança {{ p.confianca }}</template></span>
            </li>
          </ul>
        </template>

        <template v-if="(avaliacao.mudancas_vs_mes_anterior || []).length">
          <p class="acomp-section">Mudanças em relação ao mês anterior</p>
          <ul class="acomp-lista"><li v-for="(m, i) in avaliacao.mudancas_vs_mes_anterior" :key="i">{{ m }}</li></ul>
        </template>
      </template>
    </template>

    <template v-if="contexto">
      <button
        type="button"
        class="acomp-contexto-toggle"
        :aria-expanded="contextoAberto"
        @click="contextoAberto = !contextoAberto"
      >
        <span class="acomp-contexto-chevron">{{ contextoAberto ? '▼' : '▶' }}</span>
        <span class="acomp-section" style="margin: 0;">Contexto consolidado — entrada da IA no próximo ciclo</span>
      </button>

      <template v-if="contextoAberto">
      <p class="list-row-sub" style="margin: 0 0 12px;">Cobre até {{ rotuloMes(contexto.cobre_ate) }} · gerado em {{ contexto.gerado_em }}</p>

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
</template>

<style scoped>
.acomp-section {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin: 18px 0 10px;
}
.acomp-contexto-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  background: none;
  border: none;
  border-top: 1px solid var(--color-border);
  padding: 16px 0 10px;
  cursor: pointer;
  text-align: left;
}
.acomp-contexto-chevron {
  color: var(--color-primary);
  font-size: 10px;
  line-height: 1;
  flex: none;
}
.acomp-contexto-toggle:hover .acomp-section {
  color: var(--color-text-secondary);
}
.acomp-section:first-child {
  margin-top: 0;
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
