<script setup>
import { ref, computed } from 'vue'
import radarService from '../../services/radar.service.js'
import { tipoMeta, dataInformada, agruparPorMes, filtrarPorBusca, legendaTipos } from '../../utils/radar.js'
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

// legenda "Como ler os selos" (docs/adr/0022) - conteúdo estático, derivado
// de TIPO_META; fica num <details> colapsado acima do filtro.
const legenda = legendaTipos()

const itens = ref([])
const carregando = ref(true)
const periodo = ref(null) // { de, ate } - definido pelo SeletorPeriodo na montagem
const gruposDisponiveis = ref([]) // [{ chave, nome, assuntos[] }] - vem da API
const gruposSelecionados = ref([]) // chaves ativas no filtro
const fontes = ref([]) // [{ nome, dominio }] - allowlist de config/radar.js, via API
const janelaDias = ref(30) // janela da busca semanal (config/radar.js, via API)

// Card colapsado por padrão (triagem): tipo + título + fonte + data. Expande
// pro resumo/motivo/tags e o link da fonte. Um aberto por vez, igual Relatos.
const expandidoId = ref(null)
function alternarExpandido(id) {
  expandidoId.value = expandidoId.value === id ? null : id
}

// Busca textual client-side no título + resumo (docs/adr/0022 §9) - o feed
// já vem inteiro do período/assunto (a tela não pagina, ver radar.service).
const busca = ref('')
const itensFiltrados = computed(() => filtrarPorBusca(itens.value, busca.value))
const meses = computed(() => agruparPorMes(itensFiltrados.value))
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
    if (dados.fontes) fontes.value = dados.fontes
    if (dados.janela_dias) janelaDias.value = dados.janela_dias
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

    <div class="radar-ref-grupo">
      <details v-if="fontes.length" class="radar-ref">
        <summary>
          <span class="radar-ref-icon" aria-hidden="true">🔎</span>
          Fontes e assuntos priorizados na busca
        </summary>
        <div class="radar-ref-corpo">
          <p class="radar-ref-intro">
            Uma varredura por semana, só com publicações dos últimos {{ janelaDias }} dias.
            Fora disso não entra no Radar.
          </p>

          <div class="radar-busca-secao">
            <p class="radar-busca-rotulo">Fontes ({{ fontes.length }})</p>
            <p class="radar-fontes-lista">{{ fontes.map((f) => f.nome).join(' · ') }}.</p>
          </div>

          <div v-if="gruposDisponiveis.length" class="radar-busca-secao">
            <p class="radar-busca-rotulo">Assuntos, por grupo</p>
            <div v-for="g in gruposDisponiveis" :key="g.chave" class="radar-busca-grupo">
              <p class="radar-busca-grupo-nome">{{ g.nome }}</p>
              <ul class="radar-busca-grupo-assuntos">
                <li v-for="a in g.assuntos" :key="a">{{ a }}</li>
              </ul>
            </div>
          </div>
        </div>
      </details>

      <details class="radar-ref">
        <summary>
          <span class="radar-ref-icon" aria-hidden="true">🏷️</span>
          Como ler os selos
        </summary>
        <div class="radar-ref-corpo">
          <div v-for="familia in legenda" :key="familia.chave" class="radar-legenda-familia">
            <p class="radar-legenda-familia-titulo">
              {{ familia.rotulo }}
              <span class="radar-legenda-familia-obs">— {{ familia.descricao }}</span>
            </p>
            <div v-for="t in familia.tipos" :key="t.chave" class="radar-legenda-tipo">
              <span class="badge" :class="'badge-' + t.badge">{{ t.rotulo }}</span>
              <span class="radar-legenda-tipo-desc">{{ t.descricao }}</span>
            </div>
          </div>

          <div class="radar-legenda-familia">
            <p class="radar-legenda-familia-titulo">
              Outros selos
            </p>
            <div class="radar-legenda-tipo">
              <span class="radar-flag">⚠ link não confirmado</span>
              <span class="radar-legenda-tipo-desc">
                A checagem automática não recebeu resposta limpa do endereço (o site costuma
                bloquear robôs). Não quer dizer link quebrado — em geral abre normal no navegador.
              </span>
            </div>
          </div>

          <p class="radar-legenda-nota">
            O tipo é a classificação da IA, não um selo de qualidade — a cor agrupa por
            categoria de documento, não por confiabilidade. Abra a fonte antes de concluir.
          </p>
        </div>
      </details>
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
      <input
        v-model="busca"
        type="search"
        class="search-input radar-busca"
        placeholder="Buscar por título, resumo ou assunto…"
        aria-label="Buscar por título, resumo ou assunto"
      />
    </div>

    <div v-if="carregando" class="empty-state">Carregando…</div>

    <div v-else-if="!meses.length" class="empty-state">
      <div class="empty-state-icon">{{ busca.trim() ? '🔍' : '📡' }}</div>
      <template v-if="busca.trim()">Nada corresponde a “{{ busca.trim() }}”.</template>
      <template v-else>Nada no radar neste período.</template>
    </div>

    <div v-else class="radar-feed">
      <section v-for="mes in meses" :key="mes.chave" class="radar-bucket">
        <div class="radar-bucket-label">{{ mes.rotulo }}</div>

        <article
          v-for="item in mes.itens"
          :key="item.id"
          class="card radar-item row-clickable"
          @click="alternarExpandido(item.id)"
        >
          <div class="radar-item-head">
            <div class="radar-item-main">
              <h2 class="radar-title">{{ item.titulo }}</h2>

              <div class="radar-meta">
                <span class="radar-src">{{ item.fonte }}</span>
                <span v-if="dataInformada(item.data_informada)" class="radar-when">
                  ·
                  <abbr title="Data informada pela IA — pode estar imprecisa">{{ dataInformada(item.data_informada) }}</abbr>
                </span>
              </div>

              <div class="radar-spine">
                <span class="badge" :class="'badge-' + tipoMeta(item.tipo).badge">{{ tipoMeta(item.tipo).rotulo }}</span>
                <span
                  v-if="item.url_status === 'nao_verificado'"
                  class="radar-flag"
                  title="Nossa checagem automática não recebeu resposta limpa deste endereço (o site pode ter bloqueado o robô). Costuma abrir normal no navegador."
                >⚠ link não confirmado</span>
              </div>
            </div>
            <span class="radar-chevron" :class="{ aberto: expandidoId === item.id }" aria-hidden="true">▼</span>
          </div>

          <div v-if="expandidoId === item.id" class="radar-item-corpo" @click.stop>
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

