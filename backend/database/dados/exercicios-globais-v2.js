"use strict";

// Catálogo global revisado (docs/adr/0027) - lido pelo seeder
// 20261031120100-seed-exercicios-globais-v2.js.
//
// O catálogo original (20260826170000-seed-exercicios-globais.js) usava nomes
// descritivos ("Remada unilateral com halter") em vez dos nomes falados na
// academia ("Serrote"). Aqui:
// - REVISADOS: os 87 exercícios originais, identificados pelo nome original
//   (`antigo`, de onde sai o id - imagens e fichas continuam apontando para
//   eles). Só os campos presentes mudam; `apelidos` são os nomes alternativos
//   globais.
// - NOVOS: exercícios que faltavam (máquinas, divisões como tríceps pulley ×
//   corda e afundo × passada), com id a partir de um código fixo.
//
// Regra (conferida em exercicios-globais-v2.test.js): nenhum nome ou apelido,
// normalizado, aponta para dois exercícios.

const REVISADOS = [
  // Peito
  { antigo: "Supino reto com barra", apelidos: ["supino reto", "supino reto barra"] },
  { antigo: "Supino inclinado com barra", apelidos: ["supino inclinado", "supino inclinado barra"] },
  { antigo: "Supino declinado com barra", apelidos: ["supino declinado"] },
  { antigo: "Supino reto com halteres", apelidos: ["supino reto halter", "supino com halteres", "supino halter"] },
  { antigo: "Supino inclinado com halteres", apelidos: ["supino inclinado halter"] },
  { antigo: "Crucifixo com halteres", nome: "Crucifixo reto", apelidos: ["crucifixo", "crucifixo com halteres", "crucifixo halter"] },
  { antigo: "Crucifixo no cross-over", nome: "Crossover", apelidos: ["cross over", "crucifixo no crossover", "crucifixo na polia"] },
  { antigo: "Peck deck (voador)", nome: "Voador", apelidos: ["peck deck", "peckdeck", "fly", "voador peitoral", "crucifixo máquina"] },
  { antigo: "Flexão de braço", apelidos: ["flexão", "apoio", "flexão de solo"] },
  { antigo: "Crossover polia alta", apelidos: ["crossover alto", "cross polia alta"] },

  // Costas
  { antigo: "Puxada frente (pulley)", nome: "Puxada frontal", apelidos: ["puxada", "puxada alta", "puxada pela frente", "pulley frente", "puxada aberta"] },
  { antigo: "Puxada atrás", nome: "Puxada por trás", apelidos: ["puxada atrás", "puxada nuca", "puxada pela nuca", "pulley costas"] },
  { antigo: "Remada curvada com barra", nome: "Remada curvada", apelidos: ["remada curvada com barra", "remada curvada barra"] },
  { antigo: "Remada cavalinho (T-bar)", nome: "Remada cavalinho", apelidos: ["cavalinho", "t-bar", "remada t"] },
  { antigo: "Remada unilateral com halter", nome: "Serrote", apelidos: ["remada unilateral", "remada unilateral com halter", "remada serrote", "remada com halter"] },
  { antigo: "Remada baixa (cabo/triângulo)", nome: "Remada baixa", apelidos: ["remada sentada", "remada no triângulo", "remada baixa triângulo", "remada no cabo"] },
  { antigo: "Barra fixa pronada (pull-up)", nome: "Barra fixa", apelidos: ["barra fixa pronada", "pull-up", "pull up"] },
  { antigo: "Barra fixa supinada (chin-up)", nome: "Barra fixa supinada", apelidos: ["barra supinada", "chin-up", "chin up"] },
  {
    antigo: "Pulldown com corda",
    instrucoes: "De frente para a polia alta, com os braços quase estendidos, leve a corda em arco até as coxas e volte controlando.",
    apelidos: ["pulldown", "pull down", "pullover na polia", "puxada braços estendidos"]
  },
  { antigo: "Levantamento terra", apelidos: ["terra", "deadlift"] },
  { antigo: "Hiperextensão lombar", apelidos: ["extensão lombar", "lombar", "banco romano", "hiperextensão"] },
  { antigo: "Pull-over com halter", nome: "Pullover com halter", apelidos: ["pullover", "pull over", "pull-over"] },

  // Ombros
  { antigo: "Desenvolvimento militar com barra", nome: "Desenvolvimento com barra", apelidos: ["desenvolvimento militar", "desenvolvimento barra", "militar"] },
  { antigo: "Desenvolvimento com halteres", apelidos: ["desenvolvimento halter"] },
  { antigo: "Desenvolvimento Arnold", apelidos: ["arnold", "arnold press"] },
  { antigo: "Elevação lateral com halteres", nome: "Elevação lateral", apelidos: ["elevação lateral com halteres", "elevação lateral halter", "lateral"] },
  { antigo: "Elevação frontal com halteres", nome: "Elevação frontal", apelidos: ["elevação frontal com halteres", "frontal"] },
  {
    antigo: "Elevação posterior (crucifixo invertido)",
    nome: "Crucifixo inverso com halteres",
    apelidos: ["crucifixo inverso", "crucifixo invertido", "elevação posterior", "posterior de ombro", "deltoide posterior"]
  },
  { antigo: "Remada alta (upright row)", nome: "Remada alta", apelidos: ["upright row", "remada alta com barra"] },

  // Trapézio
  { antigo: "Encolhimento com halteres", apelidos: ["encolhimento", "encolhimento halter"] },
  { antigo: "Encolhimento com barra", apelidos: ["encolhimento barra"] },

  // Bíceps
  { antigo: "Rosca direta com barra", nome: "Rosca direta", apelidos: ["rosca direta com barra", "rosca barra", "rosca w"] },
  { antigo: "Rosca alternada com halteres", nome: "Rosca alternada", apelidos: ["rosca alternada com halteres", "rosca halter"] },
  { antigo: "Rosca martelo", apelidos: ["martelo", "rosca hammer"] },
  { antigo: "Rosca concentrada", apelidos: ["concentrada"] },
  { antigo: "Rosca Scott (banco Scott)", nome: "Rosca Scott", apelidos: ["scott", "rosca no banco scott"] },
  { antigo: "Rosca no cabo", nome: "Rosca direta na polia", apelidos: ["rosca na polia", "rosca polia", "rosca no cabo"] },

  // Tríceps
  { antigo: "Tríceps pulley (corda)", nome: "Tríceps corda", apelidos: ["tríceps na corda", "pulley corda", "tríceps pulley corda"] },
  { antigo: "Tríceps testa com barra", nome: "Tríceps testa", apelidos: ["testa", "rosca testa", "tríceps testa com barra"] },
  { antigo: "Tríceps francês com halter", nome: "Tríceps francês", apelidos: ["francês", "tríceps francês com halter", "tríceps nuca"] },
  { antigo: "Mergulho no banco (bench dips)", nome: "Tríceps banco", apelidos: ["mergulho no banco", "mergulho banco", "tríceps no banco", "bench dips"] },
  { antigo: "Paralelas (dips)", nome: "Paralelas", apelidos: ["mergulho nas paralelas", "paralela", "dips"] },
  { antigo: "Tríceps coice (kickback) com halter", nome: "Tríceps coice", apelidos: ["tríceps coice com halter", "tríceps kickback", "kickback"] },

  // Antebraço
  { antigo: "Rosca de punho com barra", nome: "Rosca punho", apelidos: ["rosca de punho", "rosca punho com barra", "flexão de punho"] },
  { antigo: "Rosca de punho invertida", nome: "Rosca punho invertida", apelidos: ["rosca de punho invertida", "extensão de punho"] },

  // Quadríceps
  { antigo: "Agachamento livre com barra", nome: "Agachamento livre", apelidos: ["agachamento", "agachamento com barra", "agachamento livre com barra", "squat"] },
  { antigo: "Agachamento no Smith", apelidos: ["agachamento smith"] },
  { antigo: "Leg press 45°", nome: "Leg press 45", apelidos: ["leg press", "leg 45", "leg press 45 graus"] },
  { antigo: "Cadeira extensora", apelidos: ["extensora", "extensão de joelhos"] },
  { antigo: "Agachamento búlgaro", apelidos: ["búlgaro", "afundo búlgaro"] },
  {
    antigo: "Passada (afundo) com halteres",
    nome: "Afundo",
    instrucoes: "Com um pé à frente e outro atrás, desça flexionando os joelhos até quase tocar o joelho de trás no chão e suba sem sair do lugar.",
    apelidos: ["afundo com halteres", "afundo estático", "avanço parado", "split squat"]
  },
  { antigo: "Agachamento sumô", apelidos: ["sumô", "sumo com halter"] },
  { antigo: "Hack squat", nome: "Agachamento hack", apelidos: ["hack", "hack squat", "hack machine"] },

  // Posterior de coxa
  { antigo: "Mesa flexora", apelidos: ["flexora deitada", "flexora deitado"] },
  { antigo: "Stiff com barra", nome: "Stiff", apelidos: ["stiff com barra", "stiff barra"] },
  { antigo: "Stiff com halteres", apelidos: ["stiff halter", "stiff com halter"] },
  { antigo: "Cadeira flexora em pé", nome: "Flexora em pé", apelidos: ["flexora unilateral em pé", "flexora em pé unilateral", "cadeira flexora em pé"] },
  { antigo: "Levantamento terra romeno", nome: "Terra romeno", apelidos: ["levantamento terra romeno", "romeno", "rdl"] },
  { antigo: "Good morning", apelidos: ["bom dia"] },

  // Glúteos
  { antigo: "Elevação pélvica (hip thrust)", nome: "Elevação pélvica", apelidos: ["hip thrust", "elevação pélvica com barra", "elevação de quadril"] },
  { antigo: "Cadeira abdutora", apelidos: ["abdutora", "abdução", "abdução de quadril"] },
  { antigo: "Cadeira adutora", grupoMuscular: "Adutores", apelidos: ["adutora", "adução", "adução de quadril"] },
  { antigo: "Coice no cabo (glute kickback)", nome: "Glúteo na polia", apelidos: ["coice na polia", "coice no cabo", "glúteo no cabo", "kickback na polia"] },
  { antigo: "Ponte de glúteo", apelidos: ["ponte", "ponte glútea", "elevação pélvica no solo"] },

  // Panturrilha
  { antigo: "Panturrilha em pé (máquina)", nome: "Panturrilha em pé", apelidos: ["panturrilha máquina", "panturrilha em pé máquina", "gêmeos em pé"] },
  { antigo: "Panturrilha sentado", nome: "Panturrilha sentada", apelidos: ["panturrilha sentado", "sóleo", "gêmeos sentado"] },
  { antigo: "Panturrilha no leg press", apelidos: ["panturrilha leg", "gêmeos no leg"] },

  // Abdômen
  { antigo: "Abdominal supra (crunch)", nome: "Abdominal supra", apelidos: ["supra", "crunch", "abdominal curto"] },
  { antigo: "Abdominal infra (elevação de pernas)", nome: "Abdominal infra", apelidos: ["infra", "elevação de pernas", "abdominal infra no solo"] },
  { antigo: "Prancha isométrica", nome: "Prancha", apelidos: ["prancha isométrica", "prancha frontal"] },
  { antigo: "Prancha lateral", apelidos: ["prancha de lado"] },
  { antigo: "Abdominal bicicleta", apelidos: ["abdominal pedalada"] },
  { antigo: "Abdominal no cabo (crunch cabo)", nome: "Abdominal na polia", apelidos: ["abdominal no cabo", "crunch na polia", "abdominal ajoelhado na polia"] },
  {
    antigo: "Elevação de pernas na barra fixa",
    nome: "Abdominal infra na barra",
    apelidos: ["elevação de pernas na barra", "elevação de pernas suspenso", "infra na barra", "infra suspenso"]
  },
  { antigo: "Rotação de tronco no cabo (woodchopper)", nome: "Lenhador", apelidos: ["woodchopper", "lenhador na polia", "rotação de tronco na polia"] },
  { antigo: "Ab wheel (roda abdominal)", nome: "Roda abdominal", apelidos: ["ab wheel", "rodinha"] },
  { antigo: "Sit-up", nome: "Abdominal completo", apelidos: ["sit-up", "sit up"] },

  // Cardio / Funcional
  { antigo: "Corrida na esteira", nome: "Esteira", apelidos: ["corrida na esteira", "caminhada na esteira", "corrida", "caminhada"] },
  { antigo: "Bicicleta ergométrica", nome: "Bicicleta", apelidos: ["bicicleta ergométrica", "ergométrica", "bike"] },
  { antigo: "Remo ergométrico", nome: "Remo", apelidos: ["remo ergométrico", "remo indoor"] },
  { antigo: "Pular corda", apelidos: ["corda de pular"] },
  { antigo: "Burpee", apelidos: ["burpees"] },
  { antigo: "Mountain climber", nome: "Escalador", apelidos: ["mountain climber", "alpinista"] },
  { antigo: "Kettlebell swing", nome: "Swing com kettlebell", apelidos: ["kettlebell swing", "swing"] },
  { antigo: "Agachamento com salto (jump squat)", nome: "Agachamento com salto", apelidos: ["jump squat", "agachamento saltado", "salto agachado"] },
  { antigo: "Escalador com corda (battle rope)", nome: "Corda naval", apelidos: ["battle rope", "corda ondulatória"] },
  { antigo: "Deslocamento com trenó (sled push)", nome: "Trenó", apelidos: ["sled push", "empurrar trenó", "deslocamento com trenó"] }
];

