"use strict";

const { incluirNovos, removerNovos } = require("./20261102120000-seed-exercicio-paraquedas");

// "Adução de quadril com arco" incluído no catálogo global (dados em NOVOS),
// ainda sem imagens nos assets - quando chegarem, um seeder novo chamando
// incluirNovos com o mesmo código as preenche (só onde a imagem está vazia).
// Num banco novo os seeders do v2 já o criam e isto passa direto.
module.exports = {
  up: (queryInterface) => incluirNovos(queryInterface, ["aducao-quadril-arco"]),
  down: (queryInterface) => removerNovos(queryInterface, ["aducao-quadril-arco"])
};
