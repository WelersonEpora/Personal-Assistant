"use strict";

const { idNovo } = require("./20261031120100-seed-exercicios-globais-v2");
const { incluirNovos, removerNovos } = require("./20261102120000-seed-exercicio-paraquedas");
const { normalizarTexto } = require("../../src/shared/utils/texto");

// "Abdução de quadril com elevação pélvica" incluído no catálogo global
// (dados em NOVOS, imagens nos assets). A abdução com arco é feita em ponte:
// "abdução com arco" e "abdução de quadril com arco" saem da "Abdução de
// quadril com miniband" (deitada, 20261102160000) e vêm para este - senão o
// mesmo apelido apontaria para os dois. Num banco novo os seeders do v2 já
// criam os dois certos e isto passa direto.
const APELIDOS_MOVIDOS = ["abdução com arco", "abdução de quadril com arco"];

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM exercicio_apelido
        WHERE equipe_id IS NULL AND exercicio_id = :id AND apelido_normalizado IN (:normalizados)`,
      { replacements: { id: idNovo("abducao-quadril-miniband"), normalizados: APELIDOS_MOVIDOS.map(normalizarTexto) } }
    );
    await incluirNovos(queryInterface, ["abducao-quadril-elevacao-pelvica"]);
  },

  // Só remove o exercício; os apelidos não voltam para a versão deitada.
  down: (queryInterface) => removerNovos(queryInterface, ["abducao-quadril-elevacao-pelvica"])
};
