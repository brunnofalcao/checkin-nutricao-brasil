// =============================================================
// Sistema de Check-in · Nutrição Brasil
// app.js — Lógica completa (vanilla JS + Supabase)
// =============================================================

import { SUPABASE_URL, SUPABASE_ANON_KEY, NB_LOGO } from "./config.js";

// ----- Init Supabase -----
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
  realtime: { params: { eventsPerSecond: 10 } }
});

// ----- App State -----
const state = {
  user: null,
  profile: null,
  events: [],
  currentEvent: null,
  participants: [],
  filter: "all",
  search: "",
  view: "loading",
  realtimeChannels: []
};

// =============================================================
// UTILS
// =============================================================
function $(id) { return document.getElementById(id); }
function esc(s) {
  return (s || "").toString()
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function norm(s) {
  return (s || "").toString().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}
function initials(name) {
  const parts = (name || "").trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[parts.length - 1]?.[0] || "")).toUpperCase() || "??";
}
function fmtTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function fmtRelative(ts) {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins}min`;
  const hrs = Math.floor(mins / 60);
  return `há ${hrs}h`;
}
function fmtDateBlock(dateStr) {
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const d = new Date(dateStr + "T00:00:00");
  return { day: d.getDate(), month: meses[d.getMonth()] };
}
function haptic(type = "light") {
  if (!("vibrate" in navigator)) return;
  if (type === "light") navigator.vibrate(8);
  else if (type === "success") navigator.vibrate([12, 40, 18]);
  else if (type === "error") navigator.vibrate([30, 50, 30]);
}

let toastTimer;
function toast(msg, type = "success") {
  const t = $("toast");
  $("toastText").textContent = msg;
  t.className = "toast " + type;
  const icon = $("toastIcon");
  if (type === "error") {
    icon.innerHTML = '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';
  } else {
    icon.innerHTML = '<polyline points="20 6 9 17 4 12"/>';
  }
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}

function openModal(html) {
  const mount = $("modal-mount");
  mount.innerHTML = `<div class="modal-overlay show" id="currentModal">${html}</div>`;
  document.body.style.overflow = "hidden";
  mount.querySelector(".modal-overlay").addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-overlay") || e.target.closest("[data-close]")) {
      closeModal();
    }
  });
}
function closeModal() {
  $("modal-mount").innerHTML = "";
  document.body.style.overflow = "";
}

// =============================================================
// AUTH
// =============================================================
async function loadSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    state.user = session.user;
    await loadProfile();
    return true;
  }
  return false;
}

async function loadProfile() {
  if (!state.user) return;
  const { data } = await sb.from("profiles").select("*").eq("id", state.user.id).single();
  if (data) state.profile = data;
  if (!data && state.user.email) {
    state.profile = {
      id: state.user.id,
      email: state.user.email,
      role: state.user.email.includes("falcao") ? "admin" : "operadora"
    };
  }
}

async function doLogin(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  state.user = data.user;
  await loadProfile();
}

async function doLogout() {
  unsubscribeRealtime();
  await sb.auth.signOut();
  state.user = null;
  state.profile = null;
  state.events = [];
  state.currentEvent = null;
  state.participants = [];
  renderLogin();
}

function isAdmin() { return state.profile?.role === "admin"; }

// =============================================================
// EVENTS DATA
// =============================================================
async function loadEvents() {
  const { data, error } = await sb.from("events").select("*").order("event_date", { ascending: true });
  if (error) { toast("Erro ao carregar eventos: " + error.message, "error"); return; }
  state.events = data || [];
}
async function createEvent(payload) {
  const { data, error } = await sb.from("events").insert(payload).select().single();
  if (error) throw error;
  await loadEvents();
  return data;
}
async function updateEvent(id, patch) {
  const { error } = await sb.from("events").update(patch).eq("id", id);
  if (error) throw error;
  await loadEvents();
}
async function deleteEvent(id) {
  const { error } = await sb.from("events").delete().eq("id", id);
  if (error) throw error;
  await loadEvents();
}

// =============================================================
// PARTICIPANTS DATA
// =============================================================
async function loadParticipants(eventId) {
  const { data, error } = await sb.from("participants").select("*").eq("event_id", eventId).order("name", { ascending: true });
  if (error) { toast("Erro ao carregar participantes: " + error.message, "error"); return; }
  state.participants = data || [];
}

async function toggleCheckIn(participantId) {
  const p = state.participants.find(x => x.id === participantId);
  if (!p) return;
  const newChecked = !p.checked;
  const patch = {
    checked: newChecked,
    checked_at: newChecked ? new Date().toISOString() : null,
    checked_by: newChecked ? state.user.id : null
  };
  Object.assign(p, patch);
  renderCheckinList();
  haptic(newChecked ? "success" : "light");
  toast(newChecked ? `✓ ${p.name.split(" ")[0]} — check-in feito` : `Desfeito: ${p.name.split(" ")[0]}`, "success");

  const { error } = await sb.from("participants").update(patch).eq("id", participantId);
  if (error) {
    Object.assign(p, { checked: !newChecked, checked_at: !newChecked ? new Date().toISOString() : null });
    renderCheckinList();
    toast("Erro ao gravar: " + error.message, "error");
  }
}

async function importParticipants(eventId, rows) {
  const records = rows.map(r => ({
    event_id: eventId,
    name: r.name,
    email: r.email || null,
    phone: r.phone || null,
    code: r.code || null,
    lote: r.lote || null
  }));
  const { error } = await sb.from("participants").insert(records);
  if (error) throw error;
}

// =============================================================
// REALTIME
// =============================================================
function unsubscribeRealtime() {
  state.realtimeChannels.forEach(ch => sb.removeChannel(ch));
  state.realtimeChannels = [];
}
function subscribeToEvents() {
  const ch = sb.channel("public:events")
    .on("postgres_changes", { event: "*", schema: "public", table: "events" }, async () => {
      await loadEvents();
      if (state.view === "events") renderEvents();
    })
    .subscribe();
  state.realtimeChannels.push(ch);
}
function subscribeToParticipants(eventId) {
  const ch = sb.channel(`participants:${eventId}`)
    .on("postgres_changes", {
      event: "*", schema: "public", table: "participants",
      filter: `event_id=eq.${eventId}`
    }, async (payload) => {
      const { eventType, new: newRow, old: oldRow } = payload;
      if (eventType === "INSERT") {
        if (!state.participants.find(p => p.id === newRow.id)) state.participants.push(newRow);
      } else if (eventType === "UPDATE") {
        const idx = state.participants.findIndex(p => p.id === newRow.id);
        if (idx >= 0) state.participants[idx] = newRow;
      } else if (eventType === "DELETE") {
        state.participants = state.participants.filter(p => p.id !== oldRow.id);
      }
      if (state.view === "checkin") renderCheckinList();
    })
    .subscribe();
  state.realtimeChannels.push(ch);
}

// =============================================================
// CSV PARSER
// =============================================================
function parseImport(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  let sep = ",";
  const sample = lines[0];
  if (sample.includes("\t")) sep = "\t";
  else if (sample.includes(";")) sep = ";";
  else if (!sample.includes(",")) sep = null;

  let startIdx = 0;
  let headers = null;
  if (sep) {
    const firstCols = lines[0].split(sep).map(c => norm(c.replace(/^["']|["']$/g, "")));
    const headerKeywords = ["nome", "name", "email", "telefone", "phone", "lote", "codigo", "code", "celular", "whatsapp"];
    if (firstCols.some(c => headerKeywords.includes(c))) {
      headers = firstCols;
      startIdx = 1;
    }
  }

  const out = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    let name, email = "", phone = "", lote = "", code = "";
    if (sep) {
      const cols = line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ""));
      if (headers) {
        const map = {};
        headers.forEach((h, idx) => { map[h] = cols[idx] || ""; });
        name = map.nome || map.name || cols[0];
        email = map.email || map["e-mail"] || "";
        phone = map.telefone || map.phone || map.celular || map.whatsapp || "";
        lote = map.lote || map.categoria || map.ingresso || "";
        code = map.codigo || map.code || "";
      } else {
        name = cols[0];
        lote = cols[1] || "";
        code = cols[2] || "";
        email = cols[3] || "";
        phone = cols[4] || "";
      }
    } else {
      name = line;
    }
    if (!name) continue;
    out.push({ name, email, phone, lote, code: code || generateCode() });
  }
  return out;
}

function generateCode() {
  return "NB" + Math.random().toString(36).slice(2, 10).toUpperCase();
}

// =============================================================
// RENDER · LOGIN
// =============================================================
function renderLogin() {
  state.view = "login";
  $("app").innerHTML = `
    <div class="container">
      <div class="login-screen">
        <div class="login-card">
          <img class="login-logo" src="${NB_LOGO}" alt="Nutrição Brasil">
          <div class="login-title">Credenciamento</div>
          <div class="login-sub">Acesso restrito · Equipe</div>
          <form class="login-form" id="loginForm">
            <div class="field">
              <div class="field-label">Email</div>
              <input type="email" class="field-input" id="loginEmail" placeholder="seu@email.com" autocomplete="email" required>
            </div>
            <div class="field">
              <div class="field-label">Senha</div>
              <input type="password" class="field-input" id="loginPass" placeholder="••••••••" autocomplete="current-password" required>
            </div>
            <div class="login-error" id="loginError"></div>
            <button type="submit" class="btn-login" id="loginBtn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
              <span>Entrar</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  `;

  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("loginEmail").value.trim();
    const password = $("loginPass").value;
    const btn = $("loginBtn");
    const errEl = $("loginError");
    btn.disabled = true;
    btn.querySelector("span").textContent = "Entrando...";
    errEl.classList.remove("show");
    try {
      await doLogin(email, password);
      await loadEvents();
      subscribeToEvents();
      renderEvents();
    } catch (err) {
      errEl.textContent = err.message === "Invalid login credentials" ? "Email ou senha inválidos." : "Erro: " + err.message;
      errEl.classList.add("show");
      btn.disabled = false;
      btn.querySelector("span").textContent = "Entrar";
    }
  });
}

// =============================================================
// RENDER · EVENTS LIST
// =============================================================
function renderEvents() {
  state.view = "events";
  const admin = isAdmin();
  const userName = admin ? "Brunno Falcão" : "Coordenação";
  const userRole = admin ? "Admin" : "Operadora";
  const userInitials = admin ? "BF" : "CR";

  const visible = admin ? state.events : state.events.filter(e => e.status === "ativo" || e.status === "encerrado");
  const ativo = visible.filter(e => e.status === "ativo");
  const embreve = visible.filter(e => e.status === "embreve");
  const encerrado = visible.filter(e => e.status === "encerrado");

  function card(e) {
    const db = fmtDateBlock(e.event_date);
    const pct = e.total_inscritos ? Math.round((e.total_checkins / e.total_inscritos) * 100) : 0;
    const showStats = (e.total_inscritos || 0) > 0;
    return `
      <div class="event-card ${e.status === 'ativo' ? 'active-event' : ''} ${e.status === 'encerrado' ? 'encerrado' : ''}" data-event-id="${e.id}">
        <div class="event-body">
          <div class="event-date-block">
            <div class="event-date-month">${db.month}</div>
            <div class="event-date-day">${db.day}</div>
          </div>
          <div class="event-info">
            <div class="event-city">${esc(e.city)}${e.state ? ' – ' + esc(e.state) : ''}</div>
            <div class="event-venue">${esc(e.venue || '')}</div>
            ${showStats ? `
              <div class="event-stats">
                <div class="event-stat"><div class="event-stat-val">${e.total_inscritos}</div><div class="event-stat-label">Inscritos</div></div>
                <div class="event-stat"><div class="event-stat-val success">${e.total_checkins}</div><div class="event-stat-label">Check-in</div></div>
                <div class="event-stat"><div class="event-stat-val">${pct}%</div><div class="event-stat-label">Feito</div></div>
              </div>
              <div class="event-progress"><div class="event-progress-fill" style="width:${pct}%"></div></div>
            ` : ''}
          </div>
          <div class="event-status">
            ${e.status === 'ativo' ? '<span class="status-pill ativo">AO VIVO</span>' :
              e.status === 'embreve' ? '<span class="status-pill embreve">Em breve</span>' :
              '<span class="status-pill encerrado">Encerrado</span>'}
            ${admin ? `
              <div class="event-admin-actions">
                <button class="event-action-btn" data-edit="${e.id}" title="Editar">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
              </div>
            ` : ''}
          </div>
        </div>
        ${e.status === 'ativo' ? `
          <div class="event-cta-row">
            <span>Abrir credenciamento</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </div>
        ` : ''}
      </div>
    `;
  }

  let listHtml = '<div class="events-list">';
  if (ativo.length) {
    listHtml += '<div class="section-head"><div class="section-head-title">Acontecendo agora</div><div class="section-head-line"></div></div>';
    listHtml += ativo.map(card).join("");
  }
  if (embreve.length) {
    listHtml += '<div class="section-head"><div class="section-head-title">Próximos</div><div class="section-head-line"></div></div>';
    listHtml += embreve.map(card).join("");
  }
  if (encerrado.length) {
    listHtml += '<div class="section-head"><div class="section-head-title">Encerrados</div><div class="section-head-line"></div></div>';
    listHtml += encerrado.map(card).join("");
  }
  if (!visible.length) {
    listHtml += `
      <div class="list-empty">
        <div class="list-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
        <div class="list-empty-title">Nenhum evento</div>
        <div class="list-empty-text">${admin ? 'Toque no + para criar o primeiro evento.' : 'Nenhum evento disponível no momento.'}</div>
      </div>
    `;
  }
  listHtml += "</div>";

  $("app").innerHTML = `
    <div class="container">
      <div class="events-header">
        <div class="events-header-inner">
          <div class="eh-row1">
            <div class="eh-brand"><img class="eh-logo" src="${NB_LOGO}" alt="Nutrição Brasil"></div>
            <div class="eh-user">
              <div class="eh-user-info"><div class="eh-user-name">${esc(userName)}</div><div class="eh-user-role">${userRole}</div></div>
              <div class="eh-avatar">${userInitials}</div>
              <button class="eh-logout" id="btnLogout" title="Sair">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </button>
            </div>
          </div>
          <div class="eh-title">Eventos</div>
          <div class="eh-sub">Nutrição Brasil · 2026</div>
        </div>
      </div>
      ${listHtml}
      ${admin ? `<button class="fab" id="fabNewEvent" title="Novo evento"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg></button>` : ''}
    </div>
  `;

  $("btnLogout").addEventListener("click", () => { if (confirm("Sair do sistema?")) doLogout(); });

  document.querySelectorAll(".event-card").forEach(c => {
    c.addEventListener("click", (e) => {
      const editBtn = e.target.closest("[data-edit]");
      if (editBtn) {
        openEventEditor(state.events.find(ev => ev.id === editBtn.dataset.edit));
        return;
      }
      const id = c.dataset.eventId;
      const ev = state.events.find(x => x.id === id);
      if (ev?.status === "ativo") openCheckin(ev);
      else if (ev?.status === "encerrado" && admin) openCheckin(ev);
      else if (ev?.status === "embreve" && admin) openEventEditor(ev);
    });
  });

  if (admin) $("fabNewEvent").addEventListener("click", () => openEventEditor(null));
}

// =============================================================
// EVENT EDITOR MODAL (admin)
// =============================================================
function openEventEditor(existing) {
  const isNew = !existing;
  const e = existing || {
    name: "", city: "", state: "", venue: "",
    event_date: "", event_end_date: "", event_time: "09:00",
    status: "embreve",
    whatsapp_template_name: "checkin_nutricao_brasil",
    whatsapp_program_url: "", whatsapp_photos_url: ""
  };

  openModal(`
    <div class="modal">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <div class="modal-title">${isNew ? 'Novo evento' : 'Editar evento'}</div>
        <button class="modal-close" data-close>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="form-row"><div class="field-label">Cidade *</div><input type="text" class="field-input" id="evCity" placeholder="Ex: Recife" value="${esc(e.city)}"></div>
        <div class="form-row-split">
          <div><div class="field-label">UF</div><input type="text" class="field-input" id="evState" placeholder="PE" maxlength="2" value="${esc(e.state || '')}"></div>
          <div><div class="field-label">Data início *</div><input type="date" class="field-input" id="evDate" value="${esc(e.event_date || '')}"></div>
        </div>
        <div class="form-row-split">
          <div><div class="field-label">Data fim (opcional)</div><input type="date" class="field-input" id="evEndDate" value="${esc(e.event_end_date || '')}"></div>
          <div><div class="field-label">Horário</div><input type="time" class="field-input" id="evTime" value="${esc(e.event_time || '09:00')}"></div>
        </div>
        <div class="form-row"><div class="field-label">Local</div><input type="text" class="field-input" id="evVenue" placeholder="Ex: Hotel Mar Hotel" value="${esc(e.venue || '')}"></div>
        <div class="form-row">
          <div class="field-label">Status</div>
          <div class="select-status" id="evStatus">
            <button type="button" class="status-option embreve ${e.status === 'embreve' ? 'selected' : ''}" data-status="embreve">Em breve</button>
            <button type="button" class="status-option ativo ${e.status === 'ativo' ? 'selected' : ''}" data-status="ativo">Ativo</button>
            <button type="button" class="status-option encerrado ${e.status === 'encerrado' ? 'selected' : ''}" data-status="encerrado">Encerrado</button>
          </div>
        </div>
        <div class="form-row"><div class="field-label">Template WhatsApp · nome aprovado no Meta</div><input type="text" class="field-input" id="evTemplate" placeholder="checkin_nutricao_brasil" value="${esc(e.whatsapp_template_name || '')}"></div>
        <div class="form-row"><div class="field-label">Link Programação (vai no WhatsApp)</div><input type="text" class="field-input" id="evProgramUrl" placeholder="https://..." value="${esc(e.whatsapp_program_url || '')}"></div>
        <div class="form-row"><div class="field-label">Link Fotos do Evento (vai no WhatsApp)</div><input type="text" class="field-input" id="evPhotosUrl" placeholder="https://..." value="${esc(e.whatsapp_photos_url || '')}"></div>
        <div class="btn-row">
          ${!isNew ? '<button class="btn-modal danger" id="btnDeleteEvent" type="button">Excluir</button>' : ''}
          <button class="btn-modal ghost" data-close type="button">Cancelar</button>
          <button class="btn-modal primary" id="btnSaveEvent" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            ${isNew ? 'Criar evento' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  `);

  let selectedStatus = e.status;
  document.querySelectorAll("#evStatus .status-option").forEach(opt => {
    opt.addEventListener("click", () => {
      document.querySelectorAll("#evStatus .status-option").forEach(o => o.classList.remove("selected"));
      opt.classList.add("selected");
      selectedStatus = opt.dataset.status;
    });
  });

  $("btnSaveEvent").addEventListener("click", async () => {
    const city = $("evCity").value.trim();
    const evDate = $("evDate").value;
    if (!city || !evDate) { toast("Preencha cidade e data", "error"); return; }
    const slug = existing?.slug || (norm(city).replace(/[^a-z0-9]+/g, "-") + "-" + evDate.slice(0, 4));
    const payload = {
      slug,
      name: existing?.name || `Nutrição Brasil – ${city}`,
      city,
      state: $("evState").value.trim().toUpperCase() || null,
      venue: $("evVenue").value.trim() || null,
      event_date: evDate,
      event_end_date: $("evEndDate").value || null,
      event_time: $("evTime").value || "09:00",
      status: selectedStatus,
      whatsapp_template_name: $("evTemplate").value.trim() || null,
      whatsapp_program_url: $("evProgramUrl").value.trim() || null,
      whatsapp_photos_url: $("evPhotosUrl").value.trim() || null
    };
    try {
      if (isNew) { await createEvent(payload); toast("Evento criado"); }
      else { await updateEvent(existing.id, payload); toast("Evento atualizado"); }
      closeModal();
      renderEvents();
    } catch (err) { toast("Erro: " + err.message, "error"); }
  });

  if (!isNew) {
    $("btnDeleteEvent").addEventListener("click", async () => {
      if (!confirm(`Excluir o evento "${existing.city}"? Isto vai apagar TODOS os participantes deste evento. Não pode ser desfeito.`)) return;
      try { await deleteEvent(existing.id); toast("Evento excluído"); closeModal(); renderEvents(); }
      catch (err) { toast("Erro: " + err.message, "error"); }
    });
  }
}

// =============================================================
// CHECKIN SCREEN
// =============================================================
async function openCheckin(event) {
  state.currentEvent = event;
  state.view = "checkin";
  state.filter = "all";
  state.search = "";
  await loadParticipants(event.id);
  subscribeToParticipants(event.id);
  renderCheckinScreen();
}

function renderCheckinScreen() {
  const e = state.currentEvent;
  const d = new Date(e.event_date + "T00:00:00");
  const dateDisplay = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  $("app").innerHTML = `
    <div class="container">
      <div class="checkin-header">
        <div class="checkin-header-inner">
          <div class="ch-title-row">
            <button class="ch-brand-back" id="btnBack">
              <div class="ch-back-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></div>
              <div class="ch-event-info">
                <div class="ch-event-name">${esc(e.city)}</div>
                <div class="ch-event-date">${dateDisplay}</div>
              </div>
            </button>
            <div class="ch-header-actions">
              <button class="ch-icon-btn accent" id="btnDashboard" title="Dashboard"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></button>
              ${isAdmin() ? `<button class="ch-icon-btn" id="btnSettings" title="Mais"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg></button>` : ''}
            </div>
          </div>
          <div class="search-wrap">
            <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input type="text" class="search-input" id="searchInput" placeholder="Buscar por nome ou código…" autocomplete="off" autocapitalize="off" autocorrect="off" value="${esc(state.search)}">
            <button class="search-clear ${state.search ? 'show' : ''}" id="searchClear" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg></button>
          </div>
        </div>
        <div class="stats">
          <div class="stat"><div class="stat-label">Total</div><div class="stat-value" id="statTotal">0</div></div>
          <div class="stat success"><div class="stat-label">Check-in</div><div class="stat-value" id="statChecked">0</div></div>
          <div class="stat violet"><div class="stat-label">Pendente</div><div class="stat-value" id="statPending">0</div></div>
        </div>
        <div class="progress-track"><div class="progress-fill" id="progressFill"></div></div>
        <div class="filters" id="filters">
          <button class="filter active" data-filter="all">Todos <span class="filter-count" id="cAll">0</span></button>
          <button class="filter" data-filter="pending">Pendentes <span class="filter-count" id="cPending">0</span></button>
          <button class="filter" data-filter="checked">Já fizeram <span class="filter-count" id="cChecked">0</span></button>
        </div>
      </div>
      <div class="list" id="list"></div>
      <div class="bottom-bar">
        <div class="bottom-bar-inner">
          ${isAdmin()
            ? `<button class="btn-primary" id="btnImport"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg><span>Importar lista</span></button>`
            : `<button class="btn-primary" id="btnDashboard2"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg><span>Dashboard</span></button>`
          }
          <button class="btn-secondary" id="btnExport" title="Exportar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
        </div>
      </div>
    </div>
  `;

  $("btnBack").addEventListener("click", () => {
    unsubscribeRealtime();
    subscribeToEvents();
    state.currentEvent = null;
    state.participants = [];
    renderEvents();
  });
  $("btnDashboard").addEventListener("click", openDashboard);
  if ($("btnDashboard2")) $("btnDashboard2").addEventListener("click", openDashboard);
  if ($("btnImport")) $("btnImport").addEventListener("click", openImport);
  if ($("btnSettings")) $("btnSettings").addEventListener("click", openSettings);
  $("btnExport").addEventListener("click", exportCSV);

  const si = $("searchInput");
  si.addEventListener("input", (ev) => {
    state.search = ev.target.value;
    $("searchClear").classList.toggle("show", !!ev.target.value);
    renderCheckinList();
  });
  $("searchClear").addEventListener("click", () => {
    si.value = "";
    state.search = "";
    $("searchClear").classList.remove("show");
    renderCheckinList();
    si.focus();
  });
  $("filters").addEventListener("click", (ev) => {
    const f = ev.target.closest(".filter");
    if (!f) return;
    state.filter = f.dataset.filter;
    haptic("light");
    renderCheckinList();
  });

  initSwipe();
  renderCheckinList();
}

function renderCheckinList() {
  const total = state.participants.length;
  const checked = state.participants.filter(p => p.checked).length;
  const pending = total - checked;
  $("statTotal").textContent = total;
  $("statChecked").textContent = checked;
  $("statPending").textContent = pending;
  $("cAll").textContent = total;
  $("cChecked").textContent = checked;
  $("cPending").textContent = pending;
  $("progressFill").style.width = total ? (checked / total * 100) + "%" : "0%";
  document.querySelectorAll(".filter").forEach(f => f.classList.toggle("active", f.dataset.filter === state.filter));

  const q = norm(state.search);
  let arr = state.participants;
  if (state.filter === "pending") arr = arr.filter(p => !p.checked);
  else if (state.filter === "checked") arr = arr.filter(p => p.checked);
  if (q) {
    arr = arr.filter(p => norm(p.name).includes(q) || norm(p.code || "").includes(q) || norm(p.lote || "").includes(q) || norm(p.email || "").includes(q));
  }
  arr = arr.slice().sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1;
    if (a.checked && b.checked) return new Date(b.checked_at) - new Date(a.checked_at);
    return a.name.localeCompare(b.name, "pt-BR");
  });

  const list = $("list");
  if (total === 0) {
    list.innerHTML = `
      <div class="list-empty">
        <div class="list-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div>
        <div class="list-empty-title">Lista vazia</div>
        <div class="list-empty-text">${isAdmin() ? 'Importe a lista de inscritos pra começar.' : 'Aguardando o admin importar a lista.'}</div>
      </div>
    `;
    return;
  }
  if (arr.length === 0) {
    list.innerHTML = `
      <div class="list-empty">
        <div class="list-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></div>
        <div class="list-empty-title">Nada encontrado</div>
        <div class="list-empty-text">${state.search ? 'Tente outro nome ou código.' : 'Nenhum participante neste filtro.'}</div>
      </div>
    `;
    return;
  }

  list.innerHTML = arr.map((p, i) => `
    <div class="row ${p.checked ? 'checked' : ''}" data-id="${p.id}" style="animation-delay:${Math.min(i * 15, 200)}ms">
      <div class="row-action" data-action="toggle">
        <div class="row-action-inner">
          ${p.checked
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg><span>Desfazer</span>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span>Check-in</span>'}
        </div>
      </div>
      <div class="row-content">
        <div class="row-main">
          <div class="row-name">${esc(p.name)}</div>
          ${p.lote ? `<div class="row-meta"><span class="lot-tag">${esc(p.lote)}</span></div>` : ''}
          <div class="row-code">${esc(p.code || "")}${p.checked ? ` · ${fmtTime(p.checked_at)}` : ''}</div>
        </div>
        <div class="row-status"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
      </div>
    </div>
  `).join("");
}

// =============================================================
// SWIPE
// =============================================================
let swipeState = null;
function initSwipe() {
  const list = $("list");
  if (!list) return;
  list.addEventListener("touchstart", onSwipeStart, { passive: true });
  list.addEventListener("touchmove", onSwipeMove, { passive: false });
  list.addEventListener("touchend", onSwipeEnd);
  list.addEventListener("touchcancel", onSwipeEnd);
  list.addEventListener("click", onListClick);
}
function onSwipeStart(e) {
  const row = e.target.closest(".row");
  if (!row) return;
  const t = e.touches[0];
  swipeState = { row, startX: t.clientX, startY: t.clientY, dx: 0, locked: null, wasSwiped: row.classList.contains("swiped") };
}
function onSwipeMove(e) {
  if (!swipeState) return;
  const t = e.touches[0];
  const dx = t.clientX - swipeState.startX;
  const dy = t.clientY - swipeState.startY;
  if (swipeState.locked === null) {
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) swipeState.locked = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
  }
  if (swipeState.locked !== "x") return;
  e.preventDefault();
  swipeState.row.classList.add("dragging");
  let offset = dx;
  if (swipeState.wasSwiped) offset = dx - 118;
  offset = Math.max(-170, Math.min(20, offset));
  swipeState.row.querySelector(".row-content").style.transform = `translateX(${offset}px)`;
  swipeState.dx = dx;
}
function onSwipeEnd() {
  if (!swipeState) return;
  const { row, dx, locked, wasSwiped } = swipeState;
  row.classList.remove("dragging");
  row.querySelector(".row-content").style.transform = "";
  if (locked === "x") {
    if (wasSwiped) {
      if (dx > 40) row.classList.remove("swiped"); else row.classList.add("swiped");
    } else {
      if (dx < -80) {
        document.querySelectorAll(".row.swiped").forEach(r => { if (r !== row) r.classList.remove("swiped"); });
        if (dx < -180) { row.classList.remove("swiped"); toggleCheckIn(row.dataset.id); }
        else row.classList.add("swiped");
      }
    }
  }
  swipeState = null;
}
function onListClick(e) {
  const action = e.target.closest(".row-action");
  if (action) {
    const row = action.closest(".row");
    if (row) { row.classList.remove("swiped"); toggleCheckIn(row.dataset.id); }
    return;
  }
  const swipedRow = e.target.closest(".row.swiped");
  if (swipedRow) swipedRow.classList.remove("swiped");
}

// =============================================================
// DASHBOARD
// =============================================================
function openDashboard() {
  const e = state.currentEvent;
  const total = state.participants.length;
  const checked = state.participants.filter(p => p.checked).length;
  const pending = total - checked;
  const pct = total ? Math.round(checked / total * 100) : 0;

  const checkedRows = state.participants.filter(p => p.checked).sort((a, b) => new Date(b.checked_at) - new Date(a.checked_at));
  const lastTime = checkedRows[0]?.checked_at;
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const lastHourCount = checkedRows.filter(p => new Date(p.checked_at).getTime() >= hourAgo).length;

  let avgGap = "—";
  if (checkedRows.length >= 2) {
    const times = checkedRows.map(p => new Date(p.checked_at).getTime()).sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
    const avgMs = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const avgMin = avgMs / 60000;
    avgGap = avgMin < 1 ? Math.round(avgMs / 1000) + "s" : avgMin.toFixed(1) + "min";
  }

  const byLote = {};
  state.participants.forEach(p => {
    const k = p.lote || "Sem categoria";
    if (!byLote[k]) byLote[k] = { total: 0, checked: 0 };
    byLote[k].total++;
    if (p.checked) byLote[k].checked++;
  });
  const bdHtml = Object.entries(byLote).sort((a, b) => b[1].total - a[1].total).map(([name, d]) => {
    const p = d.total ? Math.round(d.checked / d.total * 100) : 0;
    return `<div class="bd-row"><div class="bd-row-head"><div class="bd-name">${esc(name)}</div><div class="bd-count"><strong>${d.checked}</strong> / ${d.total} · ${p}%</div></div><div class="bd-bar"><div class="bd-bar-fill" style="width:${p}%"></div></div></div>`;
  }).join("");

  const recent = checkedRows.slice(0, 6);
  const actHtml = recent.length
    ? recent.map(p => `<div class="act-row"><div class="act-avatar">${initials(p.name)}</div><div class="act-info"><div class="act-name">${esc(p.name)}</div><div class="act-meta">${esc(p.lote || "")}</div></div><div class="act-time">${fmtTime(p.checked_at)}</div></div>`).join("")
    : '<div style="text-align:center; color:var(--ink-mute); font-size:13px; padding:14px 0;">Nenhum check-in ainda</div>';

  const circ = 2 * Math.PI * 52;
  const offset = circ - (pct / 100) * circ;

  openModal(`
    <div class="modal">
      <div class="modal-handle"></div>
      <div class="modal-header"><div class="modal-title">Dashboard ao vivo</div><button class="modal-close" data-close><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button></div>
      <div class="modal-body">
        <div class="dash-hero">
          <div class="dash-hero-content">
            <div class="dash-event-label">Evento</div>
            <div class="dash-event-name">${esc(e.name)}</div>
            <div class="dash-circle-wrap">
              <div class="dash-circle">
                <svg viewBox="0 0 120 120">
                  <defs><linearGradient id="purpleGradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#A78BFA"/><stop offset="100%" stop-color="#22D3EE"/></linearGradient></defs>
                  <circle class="dash-circle-bg" cx="60" cy="60" r="52"/>
                  <circle class="dash-circle-fill" cx="60" cy="60" r="52" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"/>
                </svg>
                <div class="dash-circle-text"><div class="dash-circle-pct">${pct}%</div><div class="dash-circle-label">Realizado</div></div>
              </div>
              <div class="dash-numbers">
                <div class="dash-number-row"><div class="dash-number-label">Inscritos</div><div class="dash-number-val">${total}</div></div>
                <div class="dash-number-row"><div class="dash-number-label">Presentes</div><div class="dash-number-val success">${checked}</div></div>
                <div class="dash-number-row"><div class="dash-number-label">Faltam</div><div class="dash-number-val mute">${pending}</div></div>
              </div>
            </div>
          </div>
        </div>
        <div class="dash-section">
          <div class="dash-section-title"><div class="dash-section-title-text">Ritmo</div><div class="dash-live-dot">AO VIVO</div></div>
          <div class="speed-row"><div class="speed-label">Último check-in</div><div class="speed-value violet">${lastTime ? fmtTime(lastTime) + ' · ' + fmtRelative(lastTime) : '—'}</div></div>
          <div class="speed-row"><div class="speed-label">Check-ins na última hora</div><div class="speed-value">${lastHourCount}</div></div>
          <div class="speed-row"><div class="speed-label">Tempo médio entre check-ins</div><div class="speed-value">${avgGap}</div></div>
        </div>
        ${Object.keys(byLote).length > 0 ? `<div class="dash-section"><div class="dash-section-title"><div class="dash-section-title-text">Presença por lote</div></div>${bdHtml}</div>` : ''}
        <div class="dash-section"><div class="dash-section-title"><div class="dash-section-title-text">Últimos check-ins</div></div>${actHtml}</div>
      </div>
    </div>
  `);
}

// =============================================================
// IMPORT
// =============================================================
function openImport() {
  let fileContent = null;
  openModal(`
    <div class="modal">
      <div class="modal-handle"></div>
      <div class="modal-header"><div class="modal-title">Importar lista</div><button class="modal-close" data-close><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button></div>
      <div class="modal-body">
        <div class="form-row">
          <div class="import-tabs">
            <button class="import-tab active" data-tab="paste">Colar texto</button>
            <button class="import-tab" data-tab="file">Arquivo CSV</button>
          </div>
          <div class="import-panel active" data-panel="paste">
            <textarea class="template-area" id="pasteArea" placeholder="Cole aqui — um participante por linha.&#10;&#10;Formatos aceitos:&#10;Nome Completo&#10;Nome, Lote, Código, Email, Telefone&#10;&#10;Ou cole com cabeçalho:&#10;nome;email;telefone;lote&#10;João Silva;joao@email.com;11999999999;Pré-Venda"></textarea>
            <div class="template-hint"><strong>Para WhatsApp funcionar:</strong> a lista precisa ter coluna <code>telefone</code> com DDD. Aceita: 11999999999, (11) 99999-9999, +5511999999999.</div>
          </div>
          <div class="import-panel" data-panel="file">
            <label class="file-drop" id="fileDrop">
              <svg class="file-drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <div class="file-drop-title" id="fileTitle">Toque para escolher</div>
              <div class="file-drop-text" id="fileText">CSV da Hotmart, Sympla ou Excel</div>
              <input type="file" id="fileInput" accept=".csv,.txt,text/csv,text/plain">
            </label>
          </div>
        </div>
        <div class="btn-row">
          <button class="btn-modal ghost" data-close>Cancelar</button>
          <button class="btn-modal primary" id="btnImportConfirm"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Importar</button>
        </div>
      </div>
    </div>
  `);

  document.querySelectorAll(".import-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".import-tab").forEach(t => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".import-panel").forEach(p => p.classList.toggle("active", p.dataset.panel === tab.dataset.tab));
    });
  });
  $("fileInput").addEventListener("change", (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (e) => { fileContent = e.target.result; $("fileTitle").textContent = f.name; $("fileText").textContent = "Pronto para importar"; };
    reader.readAsText(f, "UTF-8");
  });
  $("btnImportConfirm").addEventListener("click", async () => {
    const activeTab = document.querySelector(".import-tab.active").dataset.tab;
    const text = activeTab === "paste" ? $("pasteArea").value : (fileContent || "");
    if (!text.trim()) { toast("Cole uma lista ou escolha um arquivo", "error"); return; }
    const rows = parseImport(text);
    if (!rows.length) { toast("Não consegui ler nenhum participante", "error"); return; }
    try {
      await importParticipants(state.currentEvent.id, rows);
      toast(`${rows.length} participantes importados`);
      closeModal();
      await loadParticipants(state.currentEvent.id);
      renderCheckinList();
    } catch (err) { toast("Erro: " + err.message, "error"); }
  });
}

// =============================================================
// SETTINGS (admin only)
// =============================================================
function openSettings() {
  openModal(`
    <div class="modal">
      <div class="modal-handle"></div>
      <div class="modal-header"><div class="modal-title">Mais ações</div><button class="modal-close" data-close><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button></div>
      <div class="modal-body">
        <div style="display:flex; flex-direction:column; gap:8px;">
          <button class="btn-modal ghost" id="btnAddOne"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>Adicionar manualmente</button>
          <button class="btn-modal ghost" id="btnEditEvent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Editar dados do evento</button>
          <button class="btn-modal ghost" id="btnResetCheckins"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>Resetar check-ins</button>
        </div>
      </div>
    </div>
  `);
  $("btnAddOne").addEventListener("click", () => { closeModal(); setTimeout(() => openAddOne(), 250); });
  $("btnEditEvent").addEventListener("click", () => { closeModal(); setTimeout(() => openEventEditor(state.currentEvent), 250); });
  $("btnResetCheckins").addEventListener("click", async () => {
    if (!confirm("Resetar TODOS os check-ins deste evento? A lista de inscritos será mantida.")) return;
    const ids = state.participants.filter(p => p.checked).map(p => p.id);
    if (!ids.length) { toast("Nada para resetar"); closeModal(); return; }
    const { error } = await sb.from("participants").update({ checked: false, checked_at: null, checked_by: null, whatsapp_sent: false }).in("id", ids);
    if (error) { toast("Erro: " + error.message, "error"); return; }
    toast("Check-ins resetados");
    closeModal();
    await loadParticipants(state.currentEvent.id);
    renderCheckinList();
  });
}

function openAddOne() {
  openModal(`
    <div class="modal">
      <div class="modal-handle"></div>
      <div class="modal-header"><div class="modal-title">Adicionar participante</div><button class="modal-close" data-close><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button></div>
      <div class="modal-body">
        <div class="form-row"><div class="field-label">Nome *</div><input type="text" class="field-input" id="addName" placeholder="Nome completo"></div>
        <div class="form-row"><div class="field-label">Telefone (com DDD)</div><input type="tel" class="field-input" id="addPhone" placeholder="11999999999"></div>
        <div class="form-row"><div class="field-label">Email</div><input type="email" class="field-input" id="addEmail" placeholder="email@exemplo.com"></div>
        <div class="form-row"><div class="field-label">Lote / Categoria</div><input type="text" class="field-input" id="addLote" placeholder="Ex: Pré-Venda"></div>
        <div class="btn-row">
          <button class="btn-modal ghost" data-close>Cancelar</button>
          <button class="btn-modal primary" id="btnSaveAdd">Adicionar</button>
        </div>
      </div>
    </div>
  `);
  $("btnSaveAdd").addEventListener("click", async () => {
    const name = $("addName").value.trim();
    if (!name) { toast("Nome é obrigatório", "error"); return; }
    try {
      await importParticipants(state.currentEvent.id, [{
        name, phone: $("addPhone").value.trim(), email: $("addEmail").value.trim(),
        lote: $("addLote").value.trim(), code: generateCode()
      }]);
      toast(`${name.split(" ")[0]} adicionado`);
      closeModal();
      await loadParticipants(state.currentEvent.id);
      renderCheckinList();
    } catch (err) { toast("Erro: " + err.message, "error"); }
  });
}

// =============================================================
// EXPORT
// =============================================================
function exportCSV() {
  if (!state.participants.length) { toast("Lista vazia.", "error"); return; }
  const rows = [["Nome", "Email", "Telefone", "Lote", "Codigo", "Status", "Hora Check-in", "WhatsApp"]];
  state.participants.forEach(p => {
    rows.push([
      p.name, p.email || "", p.phone || "", p.lote || "", p.code || "",
      p.checked ? "Presente" : "Ausente",
      p.checked ? new Date(p.checked_at).toLocaleString("pt-BR") : "",
      p.whatsapp_sent ? "Enviado" : (p.whatsapp_error ? "Erro" : "—")
    ]);
  });
  const csv = rows.map(r => r.map(c => {
    const s = (c || "").toString();
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(";")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const slug = state.currentEvent.slug || "checkin";
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${slug}_${date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast("Resultado exportado");
}

// =============================================================
// INIT
// =============================================================
async function init() {
  if (SUPABASE_URL.includes("COLE_AQUI") || SUPABASE_ANON_KEY.includes("COLE_AQUI")) {
    $("app").innerHTML = `
      <div style="padding:40px 24px; text-align:center; min-height:100vh; display:flex; flex-direction:column; justify-content:center; align-items:center; max-width:480px; margin:0 auto;">
        <img src="${NB_LOGO}" style="height:34px; margin-bottom:24px; opacity:0.6;">
        <div style="font-family:'Bricolage Grotesque',serif; font-size:24px; font-weight:700; margin-bottom:12px; letter-spacing:-0.025em;">Configuração necessária</div>
        <div style="color:var(--ink-soft); font-size:14px; line-height:1.6; margin-bottom:20px;">
          O arquivo <code style="background:var(--surface); padding:2px 8px; border-radius:6px; font-family:monospace;">config.js</code> precisa ser preenchido com as credenciais do Supabase.
        </div>
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:16px; text-align:left; font-size:13px; color:var(--ink-soft); width:100%;">
          Edite <code>app/config.js</code>:<br>
          <code style="display:block; margin-top:8px; padding:8px; background:var(--bg); border-radius:6px; font-family:monospace; font-size:12px;">SUPABASE_URL = "https://xxx.supabase.co"<br>SUPABASE_ANON_KEY = "eyJ..."</code>
        </div>
      </div>
    `;
    return;
  }

  try {
    const hasSession = await loadSession();
    if (hasSession) {
      await loadEvents();
      subscribeToEvents();
      renderEvents();
    } else {
      renderLogin();
    }
  } catch (err) {
    console.error("Init error", err);
    renderLogin();
  }
}

init();
