"use strict";

const { incluirNovos, removerNovos } = require("./20261102120000-seed-exercicio-paraquedas");

// "Abdução de quadril com miniband" incluído no catálogo global (dados em
// NOVOS, imagens nos assets). Num banco novo os seeders do v2 já o criam e
// isto passa direto.
module.exports = {
  up: (queryInterface) => incluirNovos(queryInterface, ["abducao-quadril-miniband"]),
  down: (queryInterface) => removerNovos(queryInterface, ["abducao-quadril-miniband"])
};
