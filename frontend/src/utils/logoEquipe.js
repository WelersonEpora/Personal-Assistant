// docs/adr/0030: logo da equipe. Ele chega por colar (Ctrl+V), arrastar ou
// escolher arquivo, e é reduzido no navegador antes de subir. Print de tela
// ou imagem copiada costuma vir com vários MB, e o logo só precisa de
// ~512px para o PDF e o cabeçalho da ficha. PNG mantém a transparência.

export const LADO_MAXIMO_LOGO = 512
export const TIPOS_ACEITOS = ['image/png', 'image/jpeg', 'image/webp']

// Mantém a proporção; nunca amplia uma imagem que já é pequena.
export function dimensoesReduzidas(largura, altura, ladoMaximo = LADO_MAXIMO_LOGO) {
  const maior = Math.max(largura, altura)
  if (!maior || maior <= ladoMaximo) return { largura, altura }
  const escala = ladoMaximo / maior
  return {
    largura: Math.max(1, Math.round(largura * escala)),
    altura: Math.max(1, Math.round(altura * escala))
  }
}

// Primeira imagem de um DataTransfer (evento paste ou drop). Devolve null se
// não houver, por exemplo quando o que se colou foi texto ou código SVG.
export function imagemDoDataTransfer(dataTransfer) {
  if (!dataTransfer) return null
  for (const item of Array.from(dataTransfer.items || [])) {
    if (item.kind === 'file' && TIPOS_ACEITOS.includes(item.type)) {
      const arquivo = item.getAsFile()
      if (arquivo) return arquivo
    }
  }
  for (const arquivo of Array.from(dataTransfer.files || [])) {
    if (TIPOS_ACEITOS.includes(arquivo.type)) return arquivo
  }
  return null
}

// Só no navegador (canvas). Sempre devolve PNG, mesmo que a entrada seja
// JPEG/WebP: um formato só no backend e transparência preservada.
export async function reduzirLogo(arquivo, ladoMaximo = LADO_MAXIMO_LOGO) {
  const bitmap = await createImageBitmap(arquivo)
  try {
    const { largura, altura } = dimensoesReduzidas(bitmap.width, bitmap.height, ladoMaximo)
    const canvas = document.createElement('canvas')
    canvas.width = largura
    canvas.height = altura
    canvas.getContext('2d').drawImage(bitmap, 0, 0, largura, altura)
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Falha ao converter a imagem.'))), 'image/png')
    })
  } finally {
    bitmap.close?.()
  }
}
