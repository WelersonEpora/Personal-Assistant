"use strict";

// docs/adr/0022-radar-atualizacao-profissional.md (+ adendos 2026-09-02)
//
// Allowlist de fontes, grupos de assunto e critérios de relevância do Radar
// ("fofoqueira científica"). Mexer aqui é COMMIT, não tela de admin - é a
// curadoria de ONDE olhar.
//
// A busca roda UMA CHAMADA POR GRUPO (não uma só cobrindo tudo) - dá mais
// cobertura, cada chamada foca em 2-3 assuntos próximos. Janela de 30 dias
// (revisão sistemática relevante para personal não sai toda semana de cada
// periódico); o job roda semanal e o dedup + a lista "já no Radar" seguram a
// sobreposição.
//
// `chave` de cada grupo é slug estável usado no filtro da tela (?grupos=...).
module.exports = {
  janelaDias: 30,
  maxItensPorGrupo: 4, // teto por chamada ao Gemini
  maxItensPorCiclo: 10, // teto total do ciclo, depois do merge + dedup

  gruposAssunto: [
    {
      chave: "forca",
      nome: "Treino de força e prescrição",
      assuntos: [
        "treinamento de força e hipertrofia",
        "periodização, volume e frequência de treino",
        "prevenção de lesão no treino resistido"
      ]
    },
    {
      chave: "populacoes",
      nome: "Populações especiais e atividade física para saúde",
      assuntos: [
        "exercício para populações especiais (idoso, gestante, hipertensão, diabetes, obesidade)",
        "treino cardiorrespiratório e condicionamento",
        "diretrizes de atividade física para saúde"
      ]
    },
    {
      chave: "avaliacao_recuperacao",
      nome: "Avaliação física e recuperação",
      assuntos: [
        "avaliação de composição corporal e antropometria",
        "recuperação, sono e dor muscular tardia"
      ]
    },
    {
      chave: "adesao_profissao",
      nome: "Adesão e profissão",
      assuntos: [
        "adesão e mudança de comportamento em exercício",
        "regulamentação da profissão de educação física no Brasil"
      ]
    }
  ],

  // nome + domínio. O domínio ajuda o prompt a preferir a fonte primária.
  // `curto` é o rótulo enxuto que a tela do Radar mostra na linha de fontes
  // (a resposta de GET /api/v1/radar serializa `fontes` a partir daqui -
  // mesma "fonte única da verdade" dos grupos de assunto).
  // Fontes brasileiras entram junto - o prompt tem instrução explícita de
  // não parar no PubMed (senão a busca gravita toda para lá).
  fontes: [
    { nome: "PubMed", curto: "PubMed", dominio: "pubmed.ncbi.nlm.nih.gov" },
    { nome: "British Journal of Sports Medicine", curto: "BJSM", dominio: "bjsm.bmj.com" },
    { nome: "American College of Sports Medicine (ACSM)", curto: "ACSM", dominio: "acsm.org" },
    { nome: "National Strength and Conditioning Association (NSCA)", curto: "NSCA", dominio: "nsca.com" },
    { nome: "Journal of the International Society of Sports Nutrition", curto: "JISSN", dominio: "jissn.biomedcentral.com" },
    { nome: "Sports Medicine (Springer)", curto: "Sports Medicine", dominio: "link.springer.com" },
    { nome: "Organização Mundial da Saúde (OMS/WHO)", curto: "OMS", dominio: "who.int" },
    { nome: "PEDro - Physiotherapy Evidence Database", curto: "PEDro", dominio: "pedro.org.au" },
    // --- Brasil ---
    { nome: "SciELO Brasil (revistas científicas brasileiras)", curto: "SciELO Brasil", dominio: "scielo.br" },
    { nome: "Ministério da Saúde do Brasil - guias e diretrizes", curto: "Ministério da Saúde", dominio: "gov.br" },
    { nome: "Colégio Brasileiro de Ciências do Esporte (CBCE)", curto: "CBCE", dominio: "cbce.org.br" },
    { nome: "CONFEF / CREF - conselho da profissão", curto: "CONFEF/CREF", dominio: "confef.org.br" },
    { nome: "Sociedade Brasileira de Medicina do Exercício e do Esporte (SBMEE)", curto: "SBMEE", dominio: "sbmee.org.br" }
  ],

  criteriosRelevancia: [
    "priorize revisão sistemática, meta-análise, position stand, diretriz e consenso",
    "estudo primário isolado só se for de um órgão reconhecido ou se contrariar explicitamente o consenso vigente",
    "o item precisa ter relação direta com a prática de um personal trainer (o que ele começa, para ou continua fazendo com alunos)",
    "ignore matéria de divulgação, blog, newsletter e conteúdo de marketing"
  ]
};
