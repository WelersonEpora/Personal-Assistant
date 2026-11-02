"use strict";

const { incluirNovos, removerNovos } = require("./20261102120000-seed-exercicio-paraquedas");

// "Tríceps supinado com halteres" incluído no catálogo global (dados em
// NOVOS, imagens nos assets). Num banco novo os seeders do v2 já o criam e
// isto passa direto.
module.exports = {
  up: (queryInterface) => incluirNovos(queryInterface, ["triceps-supinado-halteres"]),
  down: (queryInterface) => removerNovos(queryInterface, ["triceps-supinado-halteres"])
};
