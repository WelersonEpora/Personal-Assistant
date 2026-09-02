<script setup>
import { ref, computed } from 'vue'
import radarService from '../../services/radar.service.js'
import { tipoMeta, dataInformada, agruparPorMes } from '../../utils/radar.js'
import { useToasts } from '../../composables/useToasts.js'
import ToastStack from '../../components/ToastStack.vue'
import SeletorPeriodo from '../../components/SeletorPeriodo.vue'
import FiltroSegmentado from '../../components/FiltroSegmentado.vue'

// docs/adr/0022 - Radar ("fofoqueira científica"). Feed global de ponteiros
// para publicações. NÃO é fonte de conhecimento: a IA aponta, o personal
// abre o original. Hierarquia: o TÍTULO manda; a leitura da IA fica recuada
// e marcada como não conferida; o TIPO de documento é a espinha de triagem.
// A busca roda sozinha (job semanal); disparar/curar é do operador, via
// script - não há ação de manutenção nesta tela.
const { toasts, showToast } = useToasts()

const itens = ref([])
const carregando = ref(true)
const periodo = ref(null) // { de, ate } - definido pelo SeletorPeriodo na montagem
const gruposDisponiveis = ref([]) // [{ chave, nome }] - vem da API
const gruposSelecionados = ref([]) // chaves ativas no filtro

const meses = computed(() => agruparPorMes(itens.value))
const opcoesAssunto = computed(() => gruposDisponiveis.value.map((g) => ({ valor: g.chave, rotulo: g.nome })))

async function carregar() {
  if (!periodo.value) return
  carregando.value = true
  try {
    const dados = await radarService.listar({
      de: periodo.value.de || undefined,
      ate: periodo.value.ate || undefined,
      grupos: gruposSelecionados.value
    })
    itens.value = dados.itens || []
    if (dados.grupos) gruposDisponiveis.value = dados.grupos
  } catch (_err) {
    // rede/servidor fora - mostra o aviso e mantém a lista anterior
    showToast('Não foi possível carregar o Radar.', 'warning')
  } finally {
    carregando.value = false
  }
}

function aoMudarPeriodo(intervalo) {
  periodo.value = intervalo
  carregar()
}

function aoMudarAssunto(chaves) {
  gruposSelecionados.value = chaves
  carregar()
}
</script>

<template>
  <div class="radar">
    <div class="view-header">
      <div>
        <h1>Radar</h1>
        <p>
          Publicações de fontes confiáveis que podem merecer sua atenção. O Radar aponta —
          quem lê e conclui é você. A busca roda automaticamente uma vez por semana.
        </p>
      </div>
    </div>

    <div class="radar-howto">
      <span class="radar-howto-icon" aria-hidden="true">ⓘ</span>
      <span>
        Cada item é um <strong>ponto de partida</strong> para você investigar, não uma conclusão.
        O resumo é <strong>leitura da IA e não foi conferido</strong> — abra a fonte antes de mudar
        algo na sua prática.
      </span>
    </div>

    <div class="card radar-filtro">
      <SeletorPeriodo
        :presets="['ultimos_30', 'ultimos_90', 'ano_atual', 'tudo', 'personalizado']"
        inicial="ultimos_90"
        @change="aoMudarPeriodo"
      />
      <div v-if="gruposDisponiveis.length" class="radar-filtro-grupos">
        <span class="radar-filtro-label">Assunto</span>
        <FiltroSegmentado
          :model-value="gruposSelecionados"
          :opcoes="opcoesAssunto"
          rotulo="Assunto"
          multiple
          @update:model-value="aoMudarAssunto"
        />
      </div>
    </div>

    <div v-if="carregando" class="empty-state">Carregando…</div>

    <div v-else-if="!itens.length" class="empty-state">
      <div class="empty-state-icon">📡</div>
      Nada no radar neste período.
    </div>

    <div v-else class="radar-feed">
      <section v-for="mes in meses" :key="mes.chave" class="radar-bucket">
        <div class="radar-bucket-label">{{ mes.rotulo }}</div>

        <article v-for="item in mes.itens" :key="item.id" class="card radar-item">
          <div class="radar-spine">
            <span class="badge" :class="'badge-' + tipoMeta(item.tipo).badge">{{ tipoMeta(item.tipo).rotulo }}</span>
            <span class="radar-src">{{ item.fonte }}</span>
            <span v-if="dataInformada(item.data_informada)" class="radar-when">
              ·
              <abbr title="Data informada pela IA — pode estar imprecisa">{{ dataInformada(item.data_informada) }}</abbr>
            </span>
            <span
              v-if="item.url_status === 'nao_verificado'"
              class="radar-flag"
              title="A IA não conseguiu confirmar que este link abre — confira ao acessar"
            >⚠ link não verificado</span>
          </div>

          <h2 class="radar-title">
            <a :href="item.url" target="_blank" rel="noopener noreferrer">{{ item.titulo }}</a>
          </h2>

          <div class="radar-read">
            <span class="radar-read-tag">Resumo da IA · não conferido</span>
            <p>{{ item.resumo }}</p>
            <p v-if="item.tipo === 'estudo_primario'" class="radar-read-single">
              Estudo isolado — confira o desenho antes de generalizar.
            </p>
            <p class="radar-read-why"><strong>Por que apareceu:</strong> {{ item.motivo_relevancia }}</p>
          </div>

          <div v-if="item.assuntos?.length" class="radar-tags">
            <span v-for="assunto in item.assuntos" :key="assunto" class="radar-tag">{{ assunto }}</span>
          </div>

          <div class="radar-foot">
            <a class="btn btn-primary btn-sm" :href="item.url" target="_blank" rel="noopener noreferrer">
              Abrir fonte ↗
            </a>
          </div>
        </article>
      </section>
    </div>

    <ToastStack :toasts="toasts" />
  </div>
