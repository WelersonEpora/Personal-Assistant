/* ==========================================================================
   Personal Assistant — Mobile prototype logic
   Tudo simulado no cliente: nada é gravado, transcrito ou enviado de verdade.

   Conceito central: REGISTRO. Toda entrada (áudio ou texto) só existe dentro
   de um registro aberto. O celular nunca transcreve áudio — ele só guarda a
   duração da gravação localmente; a transcrição só acontece na nuvem depois
   que o registro sincroniza (por isso funciona 100% offline).
   ========================================================================== */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ---- estado ---------------------------------------------------------
  let currentStudentId = "s1";
  let isOffline = false;
  let activeRegistro = null;    // { studentId, titulo, startedAt, entradas: [] }
  let isRecording = false;
  let recordStart = 0;
  let recordTimerInterval = null;
  let discardConfirming = false;

  // registros finalizados "hoje" — feed local desta sessão do celular
  let feed = [
    { id: "seed1", studentId: "s3", titulo: "", horaInicio: "10:15", status: "aguardando_revisao", entradas: [{ tipo: "audio", duracao: "0:16" }, { tipo: "audio", duracao: "0:10" }] },
    { id: "seed2", studentId: "s4", titulo: "", horaInicio: "11:03", status: "processando_ia", entradas: [{ tipo: "audio", duracao: "0:11" }] },
    { id: "seed3", studentId: "s2", titulo: "", horaInicio: "08:50", status: "sincronizando", entradas: [{ tipo: "texto", conteudo: "Boa evolução essa semana." }] },
    { id: "seed4", studentId: "s5", titulo: "", horaInicio: "08:20", status: "local", entradas: [{ tipo: "audio", duracao: "0:09" }] },
    { id: "seed5", studentId: "s3", titulo: "Planejamento", horaInicio: "07:55", status: "aguardando_sincronizacao", entradas: [{ tipo: "texto", conteudo: "Aumentar carga do agachamento." }] },
  ];

  // ---- refs -------------------------------------------------------------
  const idleView = $("idle-view");
  const composerView = $("composer-view");
  const recentPanel = $("recent-panel");
  const registroTitleInput = $("registro-title-input");
  const startRegistroBtn = $("start-registro-btn");

  const registroHeaderTitle = $("registro-header-title");
  const registroHeaderSub = $("registro-header-sub");
  const registroDiscardX = $("registro-discard-x");

  const entriesScroll = $("entries-scroll");
  const composerInput = $("composer-input");
  const composerRecording = $("composer-recording");
  const composerRecordingTimer = $("composer-recording-timer");
  const micSendBtn = $("mic-send-btn");
  const discardRegistroBtn = $("discard-registro-btn");
  const finalizeRegistroBtn = $("finalize-registro-btn");

  const syncBanner = $("sync-banner");
  const syncBannerText = $("sync-banner-text");
  const recentList = $("recent-list");
  const recentCount = $("recent-count");
  const toastStack = $("toast-stack");
  const currentAvatar = $("current-avatar");
  const currentName = $("current-name");
  const studentSwitchBtn = $("student-switch-btn");
  const sheetOverlay = $("sheet-overlay");
  const sheetList = $("sheet-list");
  const devPanel = $("dev-panel");
  const devOpenBtn = $("dev-open-btn");
  const devCloseBtn = $("dev-close-btn");
  const offlineSwitch = $("offline-switch");
  const forceSyncBtn = $("force-sync-btn");
  const signalIcon = $("signal-icon");
  const clockEl = $("clock");

  // ---- relógio decorativo ------------------------------------------------
  function tickClock() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  tickClock();
  setInterval(tickClock, 15000);

  function formatElapsed(ms) {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  // ---- aluno atual --------------------------------------------------------
  function renderCurrentStudent() {
    const s = studentById(currentStudentId);
    currentAvatar.textContent = s.initials;
    currentAvatar.style.background = s.color;
    currentName.innerHTML = `${s.name}<span class="current-student-caret">▾</span>`;
  }

  function renderSheet() {
    sheetList.innerHTML = STUDENTS.map(s => `
      <button class="sheet-student ${s.id === currentStudentId ? "is-current" : ""}" data-id="${s.id}" style="width:100%;text-align:left;display:flex;align-items:center;gap:12px;">
        <span class="avatar" style="background:${s.color}">${s.initials}</span>
        <span>
          <span class="sheet-student-name" style="display:block;">${s.name}</span>
          <span class="sheet-student-sub">${s.treinoAtual}</span>
        </span>
      </button>
    `).join("");
    sheetList.querySelectorAll(".sheet-student").forEach(btn => {
      btn.addEventListener("click", () => {
        currentStudentId = btn.dataset.id;
        renderCurrentStudent();
        closeSheet();
      });
    });
  }

  function openSheet() { renderSheet(); sheetOverlay.classList.add("open"); }
  function closeSheet() { sheetOverlay.classList.remove("open"); }
  studentSwitchBtn.addEventListener("click", () => { if (!activeRegistro) openSheet(); });
  sheetOverlay.addEventListener("click", (e) => { if (e.target === sheetOverlay) closeSheet(); });

  function lockStudentSwitch(locked) {
    studentSwitchBtn.classList.toggle("is-locked", locked);
  }

  // ---- painel de simulação ------------------------------------------------
  function openDev() { devPanel.classList.add("open"); }
  function closeDev() { devPanel.classList.remove("open"); }
  devOpenBtn.addEventListener("click", openDev);
  devCloseBtn.addEventListener("click", closeDev);

  function setOffline(value) {
    isOffline = value;
    offlineSwitch.classList.toggle("on", isOffline);
    signalIcon.textContent = isOffline ? "🚫" : "📶";
    renderSyncBanner();
  }
  offlineSwitch.addEventListener("click", () => setOffline(!isOffline));

  forceSyncBtn.addEventListener("click", () => {
    if (isOffline) setOffline(false);
    const pending = feed.filter(r => r.status === "local");
    if (!pending.length) { showToast("Nenhum registro pendente.", "neutral"); return; }
    pending.forEach(r => { r.status = "aguardando_sincronizacao"; });
    renderFeed();
    renderSyncBanner();
    showToast(`${pending.length} registro(s) na fila de sincronização…`, "info");
    setTimeout(() => {
      pending.forEach(r => { r.status = "sincronizando"; });
      renderFeed();
      renderSyncBanner();
      setTimeout(() => {
        pending.forEach(r => { r.status = "processando_ia"; });
        renderFeed();
        renderSyncBanner();
        showToast("Registros sincronizados.", "success");
      }, 1200);
    }, 900);
  });

  // ---- lista de registros recentes (tela ociosa) -----------------------------
  function renderFeed() {
    recentCount.textContent = feed.length;
    if (!feed.length) {
      recentList.innerHTML = `<div class="recent-item-empty">Nenhum registro ainda hoje.</div>`;
      return;
    }
    recentList.innerHTML = feed.map(r => {
      const s = studentById(r.studentId);
      const meta = STATUS_META[r.status];
      const audios = r.entradas.filter(e => e.tipo === "audio").length;
      const textos = r.entradas.filter(e => e.tipo === "texto").length;
      const parts = [];
      if (audios) parts.push(`🎙️${audios}`);
      if (textos) parts.push(`⌨️${textos}`);
      return `
        <div class="recent-item">
          <span class="recent-item-avatar" style="background:${s.color}">${s.initials}</span>
          <span class="recent-item-body">
            <span class="recent-item-title">${s.name}${r.titulo ? " · " + r.titulo : ""}</span>
            <span class="recent-item-sub">${r.horaInicio} · ${parts.join("  ")}</span>
          </span>
          <span class="badge badge-${meta.badge}">${meta.icon} ${meta.label}</span>
        </div>
      `;
    }).join("");
  }

  function renderSyncBanner() {
    const localCount = feed.filter(r => r.status === "local").length;
    const pendingCount = feed.filter(r => ["local", "aguardando_sincronizacao", "sincronizando"].includes(r.status)).length;

    syncBanner.classList.remove("state-ok", "state-pending", "state-offline");
    if (isOffline && localCount > 0) {
      syncBanner.classList.add("state-offline");
      syncBannerText.textContent = `Sem conexão — ${localCount} registro(s) salvo(s) no aparelho`;
    } else if (isOffline) {
      syncBanner.classList.add("state-offline");
      syncBannerText.textContent = "Sem conexão — os próximos registros serão salvos no aparelho";
    } else if (pendingCount > 0) {
      syncBanner.classList.add("state-pending");
      syncBannerText.textContent = `Sincronizando ${pendingCount} registro(s)…`;
    } else {
      syncBanner.classList.add("state-ok");
      syncBannerText.textContent = "Tudo sincronizado";
    }
  }

  // ---- toasts ---------------------------------------------------------------
  function showToast(message, kind) {
    const el = document.createElement("div");
    el.className = "toast" + (kind === "success" ? " toast-success" : kind === "warning" ? " toast-warning" : "");
    el.textContent = message;
    toastStack.appendChild(el);
    setTimeout(() => {
      el.classList.add("toast-out");
      setTimeout(() => el.remove(), 200);
    }, 2600);
  }

  // ---- alternância tela ociosa / composer -----------------------------------
  function showIdle() {
    idleView.style.display = "flex";
    composerView.style.display = "none";
    recentPanel.style.display = "flex";
    renderFeed();
  }
  function showComposer() {
    idleView.style.display = "none";
    composerView.style.display = "flex";
    recentPanel.style.display = "none";
  }

  // ---- registro: iniciar / renderizar / finalizar / descartar ---------------
  function startRegistro() {
    activeRegistro = {
      studentId: currentStudentId,
      titulo: registroTitleInput.value.trim(),
      startedAt: Date.now(),
      entradas: [],
    };
    registroTitleInput.value = "";
    lockStudentSwitch(true);
    renderRegistroHeader();
    renderEntries();
    showComposer();
  }
  startRegistroBtn.addEventListener("click", startRegistro);
  registroTitleInput.addEventListener("keydown", (e) => { if (e.key === "Enter") startRegistro(); });

  function renderRegistroHeader() {
    const s = studentById(activeRegistro.studentId);
    registroHeaderTitle.textContent = `Registro aberto — ${s.name}` + (activeRegistro.titulo ? ` · ${activeRegistro.titulo}` : "");
    registroHeaderSub.textContent = `${activeRegistro.entradas.length} entrada(s)`;
  }

  function renderEntries() {
    if (!activeRegistro.entradas.length) {
      entriesScroll.innerHTML = `<div class="entries-empty">Toque e segure o microfone para gravar, ou digite um texto abaixo.</div>`;
      return;
    }
    entriesScroll.innerHTML = activeRegistro.entradas.map(e => {
      if (e.tipo === "audio") {
        return `<div class="entry-bubble audio">
          <span class="entry-bubble-icon">🎙️</span>
          <span class="entry-bubble-body">
            <span class="entry-bubble-label">Áudio</span>
            <span class="entry-bubble-content">Áudio gravado · ${e.duracao}</span>
          </span>
        </div>`;
      }
      return `<div class="entry-bubble texto">
        <span class="entry-bubble-icon">⌨️</span>
        <span class="entry-bubble-body">
          <span class="entry-bubble-label">Texto</span>
          <span class="entry-bubble-content">${e.conteudo}</span>
        </span>
      </div>`;
    }).join("");
    entriesScroll.scrollTop = entriesScroll.scrollHeight;
  }

  function addAudioEntry(elapsedMs) {
    activeRegistro.entradas.push({ tipo: "audio", duracao: formatElapsed(elapsedMs) });
    renderRegistroHeader();
    renderEntries();
  }
  function addTextEntry(text) {
    activeRegistro.entradas.push({ tipo: "texto", conteudo: text });
    renderRegistroHeader();
    renderEntries();
  }

  function finalizeRegistro() {
    if (!activeRegistro.entradas.length) {
      showToast("Adicione ao menos um áudio ou texto antes de finalizar.", "warning");
      return;
    }
    const horaInicio = new Date(activeRegistro.startedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    const finished = {
      id: "local-" + Date.now(),
      studentId: activeRegistro.studentId,
      titulo: activeRegistro.titulo,
      horaInicio,
      entradas: activeRegistro.entradas,
      status: isOffline ? "local" : "sincronizando",
    };
    feed.unshift(finished);
    activeRegistro = null;
    lockStudentSwitch(false);
    showIdle();
    renderSyncBanner();

    if (isOffline) {
      showToast("Registro salvo no dispositivo. Será sincronizado quando houver conexão.", "warning");
    } else {
      showToast("Registro salvo. Sincronizando…", "success");
      setTimeout(() => {
        finished.status = "processando_ia";
        renderFeed();
        renderSyncBanner();
      }, 1300);
    }
  }
  finalizeRegistroBtn.addEventListener("click", finalizeRegistro);

  function handleDiscard() {
    if (!discardConfirming) {
      discardConfirming = true;
      discardRegistroBtn.textContent = "Toque p/ confirmar";
      discardRegistroBtn.classList.add("confirming");
      setTimeout(() => {
        discardConfirming = false;
        discardRegistroBtn.textContent = "Descartar";
        discardRegistroBtn.classList.remove("confirming");
      }, 3000);
      return;
    }
    discardConfirming = false;
    activeRegistro = null;
    lockStudentSwitch(false);
    showIdle();
    showToast("Registro descartado.", "neutral");
  }
  discardRegistroBtn.addEventListener("click", handleDiscard);
  registroDiscardX.addEventListener("click", handleDiscard);

  // ---- composer: texto ou áudio ---------------------------------------------
  function updateMicButtonMode() {
    const hasText = composerInput.value.trim().length > 0;
    micSendBtn.dataset.mode = hasText ? "send" : "mic";
    micSendBtn.textContent = hasText ? "➤" : "🎙️";
  }
  composerInput.addEventListener("input", updateMicButtonMode);
  composerInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); sendTextEntry(); } });

  function sendTextEntry() {
    const val = composerInput.value.trim();
    if (!val) return;
    addTextEntry(val);
    composerInput.value = "";
    updateMicButtonMode();
  }

  function startRecording(e) {
    if (micSendBtn.dataset.mode !== "mic") return;
    if (e.cancelable) e.preventDefault();
    if (isRecording) return;
    isRecording = true;
    recordStart = Date.now();
    micSendBtn.classList.add("recording");
    composerInput.style.display = "none";
    composerRecording.classList.add("active");
    composerRecordingTimer.textContent = "0:00";
    recordTimerInterval = setInterval(() => {
      composerRecordingTimer.textContent = formatElapsed(Date.now() - recordStart);
    }, 100);
  }

  function stopRecording() {
    if (!isRecording) return;
    isRecording = false;
    const elapsed = Date.now() - recordStart;
    clearInterval(recordTimerInterval);
    micSendBtn.classList.remove("recording");
    composerInput.style.display = "";
    composerRecording.classList.remove("active");
    if (elapsed < 400) return;
    addAudioEntry(elapsed);
  }

  micSendBtn.addEventListener("pointerdown", startRecording);
  micSendBtn.addEventListener("pointerup", stopRecording);
  micSendBtn.addEventListener("pointerleave", () => { if (isRecording) stopRecording(); });
  micSendBtn.addEventListener("pointercancel", () => { if (isRecording) stopRecording(); });
  micSendBtn.addEventListener("contextmenu", (e) => e.preventDefault());
  micSendBtn.addEventListener("click", () => { if (micSendBtn.dataset.mode === "send") sendTextEntry(); });

  // ---- init -----------------------------------------------------------------
  updateMicButtonMode();
  renderCurrentStudent();
  showIdle();
  renderSyncBanner();
})();
