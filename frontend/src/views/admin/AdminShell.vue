<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth.store.js'
import registrosService from '../../services/registros.service.js'
import usuariosService from '../../services/usuarios.service.js'
import { iniciais, corParaId } from '../../utils/registroStatus.js'
import ConfirmDialog from '../../components/ConfirmDialog.vue'

const NAV_ITEMS = [
  { grupo: 'Visão geral', itens: [{ nome: 'admin-dashboard', icone: '📊', label: 'Dashboard' }] },
  {
    grupo: 'Operação',
    itens: [
      { nome: 'admin-alunos', icone: '👥', label: 'Alunos' },
      { nome: 'admin-exercicios', icone: '🏋️', label: 'Exercícios' },
      { nome: 'admin-registros', icone: '🎙️', label: 'Relatos' },
      { nome: 'admin-revisao', icone: '✅', label: 'Revisão', badge: true }
    ]
  },
  {
    grupo: 'Registros',
    itens: [
      { nome: 'admin-historico', icone: '🕒', label: 'Histórico' },
      { nome: 'admin-atendimentos', icone: '📈', label: 'Atendimentos' }
    ]
  },
  {
    grupo: 'Radar',
    itens: [{ nome: 'admin-radar', icone: '📡', label: 'Radar' }]
  },
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

// Navegação em drawer no mobile (desktop mantém a sidebar fixa) — fecha ao
// trocar de rota e ao tocar no overlay.
const menuAberto = ref(false)
watch(() => route.fullPath, () => { menuAberto.value = false })

const pendentesRevisao = ref(0)
let intervalId = null

async function atualizarContadores() {
  try {
    const revisao = await registrosService.listar({ status: 'aguardando_revisao' })
    pendentesRevisao.value = revisao.length
  } catch (_err) {
    // silencioso - contador só reflete a última leitura bem-sucedida
  }
}

onMounted(() => {
  atualizarContadores()
  intervalId = setInterval(atualizarContadores, 20000)
})
onBeforeUnmount(() => clearInterval(intervalId))

// Avatar do próprio usuário logado (topbar + rodapé da sidebar) - blob
// buscado sob autenticação, mesmo padrão de AlunosView/AlunoDetalheView.
const fotoUrl = ref(null)
async function carregarFotoPropria() {
  if (fotoUrl.value) {
    URL.revokeObjectURL(fotoUrl.value)
    fotoUrl.value = null
  }
  if (!auth.usuario?.foto_caminho) return
  try {
    const blob = await usuariosService.obterFotoPropria()
    fotoUrl.value = URL.createObjectURL(blob)
  } catch (_err) {
    // sem foto disponível - fica só com as iniciais
  }
}
onMounted(carregarFotoPropria)
watch(() => auth.usuario?.foto_caminho, carregarFotoPropria)
onBeforeUnmount(() => {
  if (fotoUrl.value) URL.revokeObjectURL(fotoUrl.value)
})

function sair() {
  auth.logout()
  router.replace('/login')
}
</script>

<template>
  <div class="app-shell" :class="{ 'menu-aberto': menuAberto }">
    <div class="drawer-overlay" @click="menuAberto = false"></div>
    <aside class="sidebar" :class="{ open: menuAberto }">
      <div class="sidebar-brand">
        <div class="sidebar-brand-mark">🏋️</div>
        <div>
          <div class="sidebar-brand-name">Personal Assistant</div>
          <div class="sidebar-brand-sub">Painel de gestão</div>
        </div>
        <button class="sidebar-close" type="button" aria-label="Fechar menu" @click="menuAberto = false">✕</button>
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
        <img v-if="fotoUrl" :src="fotoUrl" class="avatar" alt="" />
        <span v-else class="avatar" :style="{ background: corParaId(auth.usuario?.id) }">{{ iniciais(auth.usuario?.nome) }}</span>
        <div>
          <div class="sidebar-footer-name">{{ auth.usuario?.nome }}</div>
          <div class="sidebar-footer-team">{{ auth.usuario?.equipe?.nome }}</div>
          <button class="sidebar-footer-role" type="button" @click="sair">Sair</button>
        </div>
      </div>
    </aside>

    <div class="main-col">
      <header class="topbar">
        <button class="topbar-menu-btn" type="button" aria-label="Abrir menu" @click="menuAberto = true">☰</button>
        <div class="topbar-title">{{ route.meta.titulo || '' }}</div>
        <div class="topbar-right">
          <img v-if="fotoUrl" :src="fotoUrl" class="avatar sz-sm" alt="" />
          <span v-else class="avatar sz-sm" :style="{ background: corParaId(auth.usuario?.id) }">{{ iniciais(auth.usuario?.nome) }}</span>
        </div>
      </header>

      <main class="content">
        <router-view @registro-processado="atualizarContadores" />
      </main>
    </div>

    <ConfirmDialog />
  </div>
</template>
