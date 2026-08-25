require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });

const common = {
  dialect: "postgres",
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB,
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  migrationStorageTableName: "sequelize_meta",
  seederStorage: "sequelize",
  seederStorageTableName: "sequelize_data"
};

module.exports = {
  development: common,
  test: {
    ...common,
    database: process.env.POSTGRES_DB_TEST || "personal_assistant_test"
  },
  production: common
};
