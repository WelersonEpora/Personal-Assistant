"use strict";

// docs/adr/0017-endpoint-de-painel-agregado.md
//
// Monta o resumo do painel (dashboard do /admin) numa passada só, no
// servidor. Antes o dashboard baixava TODOS os relatos da equipe e calculava
// 4 KPIs no navegador - não escalava e só enxergava o pipeline de relatos,
// ignorando ficha de treino, avaliação física e acompanhamento mensal.
//
// Somente leitura. Não toca `resultado_ia` nem `validacao` (docs/adr/0007).
const painelRepository = require("../repositories/painel.repository");
const { mesReferenciaAnterior } = require("./avaliacao-mensal.service");

// Limiares dos indicadores do painel. Constantes por ora (como MINIMO_RELATOS
// em avaliacao-mensal.service.js) - viram config por equipe se fizer sentido.
const DIAS_SEM_RELATO = 21;
const SEMANAS_FICHA_ANTIGA = 8;
const DIAS_AVALIACAO_FISICA_VENCIDA = 90;
const JANELA_ANIVERSARIANTES_DIAS = 30;

// Quantos itens cada lista do painel devolve (o resto fica com um "+N" e o
// link para a tela completa).
const LIMITE_LISTA = 5;
// Atividade recente: só lançamentos dos últimos N dias, no máximo M por tipo
// (pra um lote - importação, dia cheio de relatos - não engolir o feed), e o
// feed final tem no máximo LIMITE_FEED linhas.
const FEED_JANELA_DIAS = 30;
const FEED_MAX_POR_TIPO = 4;
const LIMITE_FEED_POR_FONTE = 8;
const LIMITE_FEED = 12;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

function diasEntre(dataMaisRecente, dataAntiga) {
  return Math.floor((dataMaisRecente.getTime() - new Date(dataAntiga).getTime()) / MS_POR_DIA);
}

// Dias até o próximo aniversário (0 = hoje). Datas "YYYY-MM-DD"; 29/02 cai
// em 01/03 nos anos sem bissexto - aceitável para o alerta.
function diasAteAniversario(dataNascimento, hoje) {
  if (!dataNascimento) return null;
  const [, mes, dia] = String(dataNascimento).slice(0, 10).split("-").map(Number);
  const hoje0 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  let alvo = new Date(hoje.getFullYear(), mes - 1, dia);
  if (alvo < hoje0) alvo = new Date(hoje.getFullYear() + 1, mes - 1, dia);
  return Math.round((alvo - hoje0) / MS_POR_DIA);
}

function relatoResumo(registro) {
  return {
    id: registro.id,
    aluno: registro.aluno ? { id: registro.aluno.id, nome: registro.aluno.nome } : null,
    titulo: registro.titulo || null,
    status: registro.status,
    iniciado_em: registro.iniciado_em,
    entradas_count: Array.isArray(registro.entradas) ? registro.entradas.length : 0
  };
}

// Recorta uma lista no LIMITE e informa quantos sobraram.
function recortar(itens) {
  return { itens: itens.slice(0, LIMITE_LISTA), total: itens.length };
}

