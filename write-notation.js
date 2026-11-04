(() => {
  "use strict";

  const TASKS = {
    tetrachord: {
      format: "write-tetrachord",
      storage: "write-tetrachord-maker-v1",
      pageTitle: "Write Tetrachords",
      title: "Write the Major Tetrachord",
      instructions: "Write each major tetrachord.",
      timeLimit: "5 minutes",
      file: "write-tetrachords.json",
      notesKey: "tetrachord",
      extendStaff: false,
      countLabel: "Tetrachords on the page",
    },
    scale: {
      format: "write-scale",
      storage: "write-scale-maker-v1",
      pageTitle: "Write Scales",
      title: "Write the Major Scale",
      instructions: "Write each major scale.",
      timeLimit: "7 ½ minutes",
      file: "write-scales.json",
      notesKey: "scale",
      extendStaff: true,
      countLabel: "Scales on the page",
    },
  };

  const task = TASKS[document.body.dataset.task] || TASKS.tetrachord;
  const STORAGE_KEY = task.storage;
  const BLANK_SRC = "keys/treble/staff-long.png";
  const ACCEPT = {
    types: [{ description: "Quiz file", accept: { "application/json": [".json"] } }],
  };
  const CATALOG = (window.KEY_CATALOG || []).slice().sort((a, b) => a.order - b.order);
  const ALL_IDS = CATALOG.map((k) => k.id);

  const PRESETS = {
    all: ALL_IDS.slice(),
    flats: CATALOG.filter((k) => k.side === "flat").map((k) => k.id),
    sharps: CATALOG.filter((k) => k.side === "sharp").map((k) => k.id),
    common: CATALOG.filter((k) => k.order >= 4 && k.order <= 12).map((k) => k.id),
    beginner: CATALOG.filter((k) => ["F", "C", "G", "D"].includes(k.name)).map((k) => k.id),
  };

  const state = {
    fileName: "untitled.json",
    fileHandle: null,
    dirty: false,
    previewMode: "student",
    undoItems: null,
    applyingPreset: false,
    quiz: defaultQuiz(),
  };

  const els = {
    title: document.getElementById("field-title"),
    instructions: document.getElementById("field-instructions"),
    time: document.getElementById("field-time"),
    preset: document.getElementById("field-preset"),
    count: document.getElementById("field-count"),
    pool: document.getElementById("pool-status"),
    sheet: document.getElementById("sheet"),
    fileStatus: document.getElementById("file-status"),
    fileInput: document.getElementById("file-input"),
    undo: document.getElementById("btn-undo"),
    help: document.getElementById("help-dialog"),
  };

  function defaultQuiz() {
    return {
      title: task.title,
      instructions: task.instructions,
      timeLimit: task.timeLimit,
      preset: "all",
      count: 15,
      keys: ALL_IDS.slice(),
      items: [],
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function byId(id) {
    return CATALOG.find((k) => k.id === id) || null;
  }

  function normalizeQuiz(raw) {
    const src = raw && raw.quiz ? raw.quiz : raw || {};
    const base = defaultQuiz();
    const keys = Array.isArray(src.keys) ? src.keys.filter((id) => byId(id)) : base.keys;
    const items = Array.isArray(src.items)
      ? src.items.map((item) => (typeof item === "string" ? byId(item) : byId(item && item.id))).filter(Boolean)
      : [];
    return {
      title: String(src.title ?? base.title),
      instructions: String(src.instructions ?? base.instructions),
      timeLimit: String(src.timeLimit ?? base.timeLimit),
      preset: PRESETS[src.preset] ? src.preset : "custom",
      count: clamp(parseInt(src.count, 10) || base.count, 5, 60),
      keys: keys.length ? keys : ALL_IDS.slice(),
      items,
    };
  }

  function pool() {
    const allowed = new Set(state.quiz.keys);
    return CATALOG.filter((k) => allowed.has(k.id));
  }

  function shuffle(list) {
    const next = list.slice();
    for (let i = next.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
  }

  function drawItems() {
    const source = pool();
    const count = state.quiz.count;
    if (!source.length) return [];
    if (source.length >= count) return shuffle(source).slice(0, count);
    const items = [];
    while (items.length < count) items.push(...shuffle(source));
    return items.slice(0, count);
  }

  function randomize(keepUndo) {
    if (keepUndo) state.undoItems = clone(state.quiz.items);
    else state.undoItems = null;
    state.quiz.items = drawItems();
    els.undo.disabled = !state.undoItems || !state.undoItems.length;
    renderPreview();
    markDirty();
  }

  function serialize() {
    const quiz = clone(state.quiz);
    quiz.items = state.quiz.items.map((k) => k.id);
    return JSON.stringify({ format: task.format, version: 1, quiz }, null, 2);
  }

  function markDirty() {
    state.dirty = true;
    persistScratch();
    updateStatus();
  }

  function persistScratch() {
    try {
      const quiz = clone(state.quiz);
      quiz.items = state.quiz.items.map((k) => k.id);
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          fileName: state.fileName,
          quiz,
          previewMode: state.previewMode,
        })
      );
    } catch {
      /* ignore */
    }
  }

  function updateStatus() {
    const mark = state.dirty ? "• " : "";
    els.fileStatus.textContent = `${mark}${state.fileName}`;
    document.title = `${mark}${state.fileName} — ${task.pageTitle}`;
  }

  function setQuiz(quiz, fileName, dirty, reshuffleIfEmpty) {
    state.quiz = normalizeQuiz(quiz);
    state.fileName = fileName || state.fileName;
    state.dirty = Boolean(dirty);
    state.undoItems = null;
    els.undo.disabled = true;
    if (reshuffleIfEmpty && !state.quiz.items.length) state.quiz.items = drawItems();
    syncFields();
    renderPreview();
    persistScratch();
    updateStatus();
  }

  function checkedValues(name) {
    return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((el) => el.value);
  }

  function setChecked(name, values) {
    const set = new Set(values.map(String));
    document.querySelectorAll(`input[name="${name}"]`).forEach((el) => {
      el.checked = set.has(el.value);
    });
  }

  function applyPreset(name) {
    const ids = PRESETS[name];
    if (!ids) return;
    state.applyingPreset = true;
    state.quiz.preset = name;
    state.quiz.keys = ids.slice();
    syncFields();
    state.applyingPreset = false;
    randomize(false);
  }

  function readFiltersFromUI() {
    state.quiz.title = els.title.value;
    state.quiz.instructions = els.instructions.value;
    state.quiz.timeLimit = els.time.value;
    state.quiz.count = clamp(parseInt(els.count.value, 10) || 15, 5, 60);
    els.count.value = String(state.quiz.count);
    state.quiz.keys = checkedValues("key");
    if (!state.applyingPreset) {
      const current = state.quiz.keys.slice().sort().join(",");
      const match = Object.keys(PRESETS).find(
        (presetName) => PRESETS[presetName].slice().sort().join(",") === current
      );
      state.quiz.preset = match || "custom";
      els.preset.value = state.quiz.preset;
    }
  }

  function syncFields() {
    state.applyingPreset = true;
    els.title.value = state.quiz.title;
    els.instructions.value = state.quiz.instructions;
    els.time.value = state.quiz.timeLimit;
    els.count.value = String(state.quiz.count);
    els.preset.value = PRESETS[state.quiz.preset] ? state.quiz.preset : "custom";
    setChecked("key", state.quiz.keys);
    state.applyingPreset = false;
  }

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function spellingFor(item) {
    const notes = item[task.notesKey];
    return Array.isArray(notes) ? notes.join("  ") : "";
  }

  function renderPreview() {
    const isKey = state.previewMode === "key";
    document.body.dataset.print = isKey ? "key" : "student";
    const available = pool();
    const repeats = state.quiz.items.length > available.length;
    els.pool.textContent = available.length
      ? `Pool: ${available.length} unique keys${repeats && available.length < state.quiz.count ? " · some keys will repeat" : ""}`
      : "Pool: 0 keys — turn some keys back on.";

    const title = escapeHTML(state.quiz.title || task.title);
    const keyMark = isKey ? " — KEY" : "";
    const instructions = escapeHTML(state.quiz.instructions);
    const time = state.quiz.timeLimit.trim();
    const total = state.quiz.items.length;

    const heading = `
      <div class="minute-head">
        <div>
          <div><span class="title">${title}${keyMark}.</span> ${instructions}</div>
          ${time ? `<div>You’ll have ${escapeHTML(time)}.</div>` : ""}
        </div>
        <div class="minute-meta">
          <div>Name ____________________</div>
          <div>Date ____________________</div>
          <div>Score _____ / ${total || 0}</div>
        </div>
      </div>`;

    if (!total) {
      els.sheet.innerHTML = `${heading}<p class="empty-preview">Nothing to show.</p>`;
      return;
    }

    const cols = 2;
    const rows = Math.max(1, Math.ceil(total / cols));
    const cards = state.quiz.items
      .map((item) => {
        const name = escapeHTML(item.display);
        const spelling = escapeHTML(spellingFor(item));
        return `<figure class="note-card write-card">
          <div class="prompt">${name}</div>
          <div class="staff-wrap">
            <img class="staff-full" src="${BLANK_SRC}" alt="Blank treble staff for ${name}" />
          </div>
          <figcaption class="caption">${spelling}</figcaption>
        </figure>`;
      })
      .join("");

    els.sheet.innerHTML = `${heading}<div class="note-grid write-grid" style="--write-rows: ${rows}">${cards}</div>`;
  }

  function confirmIfDirty(message) {
    if (!state.dirty) return true;
    return window.confirm(message);
  }

  function loadOpenedQuiz(data, fileName, handle) {
    if (window.routeQuizFile && !window.routeQuizFile(task.format, data, fileName)) return;
    state.fileHandle = handle || null;
    setQuiz(data, fileName, false, true);
  }

  async function openWithPicker() {
    if (window.isSecureContext && window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker(ACCEPT);
        const file = await handle.getFile();
        loadOpenedQuiz(JSON.parse(await file.text()), file.name, handle);
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    els.fileInput.click();
  }

  function downloadText(name, text) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function saveQuiz(forcePicker) {
    const text = serialize();
    if (!forcePicker && state.fileHandle && window.isSecureContext) {
      try {
        const writable = await state.fileHandle.createWritable();
        await writable.write(text);
        await writable.close();
        state.dirty = false;
        persistScratch();
        updateStatus();
        return;
      } catch {
        state.fileHandle = null;
      }
    }
    if (window.isSecureContext && window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          ...ACCEPT,
          suggestedName: state.fileName || task.file,
        });
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
        state.fileHandle = handle;
        state.fileName = handle.name || state.fileName;
        state.dirty = false;
        persistScratch();
        updateStatus();
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    downloadText(state.fileName || task.file, text);
    state.dirty = false;
    persistScratch();
    updateStatus();
  }

  function printSheet(mode) {
    const previous = state.previewMode;
    state.previewMode = mode;
    setPreviewTab(mode);
    renderPreview();
    const restore = () => {
      window.removeEventListener("afterprint", restore);
      state.previewMode = previous;
      setPreviewTab(previous);
      renderPreview();
    };
    window.addEventListener("afterprint", restore);
    window.print();
  }

  function setPreviewTab(mode) {
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.mode === mode);
    });
  }

  function bind() {
    const box = document.getElementById("keys");
    box.innerHTML = CATALOG.map(
      (k) =>
        `<label><input type="checkbox" name="key" value="${k.id}" /> ${escapeHTML(k.display)}</label>`
    ).join("");

    ["title", "instructions", "time"].forEach((key) => {
      els[key].addEventListener("input", () => {
        readFiltersFromUI();
        renderPreview();
        markDirty();
      });
    });
    els.count.addEventListener("change", () => {
      readFiltersFromUI();
      randomize(false);
    });
    els.preset.addEventListener("change", () => {
      if (els.preset.value === "custom") {
        state.quiz.preset = "custom";
        markDirty();
        return;
      }
      applyPreset(els.preset.value);
    });
    document.querySelectorAll(".option-set").forEach((set) => {
      set.addEventListener("change", () => {
        if (state.applyingPreset) return;
        readFiltersFromUI();
        randomize(false);
      });
    });

    document.getElementById("btn-new").addEventListener("click", () => {
      if (!confirmIfDirty("Start a new quiz and lose unsaved changes?")) return;
      state.fileHandle = null;
      setQuiz(defaultQuiz(), "untitled.json", false, true);
    });
    document.getElementById("btn-open").addEventListener("click", () => {
      if (!confirmIfDirty("Open a file and lose unsaved changes?")) return;
      openWithPicker();
    });
    document.getElementById("btn-save").addEventListener("click", () => saveQuiz(false));
    document.getElementById("btn-save-as").addEventListener("click", () => saveQuiz(true));
    document.getElementById("btn-randomize").addEventListener("click", () => randomize(true));
    els.undo.addEventListener("click", () => {
      if (!state.undoItems) return;
      state.quiz.items = state.undoItems;
      state.undoItems = null;
      els.undo.disabled = true;
      renderPreview();
      markDirty();
    });
    document.getElementById("btn-print").addEventListener("click", () => printSheet("student"));
    document.getElementById("btn-print-key").addEventListener("click", () => printSheet("key"));
    document.getElementById("btn-help").addEventListener("click", () => els.help.showModal());
    document.getElementById("btn-help-close").addEventListener("click", () => els.help.close());
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        state.previewMode = tab.dataset.mode;
        setPreviewTab(state.previewMode);
        renderPreview();
      });
    });
    els.fileInput.addEventListener("change", async () => {
      const file = els.fileInput.files && els.fileInput.files[0];
      els.fileInput.value = "";
      if (!file) return;
      try {
        loadOpenedQuiz(JSON.parse(await file.text()), file.name, null);
      } catch {
        window.alert("That file could not be read as a quiz JSON file.");
      }
    });
    window.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveQuiz(event.shiftKey);
      }
    });
    window.addEventListener("beforeunload", (event) => {
      if (!state.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  function boot() {
    bind();
    const pending = window.consumePendingQuiz && window.consumePendingQuiz(task.format);
    if (pending) {
      setQuiz(pending.data, pending.fileName || "untitled.json", false, true);
      return;
    }
    let restored = null;
    try {
      restored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch {
      restored = null;
    }
    if (restored && restored.quiz) {
      state.previewMode = restored.previewMode === "key" ? "key" : "student";
      setPreviewTab(state.previewMode);
      setQuiz(restored.quiz, restored.fileName || "untitled.json", true, true);
    } else {
      setQuiz(defaultQuiz(), "untitled.json", true, true);
    }
  }

  boot();
})();
