"use strict";

const { idNovo } = require("./20261031120100-seed-exercicios-globais-v2");
const { incluirNovos, removerNovos } = require("./20261102120000-seed-exercicio-paraquedas");

// "Superman" (braços e pernas estendidos) incluído no catálogo global e
// separado do "Paraquedas" (cotovelos e joelhos dobrados) - a 1ª versão do
// Paraquedas trazia "superman" como apelido e uma instrução de braços
// estendidos. Aqui:
// - tira o apelido global "superman" do Paraquedas (senão o nome do Superman
//   colidiria com ele na busca e na interpretação da ficha por voz);
// - corrige a instrução do Paraquedas só se ainda estiver com o texto da 1ª
//   versão (não desfaz edição feita pela tela);
// - inclui o Superman (dados em NOVOS, imagens nos assets).
// Num banco novo os seeders do v2 já criam os dois certos e isto passa direto.
const INSTRUCAO_PARAQUEDAS_V1 =
  "Deitado de bruços, braços à frente: eleve o peito e as pernas do chão levando os braços para trás, segure um instante e volte controlando.";
const INSTRUCAO_PARAQUEDAS =
  "Deitado de bruços: eleve o peito e as pernas do chão com os cotovelos e os joelhos dobrados, segure um instante e volte controlando.";

module.exports = {
  async up(queryInterface) {
    const paraquedasId = idNovo("paraquedas");
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        "DELETE FROM exercicio_apelido WHERE equipe_id IS NULL AND exercicio_id = :id AND apelido_normalizado = 'superman'",
        { replacements: { id: paraquedasId }, transaction }
      );
      await queryInterface.sequelize.query(
        `UPDATE exercicio SET instrucoes = :nova, updated_at = NOW()
          WHERE id = :id AND equipe_id IS NULL AND instrucoes = :antiga`,
        { replacements: { id: paraquedasId, nova: INSTRUCAO_PARAQUEDAS, antiga: INSTRUCAO_PARAQUEDAS_V1 }, transaction }
      );
    });
    await incluirNovos(queryInterface, ["superman"]);
  },

  // Só remove o Superman; não devolve o apelido nem a instrução antiga do
  // Paraquedas (estavam errados).
  down: (queryInterface) => removerNovos(queryInterface, ["superman"])
};