// [codigo, nome, grupo_muscular, equipamento, dificuldade, instrucoes, apelidos]
const NOVOS = [
  // Peito
  ["supino-maquina", "Supino máquina", "Peito", "Máquina", "iniciante", "Sentado, empurre as alças à frente até estender os braços e volte controlando.", ["chest press", "supino articulado", "supino sentado máquina"]],
  ["crossover-polia-baixa", "Crossover polia baixa", "Peito", "Polia (cabo)", "intermediario", "Com as polias na posição baixa, traga os cabos para cima e à frente do peito.", ["crossover baixo", "cross polia baixa"]],

  // Costas
  ["puxada-triangulo", "Puxada com triângulo", "Costas", "Polia (cabo)", "iniciante", "Sentado, puxe o triângulo até a parte alta do peito mantendo o tronco ereto.", ["puxada triângulo", "puxada fechada", "puxada neutra"]],
  ["puxada-articulada", "Puxada articulada", "Costas", "Máquina", "iniciante", "Sentado na máquina, puxe as alças para baixo até a linha dos ombros.", ["puxada máquina", "puxada hammer"]],
  ["remada-articulada", "Remada articulada", "Costas", "Máquina", "iniciante", "Com o peito apoiado, puxe as alças em direção ao tronco aproximando as escápulas.", ["remada máquina", "remada sentada máquina", "remada hammer"]],
  // Incluídos depois (2026-11-02) - nos bancos que já rodaram o v2, entram
  // pelos seeders 20261102120000-seed-exercicio-paraquedas.js e
  // 20261102130000-seed-exercicio-superman.js. Paraquedas (cotovelos e
  // joelhos dobrados) e Superman (braços e pernas estendidos) são exercícios
  // diferentes - "superman" não é apelido do Paraquedas.
  ["paraquedas", "Paraquedas", "Costas", "Peso corporal", "iniciante", "Deitado de bruços: eleve o peito e as pernas do chão com os cotovelos e os joelhos dobrados, segure um instante e volte controlando.", ["paraquedista", "extensão de tronco no solo"]],
  ["superman", "Superman", "Costas", "Peso corporal", "iniciante", "Deitado de bruços, braços estendidos à frente: eleve braços, peito e pernas do chão mantendo-os estendidos, segure um instante e volte controlando.", ["super-homem", "voo do superman"]],

  // Ombros
  ["desenvolvimento-maquina", "Desenvolvimento máquina", "Ombros", "Máquina", "iniciante", "Sentado, empurre as alças acima da cabeça e desça até a linha das orelhas.", ["desenvolvimento articulado", "shoulder press"]],
  ["elevacao-lateral-polia", "Elevação lateral na polia", "Ombros", "Polia (cabo)", "intermediario", "De lado para a polia baixa, eleve o braço lateralmente até a altura do ombro.", ["lateral na polia", "elevação lateral no cabo"]],
  ["voador-inverso", "Voador inverso", "Ombros", "Máquina", "iniciante", "De frente para o encosto, abra os braços para trás trabalhando o deltoide posterior.", ["peck deck inverso", "crucifixo inverso máquina", "fly inverso"]],
  ["face-pull", "Face pull", "Ombros", "Polia (cabo)", "intermediario", "Com a corda na polia alta, puxe em direção ao rosto abrindo os cotovelos.", ["face pull na corda", "puxada para o rosto"]],

  // Bíceps
  ["rosca-inversa", "Rosca inversa", "Bíceps", "Barra", "iniciante", "Com pegada pronada, flexione os cotovelos levando a barra até a altura do peito.", ["rosca pronada", "rosca invertida"]],

  // Tríceps
  ["triceps-pulley", "Tríceps pulley", "Tríceps", "Polia (cabo)", "iniciante", "Com a barra na polia alta, estenda os cotovelos empurrando a barra para baixo.", ["tríceps na polia", "tríceps no pulley", "tríceps pulley barra", "tríceps barra"]],
  ["triceps-unilateral-polia", "Tríceps unilateral na polia", "Tríceps", "Polia (cabo)", "intermediario", "Com uma mão na polia alta, estenda o cotovelo mantendo o braço junto ao corpo.", ["tríceps unilateral", "tríceps polia unilateral"]],

  // Quadríceps
  ["passada", "Passada", "Quadríceps", "Halteres", "intermediario", "Avance alternando as pernas a cada passo, descendo até quase tocar o joelho de trás no chão.", ["passada com halteres", "passada andando", "afundo caminhando", "avanço", "lunge"]],
  ["leg-press-horizontal", "Leg press horizontal", "Quadríceps", "Máquina", "iniciante", "Sentado, empurre a plataforma estendendo os joelhos sem travar completamente.", ["leg horizontal", "leg press sentado"]],
  ["agachamento-goblet", "Agachamento goblet", "Quadríceps", "Halteres", "iniciante", "Segurando um halter ou kettlebell junto ao peito, agache mantendo o tronco ereto.", ["goblet", "goblet squat", "agachamento com halter"]],
  ["afundo-smith", "Afundo no Smith", "Quadríceps", "Smith", "intermediario", "Na barra guiada, com um pé à frente e outro atrás, desça e suba sem sair do lugar.", ["afundo smith", "avanço no smith"]],
  // Incluído depois (2026-11-02) - nos bancos que já rodaram o v2, entra pelo
  // seeder 20261102140000-seed-exercicio-afundo-reverso.js. Passo para trás,
  // diferente da Passada (para frente) - nada de "lunge" aqui.
  ["afundo-reverso", "Afundo reverso", "Quadríceps", "Halteres", "intermediario", "Segurando um halter junto ao peito, dê um passo atrás e desça até o joelho de trás quase tocar o chão; volte à posição inicial e alterne a perna.", ["agachamento alternado para trás", "passada para trás", "afundo para trás", "recuo", "reverse lunge"]],

  // Posterior de coxa
  ["cadeira-flexora", "Cadeira flexora", "Posterior de coxa", "Máquina", "iniciante", "Sentado, flexione os joelhos levando o rolo para baixo e volte controlando.", ["flexora sentada", "flexora sentado", "cadeira flexora sentada"]],
  ["stiff-unilateral", "Stiff unilateral", "Posterior de coxa", "Halteres", "intermediario", "Apoiado em uma perna, incline o tronco à frente levando a outra perna para trás.", ["stiff unilateral com halter", "stiff uma perna"]],

  // Glúteos
  ["gluteo-4-apoios", "Glúteo 4 apoios", "Glúteos", "Caneleira", "iniciante", "Em quatro apoios, estenda a perna para trás e para cima contraindo o glúteo.", ["coice 4 apoios", "coice com caneleira", "glúteo quatro apoios", "glúteo caneleira", "quatro apoios"]],
  ["gluteo-maquina", "Glúteo máquina", "Glúteos", "Máquina", "iniciante", "Na máquina, empurre a plataforma para trás estendendo o quadril.", ["glúteo no aparelho", "coice máquina"]],

  // Abdômen
  ["abdominal-maquina", "Abdominal máquina", "Abdômen", "Máquina", "iniciante", "Sentado, flexione o tronco contra a resistência da máquina.", ["abdominal no aparelho", "crunch máquina"]],
  ["abdominal-obliquo", "Abdominal oblíquo", "Abdômen", "Peso corporal", "iniciante", "Deitado, flexione o tronco girando em direção ao joelho oposto.", ["oblíquo", "abdominal lateral"]],
  ["abdominal-remador", "Abdominal remador", "Abdômen", "Peso corporal", "intermediario", "Sentado, recolha as pernas e aproxime o tronco dos joelhos ao mesmo tempo.", ["remador"]],

  // Cardio / Funcional
  ["eliptico", "Elíptico", "Cardio", "Máquina", "iniciante", "Movimente pernas e braços em ritmo constante ajustando a carga conforme o objetivo.", ["transport"]],
  ["polichinelo", "Polichinelo", "Full body", "Peso corporal", "iniciante", "Salte abrindo pernas e braços ao mesmo tempo e volte à posição inicial.", ["jumping jack"]]
].map(([codigo, nome, grupoMuscular, equipamento, dificuldade, instrucoes, apelidos]) => ({
  codigo,
  nome,
  grupoMuscular,
  equipamento,
  dificuldade,
  instrucoes,
  apelidos
}));

module.exports = { REVISADOS, NOVOS };
