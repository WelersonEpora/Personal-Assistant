<script setup>
// docs/adr/0018-avaliacao-fisica-por-captura-e-ia.md: roteiro OPCIONAL de
// ditado, mostrado só no Registro tipo "avaliação física". Não bloqueia nada
// (o personal fala como quiser), mas ditar na ordem esperada melhora o acerto
// do mapeamento fala -> métrica. Conteúdo estático (offline-first, não busca o
// catálogo) - espelha os grupos de metrica_avaliacao_fisica (docs/adr/0016).
import { ref } from 'vue'

const aberto = ref(false)

const GRUPOS = [
  { nome: 'Antropometria', itens: 'peso, altura' },
  { nome: 'Perímetros', itens: 'pescoço, tórax, cintura, abdome, quadril, braço D/E, antebraço D/E, coxa D/E, panturrilha D/E' },
  { nome: 'Dobras', itens: 'tricipital, bicipital, peitoral, subescapular, axilar média, supra-ilíaca, abdominal, coxa, panturrilha' },
  { nome: 'Composição / cardio', itens: '% de gordura (com o protocolo), VO₂, FC e pressão de repouso' }
]
</script>

<template>
  <div class="roteiro">
    <button type="button" class="roteiro-cab" :aria-expanded="aberto" @click="aberto = !aberto">
      <span>📋 Roteiro de ditado <span class="roteiro-opcional">opcional</span></span>
      <span class="roteiro-caret">{{ aberto ? '▴' : '▾' }}</span>
    </button>
    <div v-if="aberto" class="roteiro-corpo">
      <p class="roteiro-dica">Fale como preferir — ditar nesta ordem só ajuda a IA a organizar.</p>
      <div v-for="g in GRUPOS" :key="g.nome" class="roteiro-grupo">
        <span class="roteiro-grupo-nome">{{ g.nome }}</span>
        <span class="roteiro-grupo-itens">{{ g.itens }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.roteiro {
  flex: none;
  margin: 0 18px 10px;
  border: 1px solid var(--color-avaliacao);
  border-radius: var(--radius-md);
  background: var(--color-avaliacao-light);
  overflow: hidden;
}
.roteiro-cab {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-avaliacao-dark);
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
.roteiro-dica { font-size: 11px; color: var(--color-avaliacao-dark); opacity: .85; }
.roteiro-grupo { display: flex; flex-direction: column; gap: 1px; }
.roteiro-grupo-nome {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .03em;
  color: var(--color-avaliacao-dark);
}
.roteiro-grupo-itens { font-size: 11.5px; color: var(--color-text-secondary); line-height: 1.4; }
</style>
