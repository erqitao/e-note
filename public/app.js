const state = {
  mode: "login",
  user: null,
  notes: [],
  activeId: null,
  saveTimer: null,
  sortBy: localStorage.getItem("noteSortBy") || "updatedAt",
  dirty: false
};

const $ = (selector) => document.querySelector(selector);

const els = {
  authView: $("#authView"),
  noteView: $("#noteView"),
  authForm: $("#authForm"),
  authError: $("#authError"),
  authSubmit: $("#authSubmit"),
  emailInput: $("#emailInput"),
  passwordInput: $("#passwordInput"),
  nameInput: $("#nameInput"),
  nameField: $("#nameField"),
  tabs: document.querySelectorAll(".tab"),
  userName: $("#userName"),
  userEmail: $("#userEmail"),
  logoutBtn: $("#logoutBtn"),
  newNoteBtn: $("#newNoteBtn"),
  emptyNewNoteBtn: $("#emptyNewNoteBtn"),
  notesList: $("#notesList"),
  searchInput: $("#searchInput"),
  sortTabs: document.querySelectorAll(".sort-tab"),
  titleInput: $("#titleInput"),
  contentInput: $("#contentInput"),
  saveState: $("#saveState"),
  deleteNoteBtn: $("#deleteNoteBtn"),
  emptyState: $("#emptyState")
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "请求失败。");
  }
  return data;
}

function setAuthMode(mode) {
  state.mode = mode;
  els.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  els.nameField.hidden = mode !== "register";
  els.authSubmit.textContent = mode === "login" ? "登录" : "注册";
  els.passwordInput.autocomplete = mode === "login" ? "current-password" : "new-password";
  els.authError.textContent = "";
}

function showAuth() {
  els.authView.hidden = false;
  els.noteView.hidden = true;
  els.emailInput.focus();
}

function showApp() {
  els.authView.hidden = true;
  els.noteView.hidden = false;
  els.userName.textContent = state.user.name;
  els.userEmail.textContent = state.user.email;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function activeNote() {
  return state.notes.find((note) => note.id === state.activeId) || null;
}

function excerpt(note) {
  const text = note.content.trim().replace(/\s+/g, " ");
  return text || "空白笔记";
}

function sortNotes(notes) {
  return [...notes].sort((a, b) => {
    const primary = new Date(b[state.sortBy]) - new Date(a[state.sortBy]);
    if (primary !== 0) return primary;
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
}

function visibleNotes() {
  const keyword = els.searchInput.value.trim().toLowerCase();
  return sortNotes(state.notes.filter((note) => {
    const haystack = `${note.title} ${note.content}`.toLowerCase();
    return haystack.includes(keyword);
  }));
}

function renderSortTabs() {
  els.sortTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.sort === state.sortBy);
    tab.setAttribute("aria-selected", String(tab.dataset.sort === state.sortBy));
  });
}

function renderNotes() {
  const keyword = els.searchInput.value.trim().toLowerCase();
  const notes = visibleNotes();

  els.notesList.innerHTML = "";
  if (!notes.length) {
    const empty = document.createElement("p");
    empty.className = "note-item";
    empty.textContent = keyword ? "没有匹配的笔记" : "还没有笔记";
    els.notesList.append(empty);
    return;
  }

  for (const note of notes) {
    const button = document.createElement("button");
    button.className = `note-item${note.id === state.activeId ? " active" : ""}`;
    button.type = "button";
    button.dataset.id = note.id;
    button.innerHTML = `
      <strong></strong>
      <span></span>
      <span></span>
    `;
    button.children[0].textContent = note.title || "未命名笔记";
    button.children[1].textContent = excerpt(note);
    button.children[2].textContent = formatDate(note[state.sortBy]);
    button.addEventListener("click", () => selectNote(note.id));
    els.notesList.append(button);
  }
}

function renderEditor() {
  const note = activeNote();
  const hasNote = Boolean(note);
  els.emptyState.hidden = hasNote;
  els.titleInput.disabled = !hasNote;
  els.contentInput.disabled = !hasNote;
  els.deleteNoteBtn.disabled = !hasNote;

  if (!note) {
    els.titleInput.value = "";
    els.contentInput.value = "";
    els.saveState.textContent = "";
    return;
  }

  els.titleInput.value = note.title;
  els.contentInput.value = note.content;
  els.saveState.textContent = state.dirty ? "未保存" : "已保存";
}

function render() {
  renderSortTabs();
  renderNotes();
  renderEditor();
}

