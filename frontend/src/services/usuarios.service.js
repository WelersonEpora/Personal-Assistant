import http from './http.js'

// Só a própria foto do usuário autenticado (qualquer papel) - usada pro
// avatar da topbar/sidebar em AdminShell.vue. Editar foto (própria ou de
// outro membro) é exclusivo do owner, ver membros.service.js.
async function obterFotoPropria() {
  const { data } = await http.get('/api/v1/usuarios/me/foto', { responseType: 'blob' })
  return data
}

export default { obterFotoPropria }
