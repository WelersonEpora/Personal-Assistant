"use strict";

// docs/adr/0024-calculo-percentual-gordura-por-protocolo.md: a densidade
// corporal (ex.: 1,0449 g/mL) passa a ser guardada como métrica calculada.
// Precisa de (a) a unidade 'g/mL' no vocabulário do catálogo e (b) 4 casas no
// storage do valor - NUMERIC(8,3) arredondaria a densidade a ponto de mexer
// ~0,2 na % de gordura. A linha da métrica em si entra pelo seeder
// 20260923100100 (mesmo padrão do catálogo núcleo).
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE metrica_avaliacao_fisica DROP CONSTRAINT ck_metrica_unidade;
      ALTER TABLE metrica_avaliacao_fisica ADD CONSTRAINT ck_metrica_unidade CHECK (
        unidade IN ('kg', 'cm', 'mm', '%', 'L', 'kg/m²', 'mL/kg/min', 'bpm', 'mmHg', 'kcal/dia', 'adimensional', 'g/mL')
      );
      ALTER TABLE avaliacao_fisica_medida ALTER COLUMN valor TYPE NUMERIC(10, 4);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE FROM avaliacao_fisica_medida WHERE metrica_codigo = 'densidade_corporal';
      DELETE FROM metrica_avaliacao_fisica WHERE codigo = 'densidade_corporal';
      ALTER TABLE avaliacao_fisica_medida ALTER COLUMN valor TYPE NUMERIC(8, 3);
      ALTER TABLE metrica_avaliacao_fisica DROP CONSTRAINT ck_metrica_unidade;
      ALTER TABLE metrica_avaliacao_fisica ADD CONSTRAINT ck_metrica_unidade CHECK (
        unidade IN ('kg', 'cm', 'mm', '%', 'L', 'kg/m²', 'mL/kg/min', 'bpm', 'mmHg', 'kcal/dia', 'adimensional')
      );
    `);
  }
};
