/* ==========================================================================
   Personal Assistant — Dados fictícios compartilhados (mobile + desktop)
   Simula o estado que, num sistema real, viria do backend / IndexedDB.

   Conceito central: REGISTRO.
   Toda captura do personal acontece dentro de um registro, que agrupa
   quantas entradas (áudio ou texto) forem necessárias. Só quando o registro
   é finalizado ele vira uma unidade de processamento para a IA. O celular
   nunca transcreve nada localmente — isso só acontece depois que o registro
   sincroniza com a nuvem, por isso registros "local" / "processando_ia"
   ainda não têm transcrição disponível.
   ========================================================================== */

const STUDENTS = [
  { id: "s1", name: "João Silva",   initials: "JS", plano: "Hipertrofia",     treinoAtual: "Treino A — Peito / Tríceps", color: "#4f46e5" },
  { id: "s2", name: "Maria Costa",  initials: "MC", plano: "Emagrecimento",   treinoAtual: "Treino B — Full Body",       color: "#0ea5e9" },
  { id: "s3", name: "Pedro Santos", initials: "PS", plano: "Condicionamento", treinoAtual: "Treino C — Costas / Bíceps", color: "#16a34a" },
  { id: "s4", name: "Ana Lima",     initials: "AL", plano: "Hipertrofia",     treinoAtual: "Treino A — Pernas",          color: "#d97706" },
  { id: "s5", name: "Rafael Souza", initials: "RS", plano: "Reabilitação",    treinoAtual: "Treino Adaptado — Ombro",    color: "#db2777" },
];

function studentById(id) { return STUDENTS.find(s => s.id === id); }

/*
 * Estados possíveis de um registro, do celular até a validação:
 *   local                  -> finalizado sem internet, só existe no aparelho
 *   aguardando_sincronizacao -> conexão voltou, na fila para enviar
 *   sincronizando          -> enviando as entradas (áudio + texto) para a nuvem
 *   processando_ia         -> na nuvem: áudio sendo transcrito e a IA extraindo os dados
 *   aguardando_revisao     -> IA já gerou os itens estruturados, falta o personal confirmar
 *   confirmado             -> personal revisou e confirmou, já está no histórico do aluno
 */
const STATUS_META = {
  local:                    { label: "Salvo no dispositivo",     badge: "warning", icon: "📴" },
  aguardando_sincronizacao: { label: "Aguardando sincronização", badge: "warning", icon: "⏳" },
  sincronizando:            { label: "Sincronizando…",           badge: "info",    icon: "⇅" },
  processando_ia:           { label: "IA processando…",          badge: "info",    icon: "✨" },
  aguardando_revisao:       { label: "Aguardando revisão",       badge: "primary", icon: "📝" },
  confirmado:               { label: "Confirmado",               badge: "success", icon: "✓" },
};

/*
 * Cada registro tem uma lista de `entradas` (na ordem em que foram
 * capturadas) e, quando já processado pela IA, uma lista de `itens`
 * estruturados (formato genérico label/valor/obs — funciona tanto para
 * exercícios quanto para medidas de avaliação física, observações,
 * planejamento etc.).
 */
