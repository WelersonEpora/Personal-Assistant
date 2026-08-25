<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth.store.js'
import registrosService from '../../services/registros.service.js'
import { iniciais, corParaId } from '../../utils/registroStatus.js'

const NAV_ITEMS = [
  { grupo: 'Visão geral', itens: [{ nome: 'admin-dashboard', icone: '📊', label: 'Dashboard' }] },
  {
    grupo: 'Operação',
    itens: [
      { nome: 'admin-alunos', icone: '👥', label: 'Alunos' },
      { nome: 'admin-registros', icone: '🎙️', label: 'Relatos' },
      { nome: 'admin-revisao', icone: '✅', label: 'Revisão', badge: true }
    ]
  },
  { grupo: 'Registros', itens: [{ nome: 'admin-historico', icone: '🕒', label: 'Histórico' }] },
  {
    grupo: 'Sistema',
    itens: [
      { nome: 'admin-equipe', icone: '🏢', label: 'Equipe', somenteOwner: true },
      { nome: 'admin-configuracoes', icone: '⚙️', label: 'Configurações' },
      { nome: 'captura', icone: '📱', label: 'Modo captura' }
    ]
  }
]

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const pendentesRevisao = ref(0)
const pendentesProcessamento = ref(0)
let intervalId = null

async function atualizarContadores() {
  try {
    const [revisao, processando] = await Promise.all([
      registrosService.listar({ status: 'aguardando_revisao' }),
      registrosService.listar({})
    ])
    pendentesRevisao.value = revisao.length
    pendentesProcessamento.value = processando.filter((r) =>
      ['recebido', 'transcrevendo', 'interpretando'].includes(r.status)
    ).length
  } catch (_err) {
    // silencioso - contadores só refletem a última leitura bem-sucedida
  }
}

onMounted(() => {
  atualizarContadores()
  intervalId = setInterval(atualizarContadores, 20000)
})
onBeforeUnmount(() => clearInterval(intervalId))

const syncPillTexto = computed(() =>
  pendentesProcessamento.value > 0 ? `Processando ${pendentesProcessamento.value} registro(s)…` : 'Sincronizado'
)

function sair() {
  auth.logout()
  router.replace('/login')
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="sidebar-brand">
        <div class="sidebar-brand-mark">🏋️</div>
        <div>
          <div class="sidebar-brand-name">Personal Assistant</div>
          <div class="sidebar-brand-sub">Painel de gestão</div>
        </div>
      </div>

      <nav>
        <template v-for="grupo in NAV_ITEMS" :key="grupo.grupo">
          <div class="nav-group-label">{{ grupo.grupo }}</div>
          <router-link
            v-for="item in grupo.itens.filter((i) => !i.somenteOwner || auth.usuario?.papel === 'owner')"
            :key="item.nome"
            class="nav-item"
            :to="{ name: item.nome }"
          >
            <span class="nav-icon">{{ item.icone }}</span>{{ item.label
            }}<span v-if="item.badge && pendentesRevisao > 0" class="nav-item-badge">{{ pendentesRevisao }}</span>
          </router-link>
        </template>
      </nav>

      <div class="sidebar-footer">
        <span class="avatar" :style="{ background: corParaId(auth.usuario?.id) }">{{ iniciais(auth.usuario?.nome) }}</span>
        <div>
          <div class="sidebar-footer-name">{{ auth.usuario?.nome }}</div>
          <div class="sidebar-footer-team">{{ auth.usuario?.equipe?.nome }}</div>
          <button class="sidebar-footer-role" type="button" @click="sair">Sair</button>
        </div>
      </div>
    </aside>

    <div class="main-col">
      <header class="topbar">
        <div class="topbar-title">{{ route.meta.titulo || '' }}</div>
        <div class="topbar-right">
          <div class="sync-pill" :class="{ 'state-pending': pendentesProcessamento > 0 }">
            <span class="sync-pill-dot"></span><span>{{ syncPillTexto }}</span>
          </div>
          <span class="avatar sz-sm" :style="{ background: corParaId(auth.usuario?.id) }">{{ iniciais(auth.usuario?.nome) }}</span>
        </div>
      </header>

      <main class="content">
        <router-view @registro-processado="atualizarContadores" />
      </main>
    </div>
  </div>
</template>
