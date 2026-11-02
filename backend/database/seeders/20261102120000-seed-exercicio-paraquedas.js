"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const env = require("../../src/config/env");
const { NOVOS } = require("../dados/exercicios-globais-v2");
const { idNovo, inserirApelidos } = require("./20261031120100-seed-exercicios-globais-v2");

// "Paraquedas" incluído no catálogo global depois do v2 (docs/adr/0027). O
// cadastro mora em NOVOS (dados/exercicios-globais-v2.js) - num banco novo os
// seeders do v2 já o criam e este passa direto; nos bancos que já rodaram o v2
// (seederStorage não repete), é este que insere exercício, apelidos e imagens.
// Idempotente e no mesmo padrão: não sobrescreve imagem que o personal já
// tenha enviado.
const CODIGOS = ["paraquedas"];
const ASSETS_DIR = path.resolve(__dirname, "assets", "exercicios-globais");
const POSICOES = { inicio: "midia_imagem_inicio_caminho", fim: "midia_imagem_fim_caminho" };

const novos = () => NOVOS.filter((novo) => CODIGOS.includes(novo.codigo));

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const novo of novos()) {
        const id = idNovo(novo.codigo);
        await queryInterface.sequelize.query(
          `INSERT INTO exercicio (id, equipe_id, nome, grupo_muscular, equipamento, dificuldade, instrucoes, ativo, created_at, updated_at)
           VALUES (:id, NULL, :nome, :grupoMuscular, :equipamento, :dificuldade, :instrucoes, TRUE, NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          { replacements: { id, ...novo }, transaction }
        );
        await inserirApelidos(queryInterface, id, novo.apelidos, transaction);
      }
    });

    const storageDir = path.resolve(__dirname, "..", "..", env.exercicioImagemStorageDir);
    await fs.mkdir(storageDir, { recursive: true });
    const arquivos = await fs.readdir(ASSETS_DIR);

    for (const novo of novos()) {
      const id = idNovo(novo.codigo);
      for (const [posicao, campo] of Object.entries(POSICOES)) {
        const nomeArquivo = arquivos.find((arquivo) => arquivo.startsWith(`exercicio-${id}-${posicao}.`));
        if (!nomeArquivo) continue;
        const destino = path.join(storageDir, nomeArquivo);
        try {
          await fs.access(destino);
        } catch {
          await fs.copyFile(path.join(ASSETS_DIR, nomeArquivo), destino);
        }
        await queryInterface.sequelize.query(
          `UPDATE exercicio SET ${campo} = :nomeArquivo WHERE id = :id AND equipe_id IS NULL AND ${campo} IS NULL`,
          { replacements: { id, nomeArquivo } }
        );
      }
    }
  },

  // Remove o exercício (falha se já estiver numa ficha - aí a volta é manual),
  // os apelidos globais e as imagens copiadas.
  async down(queryInterface) {
    const ids = novos().map((novo) => idNovo(novo.codigo));
    const storageDir = path.resolve(__dirname, "..", "..", env.exercicioImagemStorageDir);
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        "DELETE FROM exercicio_apelido WHERE equipe_id IS NULL AND exercicio_id IN (:ids)",
        { replacements: { ids }, transaction }
      );
      await queryInterface.sequelize.query("DELETE FROM exercicio WHERE equipe_id IS NULL AND id IN (:ids)", {
        replacements: { ids },
        transaction
      });
    });
    const arquivos = await fs.readdir(ASSETS_DIR);
    for (const id of ids) {
      for (const nomeArquivo of arquivos.filter((arquivo) => arquivo.startsWith(`exercicio-${id}-`))) {
        await fs.unlink(path.join(storageDir, nomeArquivo)).catch(() => {});
      }
    }
  }
};
