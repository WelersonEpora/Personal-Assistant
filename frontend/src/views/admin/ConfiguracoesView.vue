<script setup>
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth.store.js'

const auth = useAuthStore()
const router = useRouter()

function sair() {
  auth.logout()
  router.replace('/login')
}
</script>

<template>
  <div>
    <div class="view-header">
      <div>
        <h1>Configurações</h1>
        <p>Preferências da sua conta.</p>
      </div>
    </div>

    <div class="settings-section">
      <h3>Perfil</h3>
      <div class="form-grid">
        <div class="form-field"><label>Nome</label><input type="text" :value="auth.usuario?.nome" disabled /></div>
        <div class="form-field"><label>E-mail</label><input type="email" :value="auth.usuario?.email" disabled /></div>
        <div class="form-field form-field-full">
          <label>Especialidade</label>
          <input type="text" :value="auth.usuario?.especialidade || '—'" disabled />
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h3>Sobre</h3>
      <p style="font-size: 13px; color: var(--color-text-secondary); max-width: 640px; line-height: 1.6;">
        Personal Assistant — MVP v0.1. Edição de perfil e preferências de captura/sincronização chegam em versões
        futuras — este MVP foca no fluxo de captura, transcrição, interpretação por IA e validação.
      </p>
    </div>

    <button class="btn btn-secondary" type="button" @click="sair">Sair da conta</button>
  </div>
</template>