/* painéis de referência colapsados (fontes + legenda dos selos): dois
   <details> gêmeos entre o aviso e o filtro. Mais leves que o card do aviso -
   informação de consulta, não a ressalva central. */
.radar-ref-grupo {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 24px;
}
.radar-ref {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  font-size: 12.5px;
}
.radar-ref > summary {
  cursor: pointer;
  padding: 9px 13px;
  font-weight: 700;
  color: var(--color-text-secondary);
  list-style-position: inside;
}
.radar-ref-icon { margin-right: 5px; }
.radar-ref[open] > summary { border-bottom: 1px solid var(--color-border); }
.radar-ref-corpo {
  padding: 12px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.radar-ref-intro { margin: 0; color: var(--color-text-faint); line-height: 1.55; }
.radar-busca-secao { display: flex; flex-direction: column; gap: 6px; }
.radar-busca-rotulo {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-text-faint);
}
.radar-fontes-lista {
  margin: 0;
  color: var(--color-text-secondary);
  line-height: 1.6;
}
.radar-busca-grupo { margin-top: 2px; }
.radar-busca-grupo-nome {
  margin: 0 0 2px;
  font-weight: 700;
  color: var(--color-text);
  line-height: 1.5;
}
.radar-busca-grupo-assuntos {
  margin: 0 0 8px;
  padding-left: 18px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}
.radar-busca-grupo-assuntos li { margin: 1px 0; }
.radar-legenda-familia { display: flex; flex-direction: column; gap: 7px; }
.radar-legenda-familia-titulo {
  margin: 0;
  font-weight: 700;
  color: var(--color-text);
  line-height: 1.5;
}
.radar-legenda-familia-obs { font-weight: 400; color: var(--color-text-faint); }
.radar-legenda-tipo {
  display: flex;
  align-items: baseline;
  gap: 9px;
  padding-left: 4px;
}
.radar-legenda-tipo .badge,
.radar-legenda-tipo .radar-flag { flex: none; }
.radar-legenda-tipo-desc { color: var(--color-text-secondary); line-height: 1.5; }
.radar-legenda-nota {
  margin: 2px 0 0;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
  color: var(--color-text-faint);
  line-height: 1.55;
}
@media (max-width: 560px) {
  .radar-legenda-tipo { flex-direction: column; gap: 3px; }
}

.radar-filtro { padding: 14px 16px; margin-bottom: 24px; display: flex; flex-direction: column; gap: 12px; }
.radar-busca { width: 100%; }
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
  padding: 14px 18px;
  transition: box-shadow 0.15s ease;
}
.radar-item:hover { box-shadow: var(--shadow-md); }

/* cabeçalho sempre visível: tipo + título + fonte/data + chevron */
.radar-item-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.radar-item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.radar-chevron {
  flex: none;
  margin-top: 1px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 1;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  transition: transform 0.15s ease, background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.radar-item:hover .radar-chevron {
  background: var(--color-surface-alt);
  border-color: var(--color-border-strong);
  color: var(--color-primary);
}
.radar-chevron.aberto {
  transform: rotate(180deg);
  color: var(--color-primary);
  border-color: var(--color-primary-light);
  background: var(--color-primary-light);
}

/* spine: o TIPO de documento, a espinha da triagem (+ aviso de link) */
.radar-spine {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
  font-size: 12.5px;
  color: var(--color-text-secondary);
}
.radar-meta {
  display: flex;
  align-items: center;
  gap: 4px;
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

/* corpo revelado ao expandir */
.radar-item-corpo {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 13px;
  padding-top: 13px;
  border-top: 1px solid var(--color-border);
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

/* título: o elemento dominante do card (texto - o link é o botão "Abrir fonte") */
.radar-title {
  font-size: 15.5px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.005em;
  text-wrap: balance;
  color: var(--color-text);
}

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