function montarPanorama(alunos, agora) {
  const semFichaAtiva = [];
  const fichaAntiga = [];
  const avaliacaoVencida = [];
  const semRelato = [];
  const aniversariantes = [];

  const limiteFicha = new Date(agora.getTime() - SEMANAS_FICHA_ANTIGA * 7 * MS_POR_DIA);
  const limiteRelato = new Date(agora.getTime() - DIAS_SEM_RELATO * MS_POR_DIA);

  for (const aluno of alunos) {
    const base = { id: aluno.id, nome: aluno.nome };
    const fichaDesde = aluno.get("ficha_ativa_desde");
    const ultimoRelato = aluno.get("ultimo_relato_em");
    const ultimaAvaliacao = aluno.get("ultima_avaliacao_fisica");

    // Aluno que não usa ficha de treino (docs/adr/0017) fica fora dos dois
    // alertas de ficha - não é pendência.
    if (!aluno.dispensa_ficha_treino) {
      if (!fichaDesde) {
        semFichaAtiva.push(base);
      } else if (new Date(fichaDesde) < limiteFicha) {
        fichaAntiga.push({ ...base, ficha_ativa_desde: fichaDesde, dias: diasEntre(agora, fichaDesde) });
      }
    }

    // Aluno que não faz avaliação física (docs/adr/0017) fica fora do alerta.
    if (!aluno.dispensa_avaliacao_fisica) {
      if (!ultimaAvaliacao) {
        avaliacaoVencida.push({ ...base, ultima_avaliacao_fisica: null, dias: null });
      } else {
        const dataAval = `${String(ultimaAvaliacao).slice(0, 10)}T00:00:00Z`;
        const diasAval = diasEntre(agora, dataAval);
        if (diasAval > DIAS_AVALIACAO_FISICA_VENCIDA) {
          avaliacaoVencida.push({ ...base, ultima_avaliacao_fisica: String(ultimaAvaliacao).slice(0, 10), dias: diasAval });
        }
      }
    }

    // "Sem relato recente" é sinal de acompanhamento interrompido: só conta
    // quem JÁ teve relato e parou. Aluno que nunca teve relato é estado
    // inicial, não pendência - apareceria como ruído (todo mundo, num
    // cadastro recém-importado).
    if (ultimoRelato && new Date(ultimoRelato) < limiteRelato) {
      semRelato.push({ ...base, ultimo_relato_em: ultimoRelato, dias: diasEntre(agora, ultimoRelato) });
    }

    const diasAniversario = diasAteAniversario(aluno.data_nascimento, agora);
    if (diasAniversario !== null && diasAniversario <= JANELA_ANIVERSARIANTES_DIAS) {
      aniversariantes.push({ ...base, data_nascimento: String(aluno.data_nascimento).slice(0, 10), dias: diasAniversario });
    }
  }

  aniversariantes.sort((a, b) => a.dias - b.dias);
  semRelato.sort((a, b) => b.dias - a.dias);
  avaliacaoVencida.sort((a, b) => (b.dias ?? Infinity) - (a.dias ?? Infinity));
  fichaAntiga.sort((a, b) => b.dias - a.dias);

  return {
    sem_ficha_ativa: recortar(semFichaAtiva),
    ficha_antiga: recortar(fichaAntiga),
    avaliacao_fisica_vencida: recortar(avaliacaoVencida),
    aniversariantes: recortar(aniversariantes),
    limiares: {
      dias_sem_relato: DIAS_SEM_RELATO,
      semanas_ficha_antiga: SEMANAS_FICHA_ANTIGA,
      dias_avaliacao_fisica_vencida: DIAS_AVALIACAO_FISICA_VENCIDA,
      janela_aniversariantes_dias: JANELA_ANIVERSARIANTES_DIAS
    },
    _sem_relato: semRelato
  };
}

function montarFeed({ relatos, avaliacoesFisicas, fichas, avaliacoesMensais }) {
  // Cada grupo já vem do banco ordenado do mais recente para o mais antigo -
  // corta em FEED_MAX_POR_TIPO antes de mesclar, pra nenhuma fonte dominar.
  const grupos = [
    relatos.map((r) => ({
      tipo: "relato",
      aluno: r.aluno ? { id: r.aluno.id, nome: r.aluno.nome } : null,
      quando: r.created_at,
      dados: { id: r.id, titulo: r.titulo || null, status: r.status }
    })),
    avaliacoesFisicas.map((a) => ({
      tipo: "avaliacao_fisica",
      aluno: a.aluno ? { id: a.aluno.id, nome: a.aluno.nome } : null,
      quando: a.created_at,
      dados: { id: a.id, data: a.data, origem: a.origem }
    })),
    fichas.map((f) => ({
      tipo: "ficha_treino",
      aluno: f.aluno ? { id: f.aluno.id, nome: f.aluno.nome } : null,
      quando: f.created_at,
      dados: { id: f.id, nome: f.nome || null, ativo: f.ativo }
    })),
    avaliacoesMensais.map((m) => ({
      tipo: "avaliacao_mensal",
      aluno: m.aluno ? { id: m.aluno.id, nome: m.aluno.nome } : null,
      quando: m.gerada_em,
      dados: { id: m.id, ano_mes: m.ano_mes }
    }))
  ];
  return grupos
    .flatMap((grupo) => grupo.filter((e) => e.quando).slice(0, FEED_MAX_POR_TIPO))
    .sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime())
    .slice(0, LIMITE_FEED);
}

