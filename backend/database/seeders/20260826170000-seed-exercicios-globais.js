"use strict";

const { createHash } = require("node:crypto");

// Catálogo global inicial (docs/adr/0013-catalogo-exercicios-ficha-treino.md):
// exercicios com equipe_id NULL, visíveis a todas as equipes mas não
// editáveis por elas. Sem imagem/vídeo por enquanto (fora de escopo).
//
// Cada linha: [nome, grupo_muscular, equipamento, dificuldade, instrucoes]
const EXERCICIOS = [
  // Peito
  ["Supino reto com barra", "Peito", "Barra", "intermediario", "Deite no banco, desça a barra até o peito e empurre até estender os braços."],
  ["Supino inclinado com barra", "Peito", "Barra", "intermediario", "No banco inclinado, desça a barra até a parte superior do peito e empurre para cima."],
  ["Supino declinado com barra", "Peito", "Barra", "avancado", "No banco declinado, controle a descida da barra até o peito e empurre de volta."],
  ["Supino reto com halteres", "Peito", "Halteres", "intermediario", "Deite no banco, desça os halteres ao lado do peito e empurre até estender os braços."],
  ["Supino inclinado com halteres", "Peito", "Halteres", "intermediario", "No banco inclinado, empurre os halteres para cima controlando a descida até a linha do peito."],
  ["Crucifixo com halteres", "Peito", "Halteres", "intermediario", "Deitado, abra os braços em arco com leve flexão de cotovelo até alongar o peito."],
  ["Crucifixo no cross-over", "Peito", "Polia (cabo)", "intermediario", "De pé entre as polias, traga os cabos à frente do corpo num movimento de abraço."],
  ["Peck deck (voador)", "Peito", "Máquina", "iniciante", "Sentado, junte os braços à frente do corpo controlando o retorno."],
  ["Flexão de braço", "Peito", "Peso corporal", "iniciante", "Apoie mãos e pés no chão, desça o corpo alinhado e empurre de volta."],
  ["Crossover polia alta", "Peito", "Polia (cabo)", "intermediario", "Com as polias na posição alta, traga os cabos para baixo e à frente do corpo."],

  // Costas
  ["Puxada frente (pulley)", "Costas", "Polia (cabo)", "iniciante", "Sentado, puxe a barra até a altura do peito mantendo o tronco ereto."],
  ["Puxada atrás", "Costas", "Polia (cabo)", "avancado", "Puxe a barra até a nuca com controle, cuidado com a amplitude do ombro."],
  ["Remada curvada com barra", "Costas", "Barra", "intermediario", "Incline o tronco à frente e puxe a barra até o abdômen."],
  ["Remada cavalinho (T-bar)", "Costas", "Barra", "intermediario", "Apoiado no suporte, puxe a barra em direção ao tronco mantendo as costas retas."],
  ["Remada unilateral com halter", "Costas", "Halteres", "iniciante", "Apoiado no banco, puxe o halter até a lateral do tronco."],
  ["Remada baixa (cabo/triângulo)", "Costas", "Polia (cabo)", "iniciante", "Sentado, puxe o triângulo até o abdômen mantendo o tronco ereto."],
  ["Barra fixa pronada (pull-up)", "Costas", "Barra fixa", "avancado", "Pegada pronada, puxe o corpo até o queixo passar da barra."],
  ["Barra fixa supinada (chin-up)", "Costas", "Barra fixa", "avancado", "Pegada supinada, puxe o corpo até o queixo passar da barra."],
  ["Pulldown com corda", "Costas", "Polia (cabo)", "iniciante", "Puxe a corda por cima da cabeça até a altura do peito."],
  ["Levantamento terra", "Costas", "Barra", "avancado", "Com a barra no chão, mantenha as costas retas e estenda quadril e joelhos ao levantar."],
  ["Hiperextensão lombar", "Costas", "Peso corporal", "iniciante", "No banco romano, desça o tronco controlado e suba até alinhar com o quadril."],
  ["Pull-over com halter", "Costas", "Halteres", "intermediario", "Deitado, leve o halter por trás da cabeça e retorne controlando a amplitude."],

  // Ombros
  ["Desenvolvimento militar com barra", "Ombros", "Barra", "intermediario", "Empurre a barra acima da cabeça a partir dos ombros."],
  ["Desenvolvimento com halteres", "Ombros", "Halteres", "intermediario", "Sentado ou em pé, empurre os halteres acima da cabeça."],
  ["Desenvolvimento Arnold", "Ombros", "Halteres", "avancado", "Gire os punhos enquanto empurra os halteres acima da cabeça."],
  ["Elevação lateral com halteres", "Ombros", "Halteres", "iniciante", "Eleve os halteres lateralmente até a altura dos ombros."],
  ["Elevação frontal com halteres", "Ombros", "Halteres", "iniciante", "Eleve os halteres à frente do corpo até a altura dos ombros."],
  ["Elevação posterior (crucifixo invertido)", "Ombros", "Halteres", "iniciante", "Inclinado à frente, abra os braços lateralmente para trabalhar o deltoide posterior."],
  ["Remada alta (upright row)", "Ombros", "Barra", "intermediario", "Puxe a barra rente ao corpo até a altura do peito, cotovelos guiando o movimento."],

  // Trapézio
  ["Encolhimento com halteres", "Trapézio", "Halteres", "iniciante", "Eleve os ombros em direção às orelhas segurando os halteres ao lado do corpo."],
  ["Encolhimento com barra", "Trapézio", "Barra", "iniciante", "Eleve os ombros em direção às orelhas segurando a barra à frente do corpo."],

  // Bíceps
  ["Rosca direta com barra", "Bíceps", "Barra", "iniciante", "Flexione os cotovelos levando a barra até a altura do peito."],
  ["Rosca alternada com halteres", "Bíceps", "Halteres", "iniciante", "Flexione um braço de cada vez levando o halter até o ombro."],
  ["Rosca martelo", "Bíceps", "Halteres", "iniciante", "Flexione os cotovelos com os halteres em pegada neutra."],
  ["Rosca concentrada", "Bíceps", "Halteres", "intermediario", "Sentado, apoie o cotovelo na coxa e flexione o braço isoladamente."],
  ["Rosca Scott (banco Scott)", "Bíceps", "Barra", "intermediario", "Apoiado no banco Scott, flexione os cotovelos controlando a descida."],
  ["Rosca no cabo", "Bíceps", "Polia (cabo)", "iniciante", "Com a polia baixa, flexione os cotovelos puxando a barra em direção ao ombro."],

  // Tríceps
  ["Tríceps pulley (corda)", "Tríceps", "Polia (cabo)", "iniciante", "Estenda os cotovelos empurrando a corda para baixo."],
  ["Tríceps testa com barra", "Tríceps", "Barra", "intermediario", "Deitado, desça a barra em direção à testa e estenda os cotovelos."],
  ["Tríceps francês com halter", "Tríceps", "Halteres", "intermediario", "Com o halter atrás da cabeça, estenda o cotovelo mantendo o braço fixo."],
  ["Mergulho no banco (bench dips)", "Tríceps", "Peso corporal", "iniciante", "Apoiado nas mãos entre dois bancos, flexione e estenda os cotovelos."],
  ["Paralelas (dips)", "Tríceps", "Peso corporal", "avancado", "Apoiado nas barras paralelas, desça o corpo flexionando os cotovelos e empurre de volta."],
  ["Tríceps coice (kickback) com halter", "Tríceps", "Halteres", "iniciante", "Inclinado à frente, estenda o cotovelo levando o halter para trás."],

  // Antebraço
  ["Rosca de punho com barra", "Antebraço", "Barra", "iniciante", "Apoiado no banco, flexione os punhos segurando a barra."],
  ["Rosca de punho invertida", "Antebraço", "Barra", "iniciante", "Apoiado no banco, estenda os punhos segurando a barra em pronação."],

  // Quadríceps
  ["Agachamento livre com barra", "Quadríceps", "Barra", "avancado", "Com a barra nas costas, agache mantendo o tronco ereto e suba controlado."],
  ["Agachamento no Smith", "Quadríceps", "Smith", "intermediario", "Na barra guiada, agache controlando a descida e suba de forma estável."],
  ["Leg press 45°", "Quadríceps", "Máquina", "iniciante", "Empurre a plataforma estendendo os joelhos sem travar completamente."],
  ["Cadeira extensora", "Quadríceps", "Máquina", "iniciante", "Sentado, estenda os joelhos elevando o peso até quase travar."],
  ["Agachamento búlgaro", "Quadríceps", "Halteres", "avancado", "Com um pé apoiado atrás em banco, agache sobre a perna da frente."],
  ["Passada (afundo) com halteres", "Quadríceps", "Halteres", "intermediario", "Dê um passo à frente e flexione os joelhos até quase tocar o chão com o de trás."],
  ["Agachamento sumô", "Quadríceps", "Halteres", "intermediario", "Com pernas afastadas e pés rotacionados, agache mantendo o tronco ereto."],
  ["Hack squat", "Quadríceps", "Máquina", "intermediario", "Na máquina hack, agache controlando a descida e estenda os joelhos ao subir."],

  // Posterior de coxa
  ["Mesa flexora", "Posterior de coxa", "Máquina", "iniciante", "Deitado de bruços, flexione os joelhos trazendo o peso em direção aos glúteos."],
  ["Stiff com barra", "Posterior de coxa", "Barra", "intermediario", "Com pernas semi-estendidas, incline o tronco à frente descendo a barra rente às pernas."],
  ["Stiff com halteres", "Posterior de coxa", "Halteres", "intermediario", "Com pernas semi-estendidas, incline o tronco à frente descendo os halteres rente às pernas."],
  ["Cadeira flexora em pé", "Posterior de coxa", "Máquina", "iniciante", "Em pé, flexione o joelho trazendo o calcanhar em direção ao glúteo."],
  ["Levantamento terra romeno", "Posterior de coxa", "Barra", "avancado", "Com pernas semi-estendidas, desça a barra controlando a extensão do quadril na subida."],
  ["Good morning", "Posterior de coxa", "Barra", "avancado", "Com a barra nas costas, incline o tronco à frente mantendo as costas retas."],

  // Glúteos
  ["Elevação pélvica (hip thrust)", "Glúteos", "Barra", "intermediario", "Apoiado no banco com a barra sobre o quadril, eleve o quadril contraindo os glúteos."],
  ["Cadeira abdutora", "Glúteos", "Máquina", "iniciante", "Sentado, afaste as pernas contra a resistência da máquina."],
  ["Cadeira adutora", "Glúteos", "Máquina", "iniciante", "Sentado, aproxime as pernas contra a resistência da máquina."],
  ["Coice no cabo (glute kickback)", "Glúteos", "Polia (cabo)", "iniciante", "Com o cabo preso no tornozelo, estenda a perna para trás contraindo o glúteo."],
  ["Ponte de glúteo", "Glúteos", "Peso corporal", "iniciante", "Deitado, eleve o quadril contraindo os glúteos e retorne controlado."],

  // Panturrilha
  ["Panturrilha em pé (máquina)", "Panturrilha", "Máquina", "iniciante", "Eleve os calcanhares o máximo possível e desça controlado."],
  ["Panturrilha sentado", "Panturrilha", "Máquina", "iniciante", "Sentado, eleve os calcanhares contra a resistência da máquina."],
  ["Panturrilha no leg press", "Panturrilha", "Máquina", "iniciante", "Na plataforma do leg press, empurre com a ponta dos pés estendendo os tornozelos."],

  // Abdômen
  ["Abdominal supra (crunch)", "Abdômen", "Peso corporal", "iniciante", "Deitado, flexione o tronco levando as costelas em direção ao quadril."],
  ["Abdominal infra (elevação de pernas)", "Abdômen", "Peso corporal", "intermediario", "Deitado, eleve as pernas estendidas controlando a descida."],
  ["Prancha isométrica", "Abdômen", "Peso corporal", "iniciante", "Apoiado nos antebraços e pontas dos pés, mantenha o corpo alinhado e reto."],
  ["Prancha lateral", "Abdômen", "Peso corporal", "intermediario", "Apoiado de lado num antebraço, mantenha o corpo alinhado e o quadril elevado."],
  ["Abdominal bicicleta", "Abdômen", "Peso corporal", "iniciante", "Deitado, alterne cotovelo e joelho opostos num movimento de pedalada."],
  ["Abdominal no cabo (crunch cabo)", "Abdômen", "Polia (cabo)", "intermediario", "Ajoelhado de frente para a polia alta, flexione o tronco puxando a corda."],
  ["Elevação de pernas na barra fixa", "Abdômen", "Barra fixa", "avancado", "Pendurado na barra, eleve as pernas estendidas ou flexionadas até a linha do quadril."],
  ["Rotação de tronco no cabo (woodchopper)", "Abdômen", "Polia (cabo)", "intermediario", "Com a polia alta ou baixa, gire o tronco puxando o cabo na diagonal."],
  ["Ab wheel (roda abdominal)", "Abdômen", "Peso corporal", "avancado", "Ajoelhado, role a roda à frente e retorne contraindo o abdômen."],
  ["Sit-up", "Abdômen", "Peso corporal", "iniciante", "Deitado com os joelhos flexionados, eleve o tronco até sentar."],

  // Cardio / Funcional
  ["Corrida na esteira", "Cardio", "Máquina", "iniciante", "Corra em ritmo constante ajustando velocidade e inclinação conforme o objetivo."],
  ["Bicicleta ergométrica", "Cardio", "Máquina", "iniciante", "Pedale em ritmo constante ajustando a carga conforme o objetivo."],
  ["Remo ergométrico", "Cardio", "Máquina", "intermediario", "Puxe o remo estendendo pernas, tronco e braços em sequência."],
  ["Pular corda", "Cardio", "Peso corporal", "iniciante", "Salte de forma leve e constante girando a corda pelos punhos."],
  ["Burpee", "Full body", "Peso corporal", "avancado", "Agache, jogue as pernas para trás em prancha, retorne e salte para cima."],
  ["Mountain climber", "Full body", "Peso corporal", "intermediario", "Em posição de prancha, alterne os joelhos em direção ao peito rapidamente."],
  ["Kettlebell swing", "Full body", "Kettlebell", "intermediario", "Balance o kettlebell entre as pernas até a altura dos ombros usando o quadril."],
  ["Agachamento com salto (jump squat)", "Full body", "Peso corporal", "intermediario", "Agache e salte explosivamente estendendo o corpo, aterrissando de forma controlada."],
  ["Escalador com corda (battle rope)", "Full body", "Corda naval", "intermediario", "Segure as cordas e alterne movimentos ondulatórios com os braços."],
  ["Deslocamento com trenó (sled push)", "Full body", "Trenó", "avancado", "Empurre o trenó mantendo o tronco inclinado e passadas curtas e potentes."]
];