</template>

<style scoped>
/* Cards em largura total (mesma linguagem de Relatos / Histórico). Coluna
   única: "Por que apareceu" é a última linha do bloco da IA. */

.radar-howto {
  display: flex;
  gap: 9px;
  align-items: flex-start;
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-primary);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: 11px 14px;
  margin-bottom: 16px;
  font-size: 12.5px;
  color: var(--color-text-secondary);
  line-height: 1.55;
}
.radar-howto-icon { color: var(--color-primary); font-weight: 700; flex: none; }
.radar-howto strong { color: var(--color-text); font-weight: 700; }

.radar-filtro { padding: 14px 16px; margin-bottom: 24px; display: flex; flex-direction: column; gap: 12px; }
.radar-filtro-grupos {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  border-top: 1px solid var(--color-border);
  padding-top: 12px;
}
.radar-filtro-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-text-faint);
  flex: none;
}
/* no mobile o próprio botão do FiltroSegmentado já rotula ("Assunto: …") */
@media (max-width: 760px) {
  .radar-filtro-label { display: none; }
}

.radar-feed { display: flex; flex-direction: column; gap: 28px; }
.radar-bucket { display: flex; flex-direction: column; gap: 12px; }
.radar-bucket-label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--color-text-faint);
}
.radar-bucket-label::after { content: ''; flex: 1; height: 1px; background: var(--color-border); }

.radar-item {
  padding: 16px 20px 14px;
  display: flex;
  flex-direction: column;
  gap: 11px;
  transition: box-shadow 0.15s ease;
}
.radar-item:hover { box-shadow: var(--shadow-md); }

/* spine: o que É este item, de onde, quando */
.radar-spine {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
  font-size: 12.5px;
  color: var(--color-text-secondary);
}
.radar-src { font-weight: 600; }
.radar-when { color: var(--color-text-faint); font-variant-numeric: tabular-nums; }
.radar-when abbr {
  text-decoration: none;
  border-bottom: 1px dotted var(--color-border-strong);
  cursor: help;
}
.radar-flag {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-warning);
  background: var(--color-warning-light);
  padding: 2px 8px;
  border-radius: var(--radius-full);
}

/* título: o elemento dominante do card, e o link para a fonte */
.radar-title {
  font-size: 16.5px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.005em;
  text-wrap: balance;
}
.radar-title a { color: var(--color-text); }
.radar-title a:hover { color: var(--color-primary-dark); text-decoration: underline; text-underline-offset: 3px; }
.radar-title a:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 3px; border-radius: 3px; }

/* leitura da IA: recuada, sem preenchimento, marcada como não conferida */
.radar-read {
  border-left: 1px solid var(--color-border-strong);
  padding-left: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.radar-read-tag {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-text-faint);
}
.radar-read p { font-size: 13px; color: var(--color-text-secondary); line-height: 1.58; }
.radar-read p.radar-read-single { color: var(--color-warning); font-size: 12.5px; }
.radar-read p.radar-read-why { font-size: 12.5px; color: var(--color-text-faint); }
.radar-read p.radar-read-why strong { color: var(--color-text-secondary); font-weight: 600; }

.radar-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.radar-tag {
  font-size: 11px;
  color: var(--color-text-secondary);
  background: #eef0f4;
  border-radius: var(--radius-full);
  padding: 3px 9px;
}

/* pé: só a ação principal */
.radar-foot {
  display: flex;
  align-items: center;
  border-top: 1px solid var(--color-border);
  padding-top: 12px;
  margin-top: 2px;
}
.radar-foot .btn { text-decoration: none; }

@media (prefers-reduced-motion: reduce) {
  .radar-item { transition: none; }
}
</style>