async function obterPainel(equipeId) {
  const agora = new Date();
  const anoMesCiclo = mesReferenciaAnterior(agora);
  const desde7d = new Date(agora.getTime() - 7 * MS_POR_DIA);
  const desde30d = new Date(agora.getTime() - 30 * MS_POR_DIA);
  const desdeFeed = new Date(agora.getTime() - FEED_JANELA_DIAS * MS_POR_DIA);

  const [
    alunosContagem,
    confirmados7d,
    confirmados30d,
    capturados30d,
    emProcessamento,
    catalogo,
    aguardandoRevisao,
    comErro,
    alunosIndicadores,
    cicloPorStatus,
    cicloFalhas,
    relatosFeed,
    avaliacoesFisicasFeed,
    fichasFeed,
    avaliacoesMensaisFeed
  ] = await Promise.all([
    painelRepository.contarAlunos(equipeId),
    painelRepository.contarRelatosConfirmadosDesde(equipeId, desde7d),
    painelRepository.contarRelatosConfirmadosDesde(equipeId, desde30d),
    painelRepository.contarRelatosCapturadosDesde(equipeId, desde30d),
    painelRepository.contarRelatosEmProcessamento(equipeId),
    painelRepository.contarCatalogo(equipeId),
    painelRepository.listarRelatosAguardandoRevisao(equipeId),
    painelRepository.listarRelatosComErro(equipeId),
    painelRepository.listarAlunosAtivosComIndicadores(equipeId),
    painelRepository.resumoAvaliacoesMensaisDoMes(equipeId, anoMesCiclo),
    painelRepository.listarAvaliacoesMensaisComFalha(equipeId, anoMesCiclo),
    painelRepository.relatosRecentes(equipeId, LIMITE_FEED_POR_FONTE, desdeFeed),
    painelRepository.avaliacoesFisicasRecentes(equipeId, LIMITE_FEED_POR_FONTE, desdeFeed),
    painelRepository.fichasRecentes(equipeId, LIMITE_FEED_POR_FONTE, desdeFeed),
    painelRepository.avaliacoesMensaisRecentes(equipeId, LIMITE_FEED_POR_FONTE, desdeFeed)
  ]);

  const panorama = montarPanorama(alunosIndicadores, agora);
  const semRelato = panorama._sem_relato;
  delete panorama._sem_relato;

  const cicloProcessados = cicloPorStatus.gerada + cicloPorStatus.dados_insuficientes + cicloPorStatus.falha;
  const cicloPendentes = Math.max(0, alunosContagem.ativos - cicloProcessados);

  const aguardandoResumo = aguardandoRevisao.map(relatoResumo);
  const comErroResumo = comErro.map(relatoResumo);

  return {
    gerado_em: agora.toISOString(),
    acao_necessaria: {
      relatos_aguardando_revisao: recortar(aguardandoResumo),
      relatos_com_erro: recortar(comErroResumo),
      avaliacoes_mensais_falha: recortar(
        cicloFalhas.map((m) => ({
          id: m.id,
          ano_mes: m.ano_mes,
          aluno: m.aluno ? { id: m.aluno.id, nome: m.aluno.nome } : null
        }))
      ),
      alunos_sem_relato: recortar(semRelato)
    },
    resumo: {
      alunos_ativos: alunosContagem.ativos,
      alunos_total: alunosContagem.total,
      relatos_confirmados_7d: confirmados7d,
      relatos_confirmados_30d: confirmados30d,
      relatos_capturados_30d: capturados30d,
      em_processamento: emProcessamento,
      ciclo_mensal: {
        ano_mes: anoMesCiclo,
        gerados: cicloPorStatus.gerada,
        dados_insuficientes: cicloPorStatus.dados_insuficientes,
        falha: cicloPorStatus.falha,
        pendentes: cicloPendentes,
        alunos_ativos: alunosContagem.ativos
      }
    },
    panorama,
    atividade_recente: montarFeed({
      relatos: relatosFeed,
      avaliacoesFisicas: avaliacoesFisicasFeed,
      fichas: fichasFeed,
      avaliacoesMensais: avaliacoesMensaisFeed
    }),
    catalogo,
    pendentes_revisao: aguardandoResumo.length
  };
}

module.exports = {
  obterPainel,
  DIAS_SEM_RELATO,
  SEMANAS_FICHA_ANTIGA,
  DIAS_AVALIACAO_FISICA_VENCIDA,
  JANELA_ANIVERSARIANTES_DIAS,
  diasAteAniversario
};
