"use strict";

const { idNovo } = require("./20261031120100-seed-exercicios-globais-v2");
const { incluirNovos } = require("./20261102120000-seed-exercicio-paraquedas");

// Imagens da "Adução de quadril com arco", que entrou sem elas
// (20261102150000). incluirNovos é idempotente no exercício e nos apelidos e
// só preenche imagem vazia - não sobrescreve a que o personal já enviou.
const POSICOES = { inicio: "midia_imagem_inicio_caminho", fim: "midia_imagem_fim_caminho" };

module.exports = {
  up: (queryInterface) => incluirNovos(queryInterface, ["aducao-quadril-arco"]),

  // Só desfaz o que este seeder gravou (o nome do arquivo dos assets); o
  // arquivo copiado no storage fica.
  async down(queryInterface) {
    const id = idNovo("aducao-quadril-arco");
    for (const [posicao, campo] of Object.entries(POSICOES)) {
      await queryInterface.sequelize.query(
        `UPDATE exercicio SET ${campo} = NULL WHERE id = :id AND equipe_id IS NULL AND ${campo} = :nomeArquivo`,
        { replacements: { id, nomeArquivo: `exercicio-${id}-${posicao}.jpg` } }
      );
    }
  }
};