const REGISTROS = [
  {
    id: "b1",
    studentId: "s1",
    titulo: "",
    contexto: "Treino",
    data: "24/08",
    horaInicio: "09:40",
    status: "aguardando_revisao",
    entradas: [
      { tipo: "audio", duracao: "0:14", transcricao: "João fez agachamento quatro por dez com trinta quilos." },
      { tipo: "texto", conteudo: "Na última série teve bastante dificuldade." },
      { tipo: "audio", duracao: "0:12", transcricao: "Depois fez supino três por dez com vinte e cinco quilos, execução tranquila." },
    ],
    itens: [
      { label: "Agachamento", valor: "4 × 10 — 30 kg", obs: "Dificuldade elevada na última série.", confidence: "alta" },
      { label: "Supino", valor: "3 × 10 — 25 kg", obs: "", confidence: "alta" },
    ],
    notaGeral: "",
  },
  {
    id: "b2",
    studentId: "s1",
    titulo: "Avaliação física mensal",
    contexto: "Avaliação física",
    data: "23/08",
    horaInicio: "18:10",
    status: "aguardando_revisao",
    entradas: [
      { tipo: "audio", duracao: "0:05", transcricao: "Braço direito, trinta e quatro centímetros." },
      { tipo: "audio", duracao: "0:05", transcricao: "Braço esquerdo, trinta e três e meio." },
      { tipo: "texto", conteudo: "Medidas realizadas após o treino." },
      { tipo: "audio", duracao: "0:04", transcricao: "Quadril, noventa e oito." },
      { tipo: "audio", duracao: "0:05", transcricao: "Coxa direita, cinquenta e oito." },
    ],
    itens: [
      { label: "Braço direito", valor: "34 cm", obs: "", confidence: "alta" },
      { label: "Braço esquerdo", valor: "33,5 cm", obs: "", confidence: "alta" },
      { label: "Quadril", valor: "98 cm", obs: "", confidence: "alta" },
      { label: "Coxa direita", valor: "58 cm", obs: "", confidence: "média" },
    ],
    notaGeral: "Medidas realizadas após o treino.",
  },
  {
    id: "b3",
    studentId: "s3",
    titulo: "",
    contexto: "Treino",
    data: "24/08",
    horaInicio: "10:15",
    status: "aguardando_revisao",
    entradas: [
      { tipo: "audio", duracao: "0:16", transcricao: "Pedro fez quatro séries de oito na puxada alta com quarenta e cinco quilos, pediu pra reduzir a carga na próxima." },
      { tipo: "audio", duracao: "0:10", transcricao: "Depois remada baixa três por doze com trinta e cinco." },
    ],
    itens: [
      { label: "Puxada alta", valor: "4 × 8 — 45 kg", obs: "Aluno pediu para reduzir a carga na próxima sessão.", confidence: "alta" },
      { label: "Remada baixa", valor: "3 × 12 — 35 kg", obs: "", confidence: "média" },
    ],
    notaGeral: "",
  },
  {
    id: "b4",
    studentId: "s4",
    titulo: "",
    contexto: "Treino",
    data: "24/08",
    horaInicio: "11:03",
    status: "processando_ia",
    entradas: [
      { tipo: "audio", duracao: "0:11", transcricao: null },
    ],
    itens: [],
    notaGeral: "",
  },
  {
    id: "b5",
    studentId: "s2",
    titulo: "",
    contexto: "Observação",
    data: "24/08",
    horaInicio: "08:50",
    status: "sincronizando",
    entradas: [
      { tipo: "texto", conteudo: "Maria está com boa evolução na força de membros superiores, mas relatou cansaço geral essa semana." },
    ],
    itens: [],
    notaGeral: "",
  },
  {
    id: "b6",
    studentId: "s5",
    titulo: "",
    contexto: "Treino",
    data: "24/08",
    horaInicio: "08:20",
    status: "local",
    entradas: [
      { tipo: "audio", duracao: "0:09", transcricao: null },
    ],
    itens: [],
    notaGeral: "",
  },
  {
    id: "b7",
    studentId: "s3",
    titulo: "",
    contexto: "Planejamento",
    data: "24/08",
    horaInicio: "07:55",
    status: "aguardando_sincronizacao",
    entradas: [
      { tipo: "texto", conteudo: "Próxima semana, aumentar carga do agachamento e incluir exercício de mobilidade de quadril." },
    ],
    itens: [],
    notaGeral: "",
  },
];

function registroById(id) { return REGISTROS.find(r => r.id === id); }
function entradaIcon(tipo) { return tipo === "audio" ? "🎙️" : "⌨️"; }

/* Histórico de registros já confirmados — alimenta a tela de Histórico do desktop. */
const HISTORICO = [
  { id: "h1", studentId: "s1", data: "22/08", titulo: "Treino A — Peito / Tríceps", itens: 5, status: "confirmado" },
  { id: "h2", studentId: "s2", data: "23/08", titulo: "Treino B — Full Body",       itens: 6, status: "confirmado" },
  { id: "h3", studentId: "s3", data: "21/08", titulo: "Treino C — Costas / Bíceps", itens: 4, status: "confirmado" },
  { id: "h4", studentId: "s4", data: "20/08", titulo: "Treino A — Pernas",          itens: 5, status: "confirmado" },
  { id: "h5", studentId: "s1", data: "19/08", titulo: "Treino B — Ombro / Abdômen", itens: 4, status: "confirmado" },
  { id: "h6", studentId: "s5", data: "18/08", titulo: "Treino Adaptado — Ombro",    itens: 3, status: "confirmado" },
];
