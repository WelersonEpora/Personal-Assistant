"use strict";

// docs/adr/0016-avaliacao-fisica-importada-do-legado.md (proposta v3 §3.2):
// catálogo núcleo das métricas de avaliação física. Fonte única - o seeder
// (database/seeders) e o importador do legado consomem esta mesma lista
// (o importador usa `casas_decimais` para limpar o ruído de float do Access).
//
// Cada linha: [codigo, rotulo, categoria, unidade, casas_decimais, direcao_favoravel]
const METRICAS = [
  // Antropometria (medição direta)
  ["peso", "Peso corporal", "antropometria", "kg", 1, "neutro"],
  ["altura", "Altura", "antropometria", "cm", 1, "neutro"],

  // Composição corporal (derivada - carrega `metodo`)
  ["percentual_gordura", "% de gordura", "composicao", "%", 1, "menor"],
  ["massa_gorda", "Massa gorda", "composicao", "kg", 1, "menor"],
  ["massa_magra", "Massa magra (livre de gordura)", "composicao", "kg", 1, "maior"],
  ["massa_muscular_esqueletica", "Massa muscular esquelética", "composicao", "kg", 1, "maior"],
  ["agua_corporal_total", "Água corporal total", "composicao", "L", 1, "neutro"],
  ["massa_ossea", "Massa óssea", "composicao", "kg", 2, "neutro"],
  ["taxa_metabolica_basal", "Taxa metabólica basal", "composicao", "kcal/dia", 0, "neutro"],

  // Perímetros (medição direta, fita) - todos cm
  ["perimetro_pescoco", "Perímetro do pescoço", "perimetro", "cm", 1, "neutro"],
  ["perimetro_ombro", "Perímetro do ombro", "perimetro", "cm", 1, "neutro"],
  ["perimetro_torax", "Perímetro do tórax", "perimetro", "cm", 1, "neutro"],
  ["perimetro_cintura", "Perímetro da cintura", "perimetro", "cm", 1, "menor"],
  ["perimetro_abdome", "Perímetro do abdome", "perimetro", "cm", 1, "menor"],
  ["perimetro_quadril", "Perímetro do quadril", "perimetro", "cm", 1, "neutro"],
  ["perimetro_braco_d", "Perímetro do braço (direito)", "perimetro", "cm", 1, "neutro"],
  ["perimetro_braco_e", "Perímetro do braço (esquerdo)", "perimetro", "cm", 1, "neutro"],
  ["perimetro_antebraco_d", "Perímetro do antebraço (direito)", "perimetro", "cm", 1, "maior"],
  ["perimetro_antebraco_e", "Perímetro do antebraço (esquerdo)", "perimetro", "cm", 1, "maior"],
  ["perimetro_coxa_d", "Perímetro da coxa (direita)", "perimetro", "cm", 1, "neutro"],
  ["perimetro_coxa_e", "Perímetro da coxa (esquerda)", "perimetro", "cm", 1, "neutro"],
  ["perimetro_panturrilha_d", "Perímetro da panturrilha (direita)", "perimetro", "cm", 1, "maior"],
  ["perimetro_panturrilha_e", "Perímetro da panturrilha (esquerda)", "perimetro", "cm", 1, "maior"],

  // Dobras cutâneas (medição direta, plicômetro) - todas mm, direcao menor
  ["dobra_tricipital", "Dobra tricipital", "dobra", "mm", 1, "menor"],
  ["dobra_bicipital", "Dobra bicipital", "dobra", "mm", 1, "menor"],
  ["dobra_peitoral", "Dobra peitoral", "dobra", "mm", 1, "menor"],
  ["dobra_subescapular", "Dobra subescapular", "dobra", "mm", 1, "menor"],
  ["dobra_axilar_media", "Dobra axilar média", "dobra", "mm", 1, "menor"],
  ["dobra_suprailiaca", "Dobra supra-ilíaca", "dobra", "mm", 1, "menor"],
  ["dobra_abdominal", "Dobra abdominal", "dobra", "mm", 1, "menor"],
  ["dobra_coxa", "Dobra da coxa", "dobra", "mm", 1, "menor"],
  ["dobra_panturrilha", "Dobra da panturrilha", "dobra", "mm", 1, "menor"],

  // Índices (calculados)
  ["imc", "IMC", "indice", "kg/m²", 1, "neutro"],
  ["rcq", "Relação cintura-quadril", "indice", "adimensional", 2, "menor"],
  ["rcest", "Relação cintura-estatura", "indice", "adimensional", 2, "menor"],

  // Cardio
  ["vo2max", "VO₂ máximo", "cardio", "mL/kg/min", 1, "maior"],
  ["fc_repouso", "FC de repouso", "cardio", "bpm", 0, "menor"],
  ["fc_maxima", "FC máxima", "cardio", "bpm", 0, "neutro"],
  ["pas_repouso", "Pressão sistólica (repouso)", "cardio", "mmHg", 0, "neutro"],
  ["pad_repouso", "Pressão diastólica (repouso)", "cardio", "mmHg", 0, "neutro"]
];

const CASAS_POR_CODIGO = Object.fromEntries(METRICAS.map(([codigo, , , , casas]) => [codigo, casas]));

function linhasSeed(now) {
  return METRICAS.map(([codigo, rotulo, categoria, unidade, casas, direcao], i) => ({
    codigo,
    rotulo,
    categoria,
    unidade,
    casas_decimais: casas,
    direcao_favoravel: direcao,
    ordem: (i + 1) * 10,
    ativo: true,
    created_at: now,
    updated_at: now
  }));
}

module.exports = { METRICAS, CASAS_POR_CODIGO, linhasSeed };