async function loadNotes() {
  const data = await api("/api/notes");
  state.notes = data.notes;
  state.activeId = visibleNotes()[0]?.id || null;
  state.dirty = false;
  render();
}

function selectNote(id) {
  if (state.dirty) {
    saveActiveNote();
  }
  state.activeId = id;
  state.dirty = false;
  render();
}

async function createNote() {
  const data = await api("/api/notes", {
    method: "POST",
    body: JSON.stringify({ title: "未命名笔记", content: "" })
  });
  state.notes = [data.note, ...state.notes];
  state.activeId = data.note.id;
  state.dirty = false;
  render();
  els.titleInput.focus();
  els.titleInput.select();
}

function scheduleSave() {
  const note = activeNote();
  if (!note) return;
  note.title = els.titleInput.value || "未命名笔记";
  note.content = els.contentInput.value;
  note.updatedAt = new Date().toISOString();
  state.dirty = true;
  els.saveState.textContent = "保存中";
  renderNotes();
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(saveActiveNote, 650);
}

async function saveActiveNote() {
  const note = activeNote();
  if (!note) return;
  clearTimeout(state.saveTimer);
  els.saveState.textContent = "保存中";
  try {
    const data = await api(`/api/notes/${note.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: note.title, content: note.content })
    });
    const index = state.notes.findIndex((item) => item.id === note.id);
    if (index >= 0) {
      state.notes[index] = data.note;
    }
    state.dirty = false;
    els.saveState.textContent = "已保存";
    renderNotes();
  } catch (error) {
    els.saveState.textContent = "保存失败";
    console.error(error);
  }
}

async function deleteActiveNote() {
  const note = activeNote();
  if (!note) return;
  const ok = window.confirm(`删除「${note.title || "未命名笔记"}」？`);
  if (!ok) return;
  await api(`/api/notes/${note.id}`, { method: "DELETE" });
  state.notes = state.notes.filter((item) => item.id !== note.id);
  state.activeId = visibleNotes()[0]?.id || null;
  state.dirty = false;
  render();
}

function setSortBy(sortBy) {
  if (!["updatedAt", "createdAt"].includes(sortBy)) return;
  state.sortBy = sortBy;
  localStorage.setItem("noteSortBy", sortBy);
  render();
}

async function submitAuth(event) {
  event.preventDefault();
  els.authError.textContent = "";
  els.authSubmit.disabled = true;
  els.authSubmit.textContent = state.mode === "login" ? "登录中" : "注册中";
  try {
    const payload = {
      email: els.emailInput.value,
      password: els.passwordInput.value,
      name: els.nameInput.value
    };
    const data = await api(`/api/auth/${state.mode}`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    state.user = data.user;
    showApp();
    await loadNotes();
    if (!state.notes.length) await createNote();
  } catch (error) {
    els.authError.textContent = error.message;
  } finally {
    els.authSubmit.disabled = false;
    els.authSubmit.textContent = state.mode === "login" ? "登录" : "注册";
  }
}

async function logout() {
  if (state.dirty) await saveActiveNote();
  await api("/api/auth/logout", { method: "POST" });
  state.user = null;
  state.notes = [];
  state.activeId = null;
  els.authForm.reset();
  showAuth();
}

async function bootstrap() {
  setAuthMode("login");
  els.tabs.forEach((tab) => tab.addEventListener("click", () => setAuthMode(tab.dataset.mode)));
  els.authForm.addEventListener("submit", submitAuth);
  els.logoutBtn.addEventListener("click", logout);
  els.newNoteBtn.addEventListener("click", createNote);
  els.emptyNewNoteBtn.addEventListener("click", createNote);
  els.searchInput.addEventListener("input", renderNotes);
  els.sortTabs.forEach((tab) => tab.addEventListener("click", () => setSortBy(tab.dataset.sort)));
  els.titleInput.addEventListener("input", scheduleSave);
  els.contentInput.addEventListener("input", scheduleSave);
  els.deleteNoteBtn.addEventListener("click", deleteActiveNote);
  window.addEventListener("pagehide", () => {
    if (state.dirty) {
      fetch(`/api/notes/${state.activeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: activeNote()?.title, content: activeNote()?.content }),
        credentials: "same-origin",
        keepalive: true
      }).catch(() => {});
    }
  });

  try {
    const data = await api("/api/me");
    if (!data.user) return showAuth();
    state.user = data.user;
    showApp();
    await loadNotes();
  } catch {
    showAuth();
  }
}

bootstrap();
