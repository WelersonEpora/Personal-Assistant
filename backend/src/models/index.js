"use strict";

const sequelize = require("../config/database");

const db = {};

db.Usuario = require("./usuario")(sequelize);
db.Equipe = require("./equipe")(sequelize);
db.Membro = require("./membro")(sequelize);
db.Aluno = require("./aluno")(sequelize);
db.Registro = require("./registro")(sequelize);
db.RegistroEntrada = require("./registroEntrada")(sequelize);
db.ArquivoAudio = require("./arquivoAudio")(sequelize);
db.Transcricao = require("./transcricao")(sequelize);
db.ResultadoIa = require("./resultadoIa")(sequelize);
db.Validacao = require("./validacao")(sequelize);
db.Exercicio = require("./exercicio")(sequelize);
db.FichaTreino = require("./fichaTreino")(sequelize);
db.FichaTreinoExercicio = require("./fichaTreinoExercicio")(sequelize);
db.FichaAcessoLink = require("./fichaAcessoLink")(sequelize);
db.AvaliacaoMensal = require("./avaliacaoMensal")(sequelize);
db.AnaliseSobDemanda = require("./analiseSobDemanda")(sequelize);
db.AvaliacaoPersonal = require("./avaliacaoPersonal")(sequelize);

Object.values(db).forEach((model) => {
  if (model.associate) {
    model.associate(db);
  }
});

db.sequelize = sequelize;

module.exports = db;
