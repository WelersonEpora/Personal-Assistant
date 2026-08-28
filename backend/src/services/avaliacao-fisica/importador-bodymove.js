"use strict";

// docs/adr/0016-avaliacao-fisica-importada-do-legado.md (proposta v3 §8):
// importador one-shot das 405 avaliações do BodyMove (Access Jet 3.0). É
// dividido em `transformarLegado` (puro - testável sem banco e sem o .bak) e
// `persistir` (transacional, idempotente por (aluno_id, data, origem)).
//
// NUNCA toca `registro*`, `resultado_ia`, `validacao`, `transcricao` ou a
// sincronização - avaliação física é dado objetivo do personal, fora do
// pipeline de IA (docs/adr/0007 intacto).

const { CASAS_POR_CODIGO } = require("./catalogo-metricas");
const { calcularDerivadas, arredondar } = require("./metricas-derivadas");
const { METODO_POR_TABELA_LEGADO, PRECEDENCIA_PRINCIPAL_GORDURA } = require("./metodos");
const { validarAnamneseJson, validarPosturalJson } = require("./esquemas");

const ORIGEM = "legado_bodymove";

// ---------------------------------------------------------------------------
// helpers de valor
// ---------------------------------------------------------------------------

function normalizarNome(nome) {
  return String(nome || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Access grava vírgula decimal (pt-BR) nos campos texto; os Single já vêm
// como number. Devolve number > 0 ou null.
function num(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = typeof valor === "number" ? valor : Number(String(valor).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

// "Não.", "", "-", "nenhum" etc. -> null; senão o texto aparado.
function texto(valor) {
  const t = String(valor || "").trim();
  if (!t) return null;
  if (/^(n[ãa]o\.?|nada\.?|nenhum[ao]?\.?|-{1,}|x)$/i.test(t)) return null;
  return t;
}

function dataNascimentoISO(datanasc) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(datanasc || "").trim());
  if (!m) return null;
  const [, dd, mm, aaaa] = m;
  const ano = Number(aaaa);
  const mes = Number(mm);
  const dia = Number(dd);
  if (ano < 1900 || ano > 2100 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return `${aaaa}-${mm}-${dd}`;
}

function dataAvaliacaoISO(data) {
  if (!data) return null;
  // mdb-reader devolve Date (meia-noite UTC) para os campos Date/Time.
  const d = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function medida(metricaCodigo, valor, { metodo = "direto", principal = true, origemValor = "importado" } = {}) {
  const n = num(valor);
  if (n === null) return null;
  const casas = CASAS_POR_CODIGO[metricaCodigo] ?? 3;
  return {
    metrica_codigo: metricaCodigo,
    metodo,
    principal,
    valor: arredondar(n, casas),
    origem_valor: origemValor
  };
}

// ---------------------------------------------------------------------------
// mapeamentos coluna -> métrica
// ---------------------------------------------------------------------------

const ANTROPOMETRIA_DIRETO = {
  peso: "peso",
  altura: "altura",
  pescoco: "perimetro_pescoco",
  ombro: "perimetro_ombro",
  torax: "perimetro_torax",
  cintura: "perimetro_cintura",
  abdome: "perimetro_abdome",
  quadril: "perimetro_quadril",
  bd: "perimetro_braco_d",
  be: "perimetro_braco_e",
  abd: "perimetro_antebraco_d",
  abe: "perimetro_antebraco_e",
  cd: "perimetro_coxa_d",
  ce: "perimetro_coxa_e",
  pd: "perimetro_panturrilha_d",
  pe: "perimetro_panturrilha_e"
};

const DOBRAS_CONSOLIDADAS = {
  tricipital: "dobra_tricipital",
  bicipital: "dobra_bicipital",
  peitoral: "dobra_peitoral",
  subescapular: "dobra_subescapular",
  axilarmedia: "dobra_axilar_media",
  suprailiaca: "dobra_suprailiaca",
  abdominal: "dobra_abdominal",
  coxa: "dobra_coxa",
  panturrilha: "dobra_panturrilha"
};

const TABELAS_GORDURA = [
  "pollock_7dobras",
  "durninwormersley_4dobras",
  "petroski_4dobras",
  "deurenberg_4dobras",
  "faulkner_4dobras",
  "slaughter_2dobras",
  "composicao_direta"
];

const TABELAS_VO2 = [
  "cardio_cooper12minutos",
  "cardio_1600metros",
  "cardio_2400metros",
  "cardio_balke15minutos",
  "cardio_subesteiellstad"
];

// postural (§5.2) - coluna legada -> caminho no esquema fechado.
const POSTURAL_SIMPLES = {
  hiperlordosecervical: ["coluna", "hiperlordose_cervical"],
  hipercifose: ["coluna", "hipercifose"],
  hiperlordoselombar: ["coluna", "hiperlordose_lombar"],
  escoliose: ["coluna", "escoliose"],
  rotacaointernaombros: ["ombros_escapulas", "rotacao_interna"],
  protacaoescapular: ["ombros_escapulas", "protracao_escapular"],
  retracaoescapular: ["ombros_escapulas", "retracao_escapular"],
  depressaoescapular: ["ombros_escapulas", "depressao_escapular"],
  ombrosassimetricos: ["ombros_escapulas", "ombros_assimetricos"],
  encurtamentotrapezio: ["ombros_escapulas", "encurtamento_trapezio"],
  protusaoabdominal: ["tronco", "protrusao_abdominal"],
  triangulotalesassimetrico: ["tronco", "triangulo_tales_assimetrico"],
  desvioquadril: ["quadril", "desvio_lateral"],
  quadrilassimetrico: ["quadril", "assimetria"]
};
const POSTURAL_JOELHO = { genuflexo: "flexo", genurecurvato: "recurvato", genuvalgo: "valgo", genuvaro: "varo" };
const POSTURAL_PE = { plano: "plano", cavo: "cavo", valgo: "valgo", varo: "varo", calcaneo: "calcaneo", equino: "equino" };

// ---------------------------------------------------------------------------
// PA / FC do texto livre da anamnese
// ---------------------------------------------------------------------------

function extrairPaFc(obs) {
  const t = String(obs || "").trim();
  if (!t) return { medidas: [], sobra: null, textoOriginal: null };

  const medidas = [];
  const pa = /(\d{2,3})\s*[/;x×\-–]\s*(\d{2,3})/.exec(t);
  if (pa) {
    const sys = Number(pa[1]);
    const dia = Number(pa[2]);
    if (sys >= 80 && sys <= 260 && dia >= 40 && dia <= 160 && sys > dia) {
      medidas.push(medida("pas_repouso", sys));
      medidas.push(medida("pad_repouso", dia));
    }
  }
  let fc = /fc[^0-9]{0,15}(\d{2,3})/i.exec(t);
  if (!fc) fc = /(\d{2,3})\s*bpm/i.exec(t);
  if (fc) {
    const v = Number(fc[1]);
    if (v >= 30 && v <= 120) medidas.push(medida("fc_repouso", v));
  }

  const validas = medidas.filter(Boolean);
  // Sobra: texto com letras "de verdade" além dos rótulos conhecidos.
  const semTokens = t
    .replace(/pa|press[ãa]o|arterial|fc|freq[uü][êe]ncia|card[ií]aca|repouso|rep|bpm|mmhg|em|no|de|do|da/gi, "")
    .replace(/[\d\s/;x×\-–.,:=\]]+/g, "");
  const sobra = semTokens.length >= 4 ? t : null;

  return { medidas: validas, sobra, textoOriginal: t, reconheceu: validas.length > 0 };
}

// ---------------------------------------------------------------------------
// anamnese_json (§5.1)
// ---------------------------------------------------------------------------

function montarAnamneseJson(row) {
  if (!row) return null;
  const j = {};

  const objetivo = texto(row.metaoutra);
  if (objetivo) j.objetivo = objetivo;

  if (typeof row.atividade === "boolean") j.pratica_atividade = row.atividade;
  const atividadeTipo = texto(row.atividadetipo);
  if (atividadeTipo) j.atividade_tipo = atividadeTipo;
  const freq = parseInt(String(row.atividadefreq || "").replace(/\D+/g, ""), 10);
  if (Number.isInteger(freq) && freq >= 1 && freq <= 14) j.atividade_frequencia_semanal = freq;

  const restricoes = texto(row.restricoes);
  if (restricoes) j.restricoes = restricoes;
  const medicamentos = texto(row.medicamentos);
  if (medicamentos) j.medicamentos = medicamentos;
  const dores = texto(row.dores);
  if (dores) j.dores_queixas = dores;
  const acidentes = texto(row.acidentes);
  if (acidentes) j.cirurgias_lesoes = acidentes;
  const dieta = texto(row.dieta);
  if (dieta) j.dieta_orientacao = dieta;
  const alergia = texto(row.alergia);
  if (alergia) j.alergias = alergia;

  if (row.cigarros === true) {
    const tabagismo = { fuma: true };
    const cigDia = parseInt(String(row.cigarrosdia || "").replace(/\D+/g, ""), 10);
    if (Number.isInteger(cigDia) && cigDia > 0) tabagismo.cigarros_dia = cigDia;
    const tempo = texto(row.cigarrostempo);
    if (tempo && !/n[ãa]o\s*fumante/i.test(tempo)) tabagismo.tempo = tempo;
    j.tabagismo = tabagismo;
  }

  return Object.keys(j).length > 0 ? j : null;
}

// ---------------------------------------------------------------------------
// postural_json (§5.2)
// ---------------------------------------------------------------------------

function montarPosturalJson(row, avisosSet) {
  if (!row) return null;

  const j = {
    coluna: {},
    ombros_escapulas: {},
    tronco: {},
    quadril: {},
    joelho: { direito: {}, esquerdo: {} },
    pe: { direito: {}, esquerdo: {} }
  };

  for (const [col, [regiao, chave]] of Object.entries(POSTURAL_SIMPLES)) {
    j[regiao][chave] = row[col] === true;
  }
  for (const [prefixo, chave] of Object.entries(POSTURAL_JOELHO)) {
    j.joelho.direito[chave] = row[`${prefixo}d`] === true;
    j.joelho.esquerdo[chave] = row[`${prefixo}e`] === true;
  }
  for (const [prefixo, chave] of Object.entries(POSTURAL_PE)) {
    j.pe.direito[chave] = row[`${prefixo}d`] === true;
    j.pe.esquerdo[chave] = row[`${prefixo}e`] === true;
  }

  // Colunas legadas sem lugar no esquema v3 - descartadas (proposta v3 §5.2).
  for (const col of ["abdutod", "abdutoe", "adutod", "adutoe"]) {
    if (row[col] === true) avisosSet.add(`postural: coluna legada "${col}" sem correspondente no esquema v3 - descartada`);
  }

  const obs = ["obsescoliose", "obsombros", "obstrapezio", "obsdesvioquadril", "obsquadrilassimetrico"]
    .map((c) => texto(row[c]))
    .filter(Boolean)
    .join(" | ");
  if (obs) j.observacoes = obs;

  return j;
}

// ---------------------------------------------------------------------------
// transform principal
// ---------------------------------------------------------------------------

function indexarPorAvaliacao(linhas) {
  const mapa = new Map();
  for (const row of linhas || []) mapa.set(row.avaliacao, row);
  return mapa;
}

// `tabelas`: { cadastro, avaliacao, antropometria, dobras, <protocolos>,
// anamnese_base, postural, cardio_* } - arrays de objetos simples já lidos
// do Access. Devolve { alunos, avisos }.
function transformarLegado(tabelas) {
  const avisosSet = new Set();

  const cadastroPorId = new Map((tabelas.cadastro || []).map((c) => [c.id, c]));
  const antropoPorAval = indexarPorAvaliacao(tabelas.antropometria);
  const dobrasPorAval = indexarPorAvaliacao(tabelas.dobras);
  const anamnesePorAval = indexarPorAvaliacao(tabelas.anamnese_base);
  const posturalPorAval = indexarPorAvaliacao(tabelas.postural);

  const gorduraPorTabela = new Map(
    TABELAS_GORDURA.map((nome) => [nome, indexarPorAvaliacao(tabelas[nome])])
  );
  const vo2PorTabela = new Map(
    TABELAS_VO2.map((nome) => [nome, indexarPorAvaliacao(tabelas[nome])])
  );

  // avaliações agrupadas por aluno legado
  const avaliacoesPorAluno = new Map();
  for (const av of tabelas.avaliacao || []) {
    if (!cadastroPorId.has(av.avaliado)) {
      avisosSet.add(`avaliacao ${av.id}: avaliado ${av.avaliado} sem cadastro - ignorada`);
      continue;
    }
    if (!avaliacoesPorAluno.has(av.avaliado)) avaliacoesPorAluno.set(av.avaliado, []);
    avaliacoesPorAluno.get(av.avaliado).push(av);
  }

  const alunos = [];

  for (const [cadastroId, avaliacoesLegado] of avaliacoesPorAluno) {
    const cad = cadastroPorId.get(cadastroId);
    const nomeOriginal = String(cad.nome || "").trim();
    const dataNascimento = dataNascimentoISO(cad.datanasc);
    if (!dataNascimento) avisosSet.add(`cadastro ${cadastroId} (${nomeOriginal}): datanasc "${cad.datanasc}" não parseável`);
    const sexo = ["F", "M"].includes(String(cad.sexo || "").trim().toUpperCase())
      ? String(cad.sexo).trim().toUpperCase()
      : null;

    const avaliacoes = [];

    for (const av of avaliacoesLegado) {
      const dataISO = dataAvaliacaoISO(av.data);
      if (!dataISO) {
        avisosSet.add(`avaliacao ${av.id}: data "${av.data}" inválida - ignorada`);
        continue;
      }

      const medidas = [];

      // antropometria
      const antropo = antropoPorAval.get(av.id);
      if (antropo) {
        for (const [col, codigo] of Object.entries(ANTROPOMETRIA_DIRETO)) {
          const m = medida(codigo, antropo[col]);
          if (m) medidas.push(m);
        }
      }

      // dobras consolidadas
      const dobras = dobrasPorAval.get(av.id);
      if (dobras) {
        for (const [col, codigo] of Object.entries(DOBRAS_CONSOLIDADAS)) {
          const m = medida(codigo, dobras[col]);
          if (m) medidas.push(m);
        }
      }

      // % de gordura (0..N protocolos) -> uma linha por método
      const gorduras = [];
      for (const nomeTabela of TABELAS_GORDURA) {
        const row = gorduraPorTabela.get(nomeTabela).get(av.id);
        const valor = row && num(row.gordura);
        if (valor === null || valor === undefined || valor === false) continue;
        gorduras.push({ metodo: METODO_POR_TABELA_LEGADO[nomeTabela], valor });
      }
      if (gorduras.length > 0) {
        const metodoPrincipal =
          PRECEDENCIA_PRINCIPAL_GORDURA.find((met) => gorduras.some((g) => g.metodo === met)) ||
          gorduras[0].metodo;
        for (const g of gorduras) {
          medidas.push(
            medida("percentual_gordura", g.valor, {
              metodo: g.metodo,
              principal: g.metodo === metodoPrincipal,
              origemValor: "calculado"
            })
          );
        }
      }

      // VO2 máximo (raro; 1+ testes)
      const vo2s = [];
      for (const nomeTabela of TABELAS_VO2) {
        const row = vo2PorTabela.get(nomeTabela).get(av.id);
        const valor = row && num(row.vo2obtido);
        if (!valor) continue;
        vo2s.push({ metodo: METODO_POR_TABELA_LEGADO[nomeTabela], valor });
      }
      vo2s.forEach((v, i) => {
        medidas.push(
          medida("vo2max", v.valor, { metodo: v.metodo, principal: i === 0, origemValor: "calculado" })
        );
      });

      // PA / FC do texto livre da anamnese
      const anamneseRow = anamnesePorAval.get(av.id);
      let observacoes = null;
      if (anamneseRow) {
        const { medidas: paFc, sobra, textoOriginal, reconheceu } = extrairPaFc(anamneseRow.obs);
        for (const m of paFc) if (m) medidas.push(m);
        if (textoOriginal && !reconheceu) {
          avisosSet.add(`avaliacao ${av.id}: anamnese.obs "${textoOriginal}" sem PA/FC reconhecível`);
        }
        if (sobra) observacoes = sobra;
      }

      // métricas derivadas (imc / rcq) a partir das medidas `principal`
      const principais = {};
      for (const m of medidas) {
        if (m.principal) principais[m.metrica_codigo] = m.valor;
      }
      for (const d of calcularDerivadas(principais)) medidas.push(d);

      // Validação pelo mesmo esquema fechado da API (proposta v3 §5) - o JSON
      // já é montado "por construção", isto só garante consistência e
      // normaliza (trim, descarta chave vazia).
      let anamneseJson = null;
      let posturalJson = null;
      try {
        anamneseJson = validarAnamneseJson(montarAnamneseJson(anamneseRow));
        posturalJson = validarPosturalJson(montarPosturalJson(posturalPorAval.get(av.id), avisosSet));
      } catch (err) {
        avisosSet.add(`avaliacao ${av.id}: JSON de anamnese/postural rejeitado (${err.message})`);
      }

      avaliacoes.push({ dataISO, anamneseJson, posturalJson, observacoes, medidas });
    }

    if (avaliacoes.length === 0) continue;

    alunos.push({
      cadastroLegadoId: cadastroId,
      nomeOriginal,
      nomeNormalizado: normalizarNome(nomeOriginal),
      dataNascimento,
      sexo,
      avaliacoes
    });
  }

  return { alunos, avisos: [...avisosSet].sort() };
}

// ---------------------------------------------------------------------------
// persistência idempotente
// ---------------------------------------------------------------------------

// `deps`: { models } (injeta em testes). `opts`: { equipeId, dryRun }.
async function persistir({ alunos }, { equipeId, dryRun = false, models }) {
  const { Aluno, AvaliacaoFisica, AvaliacaoFisicaMedida, sequelize } = models;

  const relatorio = {
    equipeId,
    alunosCriados: 0,
    alunosVinculados: 0,
    avaliacoesCriadas: 0,
    avaliacoesJaExistentes: 0,
    medidasCriadas: 0
  };

  // Índice dos alunos já existentes na equipe (por nome normalizado).
  const existentes = await Aluno.findAll({ where: { equipe_id: equipeId } });
  const porNome = new Map();
  for (const a of existentes) {
    const chave = normalizarNome(a.nome);
    if (!porNome.has(chave)) porNome.set(chave, []);
    porNome.get(chave).push(a);
  }

  const escolherExistente = (candidatos, dataNascimento) => {
    if (!candidatos || candidatos.length === 0) return null;
    if (dataNascimento) {
      const comData = candidatos.find((c) => c.data_nascimento === dataNascimento);
      if (comData) return comData;
      const semData = candidatos.find((c) => !c.data_nascimento);
      if (semData) return semData;
      return null; // mesmo nome, nascimento diferente -> pessoa diferente
    }
    return candidatos[0];
  };

  for (const alunoLegado of alunos) {
    // eslint-disable-next-line no-await-in-loop
    await sequelize.transaction(async (transaction) => {
      const candidatos = porNome.get(alunoLegado.nomeNormalizado);
      let aluno = escolherExistente(candidatos, alunoLegado.dataNascimento);

      if (aluno) {
        const patch = {};
        if (!aluno.data_nascimento && alunoLegado.dataNascimento) patch.data_nascimento = alunoLegado.dataNascimento;
        if (!aluno.sexo && alunoLegado.sexo) patch.sexo = alunoLegado.sexo;
        if (Object.keys(patch).length > 0 && !dryRun) await aluno.update(patch, { transaction });
        relatorio.alunosVinculados += 1;
      } else {
        if (dryRun) {
          aluno = Aluno.build({
            equipe_id: equipeId,
            nome: alunoLegado.nomeOriginal,
            data_nascimento: alunoLegado.dataNascimento,
            sexo: alunoLegado.sexo
          });
        } else {
          aluno = await Aluno.create(
            {
              equipe_id: equipeId,
              nome: alunoLegado.nomeOriginal,
              data_nascimento: alunoLegado.dataNascimento,
              sexo: alunoLegado.sexo
            },
            { transaction }
          );
        }
        relatorio.alunosCriados += 1;
        if (!porNome.has(alunoLegado.nomeNormalizado)) porNome.set(alunoLegado.nomeNormalizado, []);
        porNome.get(alunoLegado.nomeNormalizado).push(aluno);
      }

      for (const av of alunoLegado.avaliacoes) {
        if (dryRun) {
          relatorio.avaliacoesCriadas += 1;
          relatorio.medidasCriadas += av.medidas.length;
          continue;
        }

        // eslint-disable-next-line no-await-in-loop
        const [avaliacao, criada] = await AvaliacaoFisica.findOrCreate({
          where: { aluno_id: aluno.id, data: av.dataISO, origem: ORIGEM },
          defaults: {
            aluno_id: aluno.id,
            equipe_id: equipeId,
            data: av.dataISO,
            origem: ORIGEM,
            avaliador_id: null,
            anamnese_json: av.anamneseJson,
            postural_json: av.posturalJson,
            observacoes: av.observacoes
          },
          transaction
        });

        if (!criada) {
          relatorio.avaliacoesJaExistentes += 1;
          continue;
        }

        if (av.medidas.length > 0) {
          // eslint-disable-next-line no-await-in-loop
          await AvaliacaoFisicaMedida.bulkCreate(
            av.medidas.map((m) => ({ ...m, avaliacao_fisica_id: avaliacao.id })),
            { transaction, validate: true }
          );
        }
        relatorio.avaliacoesCriadas += 1;
        relatorio.medidasCriadas += av.medidas.length;
      }
    });
  }

  return relatorio;
}

module.exports = {
  transformarLegado,
  persistir,
  normalizarNome,
  extrairPaFc,
  ORIGEM,
  TABELAS_GORDURA,
  TABELAS_VO2
};