// Id determinístico a partir do nome - garante idempotência sem depender de
// uma constraint de unicidade em "nome" (que não existe hoje): rodar o
// seeder de novo gera sempre os mesmos ids, então o INSERT só acontece para
// exercícios que ainda não existem.
function idDeterministico(nome) {
  const hash = createHash("sha1").update(`exercicio-global:${nome}`).digest("hex");
  const variante = ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16);
  return [hash.slice(0, 8), hash.slice(8, 12), `4${hash.slice(13, 16)}`, `${variante}${hash.slice(17, 20)}`, hash.slice(20, 32)].join("-");
}

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const linhas = EXERCICIOS.map(([nome, grupoMuscular, equipamento, dificuldade, instrucoes]) => ({
      id: idDeterministico(nome),
      equipe_id: null,
      nome,
      grupo_muscular: grupoMuscular,
      equipamento,
      dificuldade,
      instrucoes,
      midia_imagem_url: null,
      midia_video_url: null,
      ativo: true,
      deletado_em: null,
      created_at: now,
      updated_at: now
    }));

    const existentes = await queryInterface.sequelize.query('SELECT id FROM exercicio WHERE id IN (:ids)', {
      replacements: { ids: linhas.map((linha) => linha.id) },
      type: "SELECT"
    });
    const idsExistentes = new Set(existentes.map((linha) => linha.id));
    const novas = linhas.filter((linha) => !idsExistentes.has(linha.id));

    if (novas.length > 0) {
      await queryInterface.bulkInsert("exercicio", novas);
    }
  },

  async down(queryInterface) {
    const ids = EXERCICIOS.map(([nome]) => idDeterministico(nome));
    await queryInterface.bulkDelete("exercicio", { id: ids, equipe_id: null });
  }
};
