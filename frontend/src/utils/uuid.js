// crypto.randomUUID() só existe em contexto seguro (HTTPS ou localhost).
// Em produção sem TLS configurado (ver docs/deploy.md), acessar pelo IP da
// rede local deixa o navegador em contexto inseguro e a função some — sem
// isso o registro.id nunca é gerado e "Iniciar registro" não faz nada.
export function gerarUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40 // versão 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variante RFC4122

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
