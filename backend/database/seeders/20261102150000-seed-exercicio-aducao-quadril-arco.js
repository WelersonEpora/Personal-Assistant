"use strict";

const { incluirNovos, removerNovos } = require("./20261102120000-seed-exercicio-paraquedas");

// "Adução de quadril com arco" incluído no catálogo global (dados em NOVOS)
// sem imagens - elas chegaram depois, por
// 20261102170000-seed-exercicio-aducao-quadril-arco-imagens.js.
// Num banco novo os seeders do v2 já o criam e isto passa direto.
module.exports = {
  up: (queryInterface) => incluirNovos(queryInterface, ["aducao-quadril-arco"]),
  down: (queryInterface) => removerNovos(queryInterface, ["aducao-quadril-arco"])
};
