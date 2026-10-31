<script setup>
// docs/adr/0018-avaliacao-fisica-por-captura-e-ia.md: roteiro OPCIONAL de
// ditado, mostrado nos Registros que a IA estrutura num formato fechado
// (avaliação física e, pela docs/adr/0028, ficha de treino). Não bloqueia nada
// (o personal fala como quiser), mas ditar na ordem esperada melhora o acerto
// do mapeamento. Conteúdo estático (offline-first, não busca catálogo).
import { ref, computed } from 'vue'

const props = defineProps({
  tipo: { type: String, default: 'avaliacao_fisica' }
})

const aberto = ref(false)

const ROTEIROS = {
  // Espelha os grupos de metrica_avaliacao_fisica (docs/adr/0016).
  avaliacao_fisica: [
    { nome: 'Antropometria', itens: 'peso, altura' },
    { nome: 'Perímetros', itens: 'pescoço, tórax, cintura, abdome, quadril, braço D/E, antebraço D/E, coxa D/E, panturrilha D/E' },
    { nome: 'Dobras', itens: 'tricipital, bicipital, peitoral, subescapular, axilar média, supra-ilíaca, abdominal, coxa, panturrilha' },
    { nome: 'Composição / cardio', itens: '% de gordura (com o protocolo), VO₂, FC e pressão de repouso' }
  ],
  // Estrutura da ficha (docs/adr/0026): nome → exercícios → grupos conjugados.
  ficha_treino: [
    { nome: 'Nome da ficha', itens: '“Treino A”, “Inferiores”… — dite várias fichas no mesmo registro, uma depois da outra' },
    { nome: 'Cada exercício', itens: 'nome, séries × repetições, carga e descanso — ex.: “serrote, quatro de dez, vinte quilos, um minuto”' },
    { nome: 'Conjugados', itens: '“bi-set de tríceps corda com tríceps testa, três voltas” — também tri-set e circuito' },
    { nome: 'Observações', itens: 'cadência, ajuste de carga, o que valer para a ficha toda' }
  ]
}

const grupos = computed(() => ROTEIROS[props.tipo] || ROTEIROS.avaliacao_fisica)
</script>

<template>
  <div class="roteiro" :class="'roteiro-' + tipo">
    <button type="button" class="roteiro-cab" :aria-expanded="aberto" @click="aberto = !aberto">
      <span>📋 Roteiro de ditado <span class="roteiro-opcional">opcional</span></span>
      <span class="roteiro-caret">{{ aberto ? '▴' : '▾' }}</span>
    </button>
    <div v-if="aberto" class="roteiro-corpo">
      <p class="roteiro-dica">Fale como preferir — ditar nesta ordem só ajuda a IA a organizar.</p>
      <div v-for="g in grupos" :key="g.nome" class="roteiro-grupo">
        <span class="roteiro-grupo-nome">{{ g.nome }}</span>
        <span class="roteiro-grupo-itens">{{ g.itens }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.roteiro {
  --roteiro-cor: var(--color-avaliacao);
  --roteiro-cor-escura: var(--color-avaliacao-dark);
  --roteiro-fundo: var(--color-avaliacao-light);
  flex: none;
  margin: 0 18px 10px;
  border: 1px solid var(--roteiro-cor);
  border-radius: var(--radius-md);
  background: var(--roteiro-fundo);
  overflow: hidden;
}
.roteiro-ficha_treino {
  --roteiro-cor: var(--color-ficha);
  --roteiro-cor-escura: var(--color-ficha-dark);
  --roteiro-fundo: var(--color-ficha-light);
}
.roteiro-cab {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  font-size: 12px;
  font-weight: 700;
  color: var(--roteiro-cor-escura);
}
.roteiro-opcional {
  font-weight: 600;
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: .04em;
  opacity: .75;
  margin-left: 4px;
}
.roteiro-caret { font-size: 11px; }
.roteiro-corpo {
  padding: 4px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.roteiro-dica { font-size: 11px; color: var(--roteiro-cor-escura); opacity: .85; }
.roteiro-grupo { display: flex; flex-direction: column; gap: 1px; }
.roteiro-grupo-nome {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .03em;
  color: var(--roteiro-cor-escura);
}
.roteiro-grupo-itens { font-size: 11.5px; color: var(--color-text-secondary); line-height: 1.4; }
</style>
