"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const env = require("../../src/config/env");

// Popula as imagens (posição inicial/final) dos exercícios do catálogo
// global a partir de assets já baixados e commitados no repositório
// (backend/database/seeders/assets/exercicios-globais/) - curados a partir
// do free-exercise-db (domínio público, Unlicense), mapeados manualmente
// para os nomes em português do seeder de exercícios
// (20260826170000-seed-exercicios-globais.js). Copiar de um asset já
// commitado em vez de baixar da internet no momento do deploy evita
// depender de acesso à rede no servidor de produção.
//
// Nem todo exercício do catálogo tem um equivalente de boa qualidade no
// free-exercise-db - os que não têm asset aqui simplesmente ficam sem
// imagem (midia_imagem_*_caminho continuam NULL), sem erro.
const ASSETS_DIR = path.resolve(__dirname, "assets", "exercicios-globais");
const NOME_ARQUIVO = /^exercicio-([0-9a-f-]{36})-(inicio|fim)\.(jpg|png|webp)$/;

async function agruparAssetsPorExercicio() {
  const arquivos = await fs.readdir(ASSETS_DIR);
  const porId = {};
  for (const arquivo of arquivos) {
    const match = NOME_ARQUIVO.exec(arquivo);
    if (!match) continue;
    const [, id, posicao] = match;
    porId[id] = porId[id] || {};
    porId[id][posicao] = arquivo;
  }
  return porId;
}

module.exports = {
  async up(queryInterface) {
    const storageDir = path.resolve(__dirname, "..", "..", env.exercicioImagemStorageDir);
    await fs.mkdir(storageDir, { recursive: true });

    const porId = await agruparAssetsPorExercicio();

    for (const [id, imagens] of Object.entries(porId)) {
      for (const [, nomeArquivo] of Object.entries(imagens)) {
        const destino = path.join(storageDir, nomeArquivo);
        try {
          await fs.access(destino);
        } catch {
          await fs.copyFile(path.join(ASSETS_DIR, nomeArquivo), destino);
        }
      }

      // Só atualiza exercícios globais (equipe_id NULL) - segurança extra
      // além do id já ser exclusivo do catálogo global por construção.
      await queryInterface.sequelize.query(
        `UPDATE exercicio SET midia_imagem_inicio_caminho = :inicio, midia_imagem_fim_caminho = :fim
         WHERE id = :id AND equipe_id IS NULL`,
        { replacements: { id, inicio: imagens.inicio || null, fim: imagens.fim || null } }
      );
    }
  },

  async down(queryInterface) {
    const storageDir = path.resolve(__dirname, "..", "..", env.exercicioImagemStorageDir);
    const porId = await agruparAssetsPorExercicio();

    for (const [id, imagens] of Object.entries(porId)) {
      for (const nomeArquivo of Object.values(imagens)) {
        await fs.unlink(path.join(storageDir, nomeArquivo)).catch(() => {});
      }
      await queryInterface.sequelize.query(
        `UPDATE exercicio SET midia_imagem_inicio_caminho = NULL, midia_imagem_fim_caminho = NULL
         WHERE id = :id AND equipe_id IS NULL`,
        { replacements: { id } }
      );
    }
  }
};
