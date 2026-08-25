/* ==========================================================================
   Personal Assistant — Desktop prototype logic
   Estado mutável em memória (simula backend); nada é persistido de verdade.
   ========================================================================== */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ---- estado mutável (clone dos dados mock) -----------------------------
  let registrosState = REGISTROS.map(r => ({
    ...r,
    entradas: r.entradas.map(e => ({ ...e })),
    itens: r.itens.map(i => ({ ...i })),
  }));
  let historicoState = HISTORICO.map(h => ({ ...h }));

  let selectedRevisaoId = null;
  let editMode = false;
  let currentAlunoDetailId = null;
  let relatosFilterStatus = "todos";
  let relatosSearch = "";

  const VIEWS = ["dashboard", "alunos", "treinos", "relatos", "revisao", "historico", "configuracoes"];
  const TITLES = {
    dashboard: "Dashboard", alunos: "Alunos", treinos: "Treinos", relatos: "Relatos",
    revisao: "Revisão da IA", historico: "Histórico", configuracoes: "Configurações",
  };

  // ---- roteamento ----------------------------------------------------------
  function navigate(view) {
    if (!VIEWS.includes(view)) view = "dashboard";
    VIEWS.forEach(v => $("view-" + v).classList.toggle("active", v === view));
    document.querySelectorAll(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.view === view));
    $("topbar-title").textContent = TITLES[view];

    if (view === "dashboard") renderDashboard();
    if (view === "alunos") { showAlunosGrid(); renderAlunosGrid(); }
    if (view === "treinos") renderTreinos();
    if (view === "relatos") renderRelatos();
    if (view === "revisao") renderRevisaoView();
    if (view === "historico") renderHistorico();
  }
  window.addEventListener("hashchange", () => navigate(location.hash.slice(1)));

  function goTo(view, hash) {
    navigate(view);
    history.replaceState(null, "", hash);
  }

  // ---- helpers ---------------------------------------------------------------
  function countByStatus(status) { return registrosState.filter(r => r.status === status).length; }
  function pendingCount() { return registrosState.filter(r => ["local", "aguardando_sincronizacao", "sincronizando", "processando_ia"].includes(r.status)).length; }
  function registroLabel(r) { return r.titulo || r.contexto; }
  function entradasSummary(entradas) {
    const audios = entradas.filter(e => e.tipo === "audio").length;
    const textos = entradas.filter(e => e.tipo === "texto").length;
    const parts = [];
    if (audios) parts.push(`🎙️ ${audios}`);
    if (textos) parts.push(`⌨️ ${textos}`);
    return parts.join("  ·  ");
  }

  function updateNavBadge() {
    const n = countByStatus("aguardando_revisao");
    const badge = $("nav-revisao-badge");
    badge.textContent = n;
    badge.style.display = n > 0 ? "inline-flex" : "none";
  }

  function updateSyncPill() {
    const pending = pendingCount();
    $("sync-pill-text").textContent = pending > 0
      ? `Sincronizando ${pending} registro(s) do celular…`
      : "Sincronizado — última atualização há 2 min";
  }

  function showToast(message, kind) {
    const stack = $("toast-stack");
    const el = document.createElement("div");
    el.className = "toast" + (kind === "success" ? " toast-success" : kind === "warning" ? " toast-warning" : "");
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => { el.classList.add("toast-out"); setTimeout(() => el.remove(), 200); }, 2800);
  }

  // ---- dashboard ---------------------------------------------------------------
  function renderDashboard() {
    $("kpi-revisao").textContent = countByStatus("aguardando_revisao");
    $("kpi-pendentes").textContent = pendingCount();
    $("kpi-alunos-hoje").textContent = new Set(registrosState.filter(r => r.data === "24/08").map(r => r.studentId)).size;

    const pendentes = registrosState.filter(r => r.status === "aguardando_revisao").slice(0, 4);
    $("dashboard-revisao-list").innerHTML = pendentes.length ? pendentes.map(r => {
      const s = studentById(r.studentId);
      return `<div class="list-row row-clickable" data-open-revisao="${r.id}">
        <span class="avatar sz-sm" style="background:${s.color}">${s.initials}</span>
        <span class="list-row-body">
          <span class="list-row-title">${s.name} — ${registroLabel(r)}</span>
          <span class="list-row-sub">${entradasSummary(r.entradas)} — ${r.horaInicio}</span>
        </span>
        <span class="badge badge-primary">Revisar</span>
      </div>`;
    }).join("") : `<div class="empty-state" style="padding:26px;"><div class="empty-state-icon">✅</div>Nenhum registro pendente de revisão.</div>`;

    document.querySelectorAll("[data-open-revisao]").forEach(el => {
      el.addEventListener("click", () => {
        selectedRevisaoId = el.dataset.openRevisao;
        goTo("revisao", "#revisao");
      });
    });

    const recent = [...registrosState].sort((a, b) => (a.horaInicio < b.horaInicio ? 1 : -1)).slice(0, 6);
    $("dashboard-activity-list").innerHTML = recent.map(r => {
      const s = studentById(r.studentId);
      const meta = STATUS_META[r.status];
      return `<div class="sidebar-card-item">
        <span class="dot" style="background:${s.color}"></span>
        <span>
          <strong>${s.name}</strong> — ${registroLabel(r)} · ${r.horaInicio}<br/>
          <span class="badge badge-${meta.badge}" style="margin-top:4px;">${meta.icon} ${meta.label}</span>
        </span>
      </div>`;
    }).join("");

    updateNavBadge();
    updateSyncPill();
  }

  // ---- alunos ------------------------------------------------------------------
  function showAlunosGrid() {
    $("alunos-grid-view").style.display = "block";
    $("aluno-detail-view").style.display = "none";
  }
  function showAlunoDetail(id) {
    currentAlunoDetailId = id;
    $("alunos-grid-view").style.display = "none";
    $("aluno-detail-view").style.display = "block";
    renderAlunoDetail(id);
  }
  $("aluno-detail-back").addEventListener("click", showAlunosGrid);

  function renderAlunosGrid() {
    $("students-grid").innerHTML = STUDENTS.map(s => {
      const registroCount = registrosState.filter(r => r.studentId === s.id).length;
      return `<div class="card student-card" data-student="${s.id}">
        <div class="student-card-top">
          <span class="avatar sz-lg" style="background:${s.color}">${s.initials}</span>
          <div>
            <div class="student-card-name">${s.name}</div>
            <div class="student-card-plan">${s.plano}</div>
          </div>
        </div>
        <div class="student-card-workout">${s.treinoAtual}</div>
        <div style="font-size:12px;color:var(--color-text-faint);">${registroCount} registro(s)</div>
      </div>`;
    }).join("");
    document.querySelectorAll("[data-student]").forEach(el => {
      el.addEventListener("click", () => showAlunoDetail(el.dataset.student));
    });
  }

  function renderAlunoDetail(id) {
    const s = studentById(id);
    $("aluno-detail-avatar").textContent = s.initials;
    $("aluno-detail-avatar").style.background = s.color;
    $("aluno-detail-name").textContent = s.name;
    $("aluno-detail-sub").textContent = s.treinoAtual;
    $("aluno-detail-tags").innerHTML = `<span class="badge badge-primary">${s.plano}</span>`;

    const hist = historicoState.filter(h => h.studentId === id);
    $("aluno-detail-historico").innerHTML = hist.length ? hist.map(h => `
      <div class="list-row"><span class="list-row-body"><span class="list-row-title">${h.titulo}</span><span class="list-row-sub">${h.data} — ${h.itens} itens</span></span><span class="badge badge-success">Confirmado</span></div>
    `).join("") : `<div class="empty-state" style="padding:20px;">Sem registros confirmados ainda.</div>`;

    const rel = registrosState.filter(r => r.studentId === id);
    $("aluno-detail-relatos").innerHTML = rel.length ? rel.map(r => {
      const meta = STATUS_META[r.status];
      return `<div class="list-row"><span class="list-row-body"><span class="list-row-title">${r.data} — ${registroLabel(r)}</span><span class="list-row-sub">${entradasSummary(r.entradas)}</span></span><span class="badge badge-${meta.badge}">${meta.label}</span></div>`;
    }).join("") : `<div class="empty-state" style="padding:20px;">Nenhum registro ainda.</div>`;
  }

  // ---- treinos -----------------------------------------------------------------
  function renderTreinos() {
    $("treinos-tbody").innerHTML = STUDENTS.map(s => {
      const hist = historicoState.filter(h => h.studentId === s.id).sort((a, b) => (a.data < b.data ? 1 : -1));
      const last = hist[0];
      return `<tr class="row-clickable" data-student="${s.id}">
        <td><div style="display:flex;align-items:center;gap:10px;"><span class="avatar sz-sm" style="background:${s.color}">${s.initials}</span>${s.name}</div></td>
        <td>${s.treinoAtual}</td>
        <td>${s.plano}</td>
        <td>${last ? last.data : "—"}</td>
        <td><span class="badge badge-success">Ativo</span></td>
      </tr>`;
    }).join("");
    document.querySelectorAll("#treinos-tbody tr[data-student]").forEach(el => {
      el.addEventListener("click", () => {
        navigate("alunos");
        showAlunoDetail(el.dataset.student);
        history.replaceState(null, "", "#alunos");
      });
    });
  }

  // ---- relatos (registros) -------------------------------------------------------
  function renderRelatos() {
    document.querySelectorAll("#relatos-filter-tabs .filter-tab").forEach(t =>
      t.classList.toggle("active", t.dataset.status === relatosFilterStatus));

    let list = registrosState.slice();
    if (relatosFilterStatus !== "todos") list = list.filter(r => r.status === relatosFilterStatus);
    if (relatosSearch) list = list.filter(r => studentById(r.studentId).name.toLowerCase().includes(relatosSearch.toLowerCase()));
    list.sort((a, b) => (a.horaInicio < b.horaInicio ? 1 : -1));

    $("relatos-tbody").innerHTML = list.length ? list.map(r => {
      const s = studentById(r.studentId);
      const meta = STATUS_META[r.status];
      const clickable = r.status === "aguardando_revisao";
      const chips = r.entradas.map(e => `<span class="entry-chip entry-chip-${e.tipo}">${entradaIcon(e.tipo)}</span>`).join("");
      return `<div class="card registro-card ${clickable ? "row-clickable" : ""}" ${clickable ? `data-relato="${r.id}"` : ""}>
        <div class="registro-card-head">
          <div class="registro-card-who">
            <span class="avatar sz-sm" style="background:${s.color}">${s.initials}</span>
            <div>
              <div class="list-row-title">${s.name} — Registro de ${r.data}</div>
              <div class="list-row-sub">${registroLabel(r)} · iniciado às ${r.horaInicio}</div>
            </div>
          </div>
          <span class="badge badge-${meta.badge}">${meta.icon} ${meta.label}</span>
        </div>
        <div class="registro-card-entries">${chips}<span class="registro-card-count">${r.entradas.length} entrada(s)</span></div>
        ${clickable ? '<div class="registro-card-foot">Revisar →</div>' : ""}
      </div>`;
    }).join("") : `<div class="empty-state">Nenhum registro encontrado.</div>`;

    document.querySelectorAll(".registro-card[data-relato]").forEach(el => {
      el.addEventListener("click", () => {
        selectedRevisaoId = el.dataset.relato;
        goTo("revisao", "#revisao");
      });
    });
  }

  document.querySelectorAll("#relatos-filter-tabs .filter-tab").forEach(t => {
    t.addEventListener("click", () => { relatosFilterStatus = t.dataset.status; renderRelatos(); });
  });
  $("relatos-search").addEventListener("input", (e) => { relatosSearch = e.target.value; renderRelatos(); });

  // ---- revisão -----------------------------------------------------------------
  function renderRevisaoView() {
    const queue = registrosState.filter(r => r.status === "aguardando_revisao");
    if (!selectedRevisaoId || !queue.find(r => r.id === selectedRevisaoId)) {
      selectedRevisaoId = queue[0] ? queue[0].id : null;
    }

    $("revisao-queue").innerHTML = queue.length ? queue.map(r => {
      const s = studentById(r.studentId);
      return `<div class="queue-item ${r.id === selectedRevisaoId ? "active" : ""}" data-relato="${r.id}">
        <span class="avatar sz-sm" style="background:${s.color}">${s.initials}</span>
        <span class="queue-item-body">
          <span class="queue-item-title">${s.name} — ${registroLabel(r)}</span>
          <span class="queue-item-sub">${r.data} — ${r.horaInicio}</span>
        </span>
      </div>`;
    }).join("") : `<div class="empty-state" style="padding:24px;">Fila vazia 🎉</div>`;

    document.querySelectorAll("#revisao-queue .queue-item").forEach(el => {
      el.addEventListener("click", () => { selectedRevisaoId = el.dataset.relato; editMode = false; renderRevisaoView(); });
    });

    renderRevisaoMain();
  }

  function renderEntradasSource(registro) {
    return registro.entradas.map((e, i) => {
      if (e.tipo === "audio") {
        const texto = e.transcricao ? `"${e.transcricao}"` : `<span style="color:var(--color-text-faint);font-style:normal;">Transcrição ainda não disponível.</span>`;
        return `<div class="source-entry"><span class="source-entry-icon">🎙️</span><div><div class="source-entry-meta">Áudio · ${e.duracao}</div><div class="source-entry-text">${texto}</div></div></div>`;
      }
      return `<div class="source-entry"><span class="source-entry-icon">⌨️</span><div><div class="source-entry-meta">Texto</div><div class="source-entry-text" style="font-style:normal;">"${e.conteudo}"</div></div></div>`;
    }).join("");
  }

  function renderRevisaoMain() {
    const container = $("revisao-main");
    const registro = registrosState.find(r => r.id === selectedRevisaoId);

    if (!registro) {
      container.innerHTML = `<div class="card"><div class="empty-state"><div class="empty-state-icon">✅</div>Nenhum registro aguardando revisão no momento.<br/>Assim que a IA processar um novo registro, ele aparece aqui.</div></div>`;
      return;
    }

    const s = studentById(registro.studentId);

    if (editMode) {
      container.innerHTML = `
        <div class="card revisao-card">
          <div class="detail-header" style="margin-bottom:14px;">
            <span class="avatar sz-md" style="background:${s.color}">${s.initials}</span>
            <div>
              <div class="detail-header-name" style="font-size:16px;">${s.name} — ${registroLabel(registro)}</div>
              <div class="detail-header-sub">Registro de ${registro.data} · ${entradasSummary(registro.entradas)}</div>
            </div>
          </div>
          <p style="font-size:12px;font-weight:700;color:var(--color-text-faint);text-transform:uppercase;letter-spacing:.03em;margin:6px 0 10px;">Editando itens identificados</p>
          <div id="edit-fields"></div>
          <div class="revisao-actions">
            <button class="btn btn-primary" id="btn-save-edit">Salvar alterações</button>
            <button class="btn btn-ghost" id="btn-cancel-edit">Cancelar</button>
          </div>
        </div>
      `;
      $("edit-fields").innerHTML = registro.itens.map((it, i) => `
        <div class="exercise-card">
          <div class="field-row">
            <div class="field-group" style="grid-column:1/-1;"><label>Item</label><input type="text" data-field="label" data-idx="${i}" value="${it.label}" /></div>
            <div class="field-group" style="grid-column:1/-1;"><label>Valor</label><input type="text" data-field="valor" data-idx="${i}" value="${it.valor}" /></div>
            <div class="field-group obs-field"><label>Observação</label><textarea data-field="obs" data-idx="${i}">${it.obs}</textarea></div>
          </div>
        </div>
      `).join("");

      $("btn-save-edit").addEventListener("click", () => {
        document.querySelectorAll("#edit-fields [data-field]").forEach(inputEl => {
          const idx = Number(inputEl.dataset.idx);
          registro.itens[idx][inputEl.dataset.field] = inputEl.value;
        });
        editMode = false;
        renderRevisaoView();
        showToast("Alterações salvas.", "success");
      });
      $("btn-cancel-edit").addEventListener("click", () => { editMode = false; renderRevisaoView(); });
      return;
    }

    container.innerHTML = `
      <div class="card revisao-card">
        <div class="detail-header" style="margin-bottom:14px;">
          <span class="avatar sz-md" style="background:${s.color}">${s.initials}</span>
          <div>
            <div class="detail-header-name" style="font-size:16px;">${s.name} — ${registroLabel(registro)}</div>
            <div class="detail-header-sub">Registro de ${registro.data} · iniciado às ${registro.horaInicio}</div>
          </div>
        </div>

        <div class="revisao-source">
          ${entradasSummary(registro.entradas)} neste registro
          <span class="revisao-source-toggle" id="toggle-transcript">Ver entradas originais</span>
        </div>
        <div class="transcript-box" id="transcript-box">${renderEntradasSource(registro)}</div>

        ${registro.notaGeral ? `<div class="exercise-obs" style="margin-top:14px;">Nota geral: ${registro.notaGeral}</div>` : ""}

        <p style="font-size:12px;font-weight:700;color:var(--color-text-faint);text-transform:uppercase;letter-spacing:.03em;margin:18px 0 10px;">A IA identificou</p>

        ${registro.itens.map(it => `
          <div class="exercise-card">
            <div class="exercise-card-top">
              <div>
                <div class="exercise-name">${it.label}</div>
                <div class="exercise-meta">${it.valor}</div>
              </div>
              <span class="confidence-note ${it.confidence === "alta" ? "alta" : "media"}">${it.confidence === "alta" ? "● Alta confiança" : "● Revisar"}</span>
            </div>
            <div class="exercise-obs ${it.obs ? "" : "empty"}">Observação: ${it.obs}</div>
          </div>
        `).join("")}

        <div class="revisao-actions">
          <button class="btn btn-secondary" id="btn-edit">Editar</button>
          <button class="btn btn-primary" id="btn-confirm">Confirmar</button>
        </div>
      </div>
    `;

    $("toggle-transcript").addEventListener("click", () => {
      $("transcript-box").classList.toggle("open");
      $("toggle-transcript").textContent = $("transcript-box").classList.contains("open") ? "Ocultar entradas originais" : "Ver entradas originais";
    });
    $("btn-edit").addEventListener("click", () => { editMode = true; renderRevisaoView(); });
    $("btn-confirm").addEventListener("click", () => {
      registro.status = "confirmado";
      historicoState.unshift({
        id: "h-" + registro.id,
        studentId: registro.studentId,
        data: registro.data,
        titulo: registroLabel(registro) === registro.contexto ? `${registro.contexto} — ${s.treinoAtual}` : registroLabel(registro),
        itens: registro.itens.length,
        status: "confirmado",
      });
      selectedRevisaoId = null;
      showToast(`Registro de ${s.name} confirmado e salvo no histórico.`, "success");
      renderRevisaoView();
      updateNavBadge();
    });
  }

  // ---- histórico ---------------------------------------------------------------
  function renderHistorico() {
    const list = [...historicoState].sort((a, b) => (a.data < b.data ? 1 : -1));
    $("historico-tbody").innerHTML = list.map(h => {
      const s = studentById(h.studentId);
      return `<tr>
        <td>${h.data}</td>
        <td><div style="display:flex;align-items:center;gap:10px;"><span class="avatar sz-sm" style="background:${s.color}">${s.initials}</span>${s.name}</div></td>
        <td>${h.titulo}</td>
        <td>${h.itens}</td>
        <td><span class="badge badge-success">Confirmado</span></td>
      </tr>`;
    }).join("");
  }

  // ---- configurações -------------------------------------------------------------
  document.querySelectorAll("[data-setting]").forEach(sw => {
    sw.addEventListener("click", () => sw.classList.toggle("on"));
  });

  // ---- init ------------------------------------------------------------------------
  navigate(location.hash ? location.hash.slice(1) : "dashboard");
})();
