import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth.store.js'

const routes = [
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { publica: true } },
  { path: '/captura', name: 'captura', component: () => import('../views/captura/CapturaView.vue') },
  {
    path: '/admin',
    component: () => import('../views/admin/AdminShell.vue'),
    children: [
      { path: '', redirect: { name: 'admin-dashboard' } },
      { path: 'dashboard', name: 'admin-dashboard', component: () => import('../views/admin/DashboardView.vue'), meta: { titulo: 'Dashboard' } },
      { path: 'alunos', name: 'admin-alunos', component: () => import('../views/admin/AlunosView.vue'), meta: { titulo: 'Alunos' } },
      {
        path: 'alunos/:id',
        name: 'admin-aluno-detalhe',
        component: () => import('../views/admin/AlunoDetalheView.vue'),
        props: true,
        meta: { titulo: 'Alunos' }
      },
      { path: 'registros', name: 'admin-registros', component: () => import('../views/admin/RegistrosView.vue'), meta: { titulo: 'Relatos' } },
      {
        path: 'revisao/:id?',
        name: 'admin-revisao',
        component: () => import('../views/admin/RevisaoView.vue'),
        props: true,
        meta: { titulo: 'Revisão da IA' }
      },
      { path: 'historico', name: 'admin-historico', component: () => import('../views/admin/HistoricoView.vue'), meta: { titulo: 'Histórico' } },
      {
        path: 'historico/:id',
        name: 'admin-historico-detalhe',
        component: () => import('../views/admin/HistoricoDetalheView.vue'),
        props: true,
        meta: { titulo: 'Histórico' }
      },
      {
        path: 'equipe',
        name: 'admin-equipe',
        component: () => import('../views/admin/EquipeView.vue'),
        meta: { titulo: 'Equipe', somenteOwner: true }
      },
      {
        path: 'configuracoes',
        name: 'admin-configuracoes',
        component: () => import('../views/admin/ConfiguracoesView.vue'),
        meta: { titulo: 'Configurações' }
      }
    ]
  },
  { path: '/', redirect: '/login' },
  { path: '/:pathMatch(.*)*', redirect: '/login' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (!to.meta.publica && !auth.autenticado) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && auth.autenticado) {
    return window.innerWidth < 760 ? { name: 'captura' } : { name: 'admin-dashboard' }
  }
  // Defesa em profundidade - a autorização real é o 403 do backend
  // (exigirOwner). Aqui só evita mostrar a tela pra quem não deveria vê-la.
  if (to.meta.somenteOwner && auth.usuario?.papel !== 'owner') {
    return { name: 'admin-dashboard' }
  }
  return true
})

export default router
