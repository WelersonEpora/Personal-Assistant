"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const env = require("../../src/config/env");
const { NOVOS } = require("../dados/exercicios-globais-v2");
const { idNovo } = require("./20261031120100-seed-exercicios-globais-v2");

// Imagens dos exercícios novos do catálogo revisado (docs/adr/0027), no mesmo
// padrão de 20260827200000-seed-exercicios-globais-imagens.js: assets
// commitados em assets/exercicios-globais/ (free-exercise-db, domínio
// público), copiados para o storage - no servidor, o volume Docker - sem
// depender de rede no deploy. Aquele seeder já rodou nos bancos existentes e
// não roda de novo; este cobre só os ids dos exercícios novos.
//
// Os 5 sem equivalente bom no free-exercise-db (puxada articulada, leg press
// horizontal, glúteo máquina, elevação lateral na polia, polichinelo) têm
// imagens geradas com IA a partir de fotos de referência do catálogo. Exercício
// sem asset fica sem imagem. Não sobrescreve imagem que o personal já tenha
// enviado.
const ASSETS_DIR = path.resolve(__dirname, "assets", "exercicios-globais");
const POSICOES = { inicio: "midia_imagem_inicio_caminho", fim: "midia_imagem_fim_caminho" };

async function assetsDoExercicio(id) {
  const arquivos = await fs.readdir(ASSETS_DIR);
  const imagens = {};
  for (const posicao of Object.keys(POSICOES)) {
    imagens[posicao] = arquivos.find((arquivo) => arquivo.startsWith(`exercicio-${id}-${posicao}.`)) || null;
  }
  return imagens;
}

module.exports = {
  async up(queryInterface) {
    const storageDir = path.resolve(__dirname, "..", "..", env.exercicioImagemStorageDir);
    await fs.mkdir(storageDir, { recursive: true });

    for (const novo of NOVOS) {
      const id = idNovo(novo.codigo);
      const imagens = await assetsDoExercicio(id);

      for (const [posicao, nomeArquivo] of Object.entries(imagens)) {
        if (!nomeArquivo) continue;
        const destino = path.join(storageDir, nomeArquivo);
        try {
          await fs.access(destino);
        } catch {
          await fs.copyFile(path.join(ASSETS_DIR, nomeArquivo), destino);
        }
        const campo = POSICOES[posicao];
        await queryInterface.sequelize.query(
          `UPDATE exercicio SET ${campo} = :nomeArquivo WHERE id = :id AND equipe_id IS NULL AND ${campo} IS NULL`,
          { replacements: { id, nomeArquivo } }
        );
      }
    }
  },

  async down(queryInterface) {
    const storageDir = path.resolve(__dirname, "..", "..", env.exercicioImagemStorageDir);

    for (const novo of NOVOS) {
      const id = idNovo(novo.codigo);
      const imagens = await assetsDoExercicio(id);
      for (const [posicao, nomeArquivo] of Object.entries(imagens)) {
        if (!nomeArquivo) continue;
        const campo = POSICOES[posicao];
        await queryInterface.sequelize.query(
          `UPDATE exercicio SET ${campo} = NULL WHERE id = :id AND equipe_id IS NULL AND ${campo} = :nomeArquivo`,
          { replacements: { id, nomeArquivo } }
        );
        await fs.unlink(path.join(storageDir, nomeArquivo)).catch(() => {});
      }
    }
  }
};
