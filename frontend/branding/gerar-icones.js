// Separa o boneco branco do fundo índigo e monta os ícones do app.
// Rodado uma vez, à mão - `sharp` NÃO é dependência do projeto: instalar numa
// pasta temporária (npm i sharp@0.33.5) e rodar de lá:
//   node gerar-icones.js frontend/branding/icone-origem.png frontend/public/icons
// (saída: icon-192/512, icon-maskable-512, apple-touch-icon, favicon-48,
// marca-figura - além de figura-branca.png, que não vai para public/).
const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const [origem, saida] = process.argv.slice(2)
const ROXO = '#4f46e5'

async function main() {
  fs.mkdirSync(saida, { recursive: true })
  const { data, info } = await sharp(origem).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H } = info

  // cor do fundo: amostra no índigo, à esquerda do boneco
  const px = (x, y) => { const i = (y * W + x) * 3; return [data[i], data[i + 1], data[i + 2]] }
  const fundo = px(110, Math.round(H / 2))
  console.log('fundo amostrado', fundo)

  // só considera o miolo do quadrado (cantos brancos de fora ficam de fora)
  const M = 90, R = 160
  function dentro(x, y) {
    const x0 = M, y0 = M, x1 = W - M, y1 = H - M
    if (x < x0 || x > x1 || y < y0 || y > y1) return false
    const cx = x < x0 + R ? x0 + R : x > x1 - R ? x1 - R : x
    const cy = y < y0 + R ? y0 + R : y > y1 - R ? y1 - R : y
    return (x - cx) ** 2 + (y - cy) ** 2 <= R * R
  }

  // alfa pelo canal verde (o mais baixo no índigo): branco = 1, fundo = 0
  const g0 = fundo[1]
  const rgba = Buffer.alloc(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      let a = 0
      if (dentro(x, y)) {
        a = (data[i * 3 + 1] - g0) / (255 - g0)
        a = Math.min(1, Math.max(0, a))
        a = a < 0.04 ? 0 : a > 0.96 ? 1 : a
      }
      rgba[i * 4] = 255; rgba[i * 4 + 1] = 255; rgba[i * 4 + 2] = 255
      rgba[i * 4 + 3] = Math.round(a * 255)
    }
  }
  const figura = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).trim().png().toBuffer()
  const meta = await sharp(figura).metadata()
  console.log('figura', meta.width, 'x', meta.height)
  fs.writeFileSync(path.join(saida, 'figura-branca.png'), figura)

  // figura centralizada num canvas de lado S, ocupando `escala` do lado (pela maior dimensão)
  async function compor(S, escala, { arredondado = false, raio = 0.22, fundoCor = ROXO } = {}) {
    const lado = Math.round(S * escala)
    const fig = await sharp(figura).resize(lado, lado, { fit: 'inside' }).toBuffer()
    const fm = await sharp(fig).metadata()
    const fundoSvg = arredondado
      ? `<svg width="${S}" height="${S}"><rect width="${S}" height="${S}" rx="${S * raio}" fill="${fundoCor}"/></svg>`
      : `<svg width="${S}" height="${S}"><rect width="${S}" height="${S}" fill="${fundoCor}"/></svg>`
    return sharp(Buffer.from(fundoSvg))
      .composite([{ input: fig, left: Math.round((S - fm.width) / 2), top: Math.round((S - fm.height) / 2) }])
      .png()
      .toBuffer()
  }

  const arquivos = {
    'icon-192.png': await compor(192, 0.7, { arredondado: true }),
    'icon-512.png': await compor(512, 0.7, { arredondado: true }),
    // maskable: o Android recorta em círculo e garante só os 80% centrais
    'icon-maskable-512.png': await compor(512, 0.54),
    // iOS arredonda sozinho e não aceita transparência
    'apple-touch-icon.png': await compor(180, 0.64),
    // aba do navegador: figura maior para ler em 16–32 px
    'favicon-48.png': await compor(48, 0.8, { arredondado: true, raio: 0.2 }),
    // quadradinho do topo da sidebar / login (o fundo é o gradiente do CSS)
    'marca-figura.png': await sharp(figura).resize(96, 96, { fit: 'inside' }).png().toBuffer()
  }
  for (const [nome, buf] of Object.entries(arquivos)) fs.writeFileSync(path.join(saida, nome), buf)
  console.log('ok:', Object.keys(arquivos).join(', '))
}

main().catch((e) => { console.error(e); process.exit(1) })
