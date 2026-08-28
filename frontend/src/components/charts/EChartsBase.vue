<script setup>
// Wrapper genérico do Apache ECharts (vue-echarts) - mesmo padrão do AgroMind
// (frontend/src/components/charts/EChartsBase.vue lá). Registra só os módulos
// "de base" (renderer + grid/tooltip/legend/dataZoom/toolbox); cada gráfico
// concreto (charts/LineChart.vue) registra o tipo de série que usa
// (tree-shaking real). Views/components de domínio nunca importam echarts
// direto - só passam por charts/.
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
// SVGRenderer (não Canvas): as séries daqui são curtas (<= ~15 pontos) e o
// SVG fica mais nítido e mais leve nesse cenário. O AgroMind usa Canvas
// porque lá as séries têm milhares de pontos.
import { SVGRenderer } from 'echarts/renderers'
import { GridComponent, TooltipComponent, LegendComponent, MarkAreaComponent } from 'echarts/components'

// Sem DataZoom/Toolbox: as séries têm <= ~15 pontos, zoom não faz sentido
// nessa escala (e os dois módulos são grandes). O período é filtrado fora do
// gráfico, no seletor da tela Comparar. MarkArea: faixas de referência do IMC.
use([SVGRenderer, GridComponent, TooltipComponent, LegendComponent, MarkAreaComponent])

defineProps({
  option: { type: Object, required: true },
  altura: { type: String, default: '240px' }
})
</script>

<template>
  <!-- autoresize: ResizeObserver interno do vue-echarts (sem listener manual). -->
  <v-chart class="echarts-base" :option="option" autoresize :style="{ height: altura, width: '100%' }" />
</template>

<style scoped>
.echarts-base {
  width: 100%;
}
</style>
