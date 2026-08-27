"use strict";

// Imagem de exercício deixa de ser link externo e passa a ser self-hosted,
// mesmo padrão de aluno.foto_caminho (disco local / volume Docker, docs/adr/0010).
// Duas imagens por exercício (posição inicial/final do movimento, mesmo
// padrão do free-exercise-db, fonte do catálogo global - docs/adr/0013),
// não um array genérico: a forma é sempre exatamente 2, então duas colunas
// explícitas são mais simples que modelar "N imagens" sem necessidade real.
// Vídeo continua como link externo (fora de escopo o self-host de vídeo).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.removeColumn("exercicio", "midia_imagem_url");
    await queryInterface.addColumn("exercicio", "midia_imagem_inicio_caminho", { type: Sequelize.STRING(255), allowNull: true });
    await queryInterface.addColumn("exercicio", "midia_imagem_fim_caminho", { type: Sequelize.STRING(255), allowNull: true });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("exercicio", "midia_imagem_fim_caminho");
    await queryInterface.removeColumn("exercicio", "midia_imagem_inicio_caminho");
    await queryInterface.addColumn("exercicio", "midia_imagem_url", { type: Sequelize.STRING(500), allowNull: true });
  }
};
