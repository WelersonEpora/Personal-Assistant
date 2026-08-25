<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.store.js'

const email = ref('')
const senha = ref('')
const carregando = ref(false)
const erro = ref('')

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

async function entrar() {
  erro.value = ''
  carregando.value = true
  try {
    await auth.login(email.value.trim(), senha.value)
    const destino = route.query.redirect || (window.innerWidth < 760 ? '/captura' : '/admin/dashboard')
    router.replace(destino)
  } catch (err) {
    erro.value = err.response?.status === 401 ? 'E-mail ou senha inválidos.' : 'Não foi possível entrar. Tente novamente.'
  } finally {
    carregando.value = false
  }
}
</script>

<template>
  <div class="login-screen">
    <form class="login-card card" @submit.prevent="entrar">
      <div class="login-brand">
        <div class="sidebar-brand-mark">🏋️</div>
        <div>
          <div class="login-brand-name">Personal Assistant</div>
          <div class="login-brand-sub">Entrar na sua conta</div>
        </div>
      </div>

      <div class="form-field">
        <label for="email">E-mail</label>
        <input id="email" v-model="email" type="email" required autocomplete="username" />
      </div>
      <div class="form-field">
        <label for="senha">Senha</label>
        <input id="senha" v-model="senha" type="password" required autocomplete="current-password" />
      </div>

      <p v-if="erro" class="login-erro">{{ erro }}</p>

      <button class="btn btn-primary login-submit" type="submit" :disabled="carregando">
        {{ carregando ? 'Entrando…' : 'Entrar' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.login-screen {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--color-bg);
}
.login-card { width: 100%; max-width: 360px; padding: 28px 26px; display: flex; flex-direction: column; gap: 16px; }
.login-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
.login-brand-name { font-size: 16px; font-weight: 800; }
.login-brand-sub { font-size: 12.5px; color: var(--color-text-secondary); }
.login-submit { margin-top: 6px; width: 100%; padding: 12px; }
.login-erro { font-size: 12.5px; color: var(--color-danger); margin: 0; }
</style>
