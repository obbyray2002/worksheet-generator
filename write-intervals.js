(() => {
  "use strict";

  const STORAGE_KEY = "write-interval-maker-v1";
  const FORMAT = "write-interval";
  const ACCEPT = {
    types: [{ description: "Quiz file", accept: { "application/json": [".json"] } }],
  };
  const KEYS = (window.INTERVAL_KEYS || []).slice().sort((a, b) => a.order - b.order);
  const BANK = window.INTERVAL_BANK || [];
  const ALL_IDS = KEYS.map((k) => k.id);
  const BY_ID = new Map(BANK.map((item) => [item.id, item]));

  const PRESETS = {
    all: ALL_IDS.slice(),
    flats: KEYS.filter((k) => k.side === "flat").map((k) => k.id),
    sharps: KEYS.filter((k) => k.side === "sharp").map((k) => k.id),
    common: KEYS.filter((k) => k.order >= 4 && k.order <= 12).map((k) => k.id),
    beginner: KEYS.filter((k) => ["F", "C", "G", "D"].includes(k.name)).map((k) => k.id),
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
    font: document.getElementById("field-font"),
    copies: document.getElementById("field-copies"),
    pool: document.getElementById("pool-status"),
    sheet: document.getElementById("sheet"),
    fileStatus: document.getElementById("file-status"),
    fileInput: document.getElementById("file-input"),
    undo: document.getElementById("btn-undo"),
    help: document.getElementById("help-dialog"),
  };

  function defaultQuiz() {
    return {
      title: "Intervals Above",
      instructions:
        "Write the note that is the specified interval ABOVE the given pitch. Use correct accidentals and spell your intervals correctly.",
      timeLimit: "10 minutes",
      preset: "all",
      count: 50,
      fontSize: "normal",
      copiesPerPage: 1,
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

  function byKey(id) {
    return KEYS.find((k) => k.id === id) || null;
  }

  function byItemId(id) {
    if (!id) return null;
    if (typeof id === "string") return BY_ID.get(id) || null;
    if (id.id) return BY_ID.get(id.id) || null;
    if (id.keyId && id.typeId) return BY_ID.get(`${id.keyId}|${id.typeId}`) || null;
    return null;
  }

  function normalizeQuiz(raw) {
    const src = raw && raw.quiz ? raw.quiz : raw || {};
    const base = defaultQuiz();
    const keys = Array.isArray(src.keys) ? src.keys.filter((id) => byKey(id)) : base.keys;
    const items = Array.isArray(src.items) ? src.items.map(byItemId).filter(Boolean) : [];
    const fontSize = ["normal", "large", "xlarge"].includes(src.fontSize) ? src.fontSize : "normal";
    const copies = [1, 2, 4].includes(Number(src.copiesPerPage)) ? Number(src.copiesPerPage) : 1;
    return {
      title: String(src.title ?? base.title),
      instructions: String(src.instructions ?? base.instructions),
      timeLimit: String(src.timeLimit ?? base.timeLimit),
      preset: PRESETS[src.preset] ? src.preset : "custom",
      count: clamp(parseInt(src.count, 10) || base.count, 4, 80),
      fontSize,
      copiesPerPage: copies,
      keys: keys.length ? keys : ALL_IDS.slice(),
      items,
    };
  }

  function pool() {
    const allowed = new Set(state.quiz.keys);
    return BANK.filter((item) => allowed.has(item.keyId));
  }

  function shuffle(list) {
    const next = list.slice();
    for (let i = next.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
  }

  function bucketCounts(n) {
    let majorPerfect = Math.round(n * 0.375);
    let minorDim = Math.round(n * 0.375);
    let augmented = n - majorPerfect - minorDim;
    if (augmented < 0) {
      const extra = -augmented;
      majorPerfect -= Math.ceil(extra / 2);
      minorDim -= Math.floor(extra / 2);
      augmented = 0;
    }
    return {
      majorPerfect: Math.max(0, majorPerfect),
      minorDim: Math.max(0, minorDim),
      augmented: Math.max(0, augmented),
    };
  }

  function takeFrom(list, n) {
    if (!list.length || n <= 0) return [];
    const unique = shuffle(list);
    const out = unique.slice(0, Math.min(n, unique.length));
    while (out.length < n) out.push(...shuffle(list));
    return out.slice(0, n);
  }

  function drawItems() {
    const source = pool();
    const count = state.quiz.count;
    if (!source.length) return [];
    const counts = bucketCounts(count);
    const byBucket = {
      majorPerfect: source.filter((item) => item.bucket === "majorPerfect"),
      minorDim: source.filter((item) => item.bucket === "minorDim"),
      augmented: source.filter((item) => item.bucket === "augmented"),
    };
    const picked = [
      ...takeFrom(byBucket.majorPerfect, counts.majorPerfect),
      ...takeFrom(byBucket.minorDim, counts.minorDim),
      ...takeFrom(byBucket.augmented, counts.augmented),
    ];
    return shuffle(picked).slice(0, count);
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
    quiz.items = state.quiz.items.map((item) => item.id);
    return JSON.stringify({ format: FORMAT, version: 1, quiz }, null, 2);
  }

  function markDirty() {
    state.dirty = true;
    persistScratch();
    updateStatus();
  }

  function persistScratch() {
    try {
      const quiz = clone(state.quiz);
      quiz.items = state.quiz.items.map((item) => item.id);
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
    document.title = `${mark}${state.fileName} — Write Intervals`;
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
    state.quiz.count = clamp(parseInt(els.count.value, 10) || 50, 4, 80);
    els.count.value = String(state.quiz.count);
    state.quiz.fontSize = ["normal", "large", "xlarge"].includes(els.font.value) ? els.font.value : "normal";
    state.quiz.copiesPerPage = [1, 2, 4].includes(Number(els.copies.value)) ? Number(els.copies.value) : 1;
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
    els.font.value = state.quiz.fontSize;
    els.copies.value = String(state.quiz.copiesPerPage);
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

  function mixLabel(items) {
    if (!items.length) return "";
    const n = items.length;
    const maj = items.filter((item) => item.bucket === "majorPerfect").length;
    const min = items.filter((item) => item.bucket === "minorDim").length;
    const aug = items.filter((item) => item.bucket === "augmented").length;
    const pct = (c) => Math.round((c / n) * 100);
    return `This page: ${pct(maj)}% major/perfect, ${pct(min)}% minor/diminished, ${pct(aug)}% augmented`;
  }

  function renderPreview() {
    const isKey = state.previewMode === "key";
    const copies = state.quiz.copiesPerPage;
    document.body.dataset.print = isKey ? "key" : "student";
    document.body.dataset.font = state.quiz.fontSize;
    document.body.dataset.copies = String(copies);
    const available = pool();
    const unique = new Set(state.quiz.items.map((item) => item.id)).size;
    const copyNote =
      copies === 2
        ? " · 2 copies on boxed staves (about 10 questions fill a half-sheet)"
        : copies === 4
          ? " · 4 copies on boxed staves (about 6 questions fill a quarter-sheet)"
          : "";
    els.pool.textContent = available.length
      ? `Pool: ${available.length} unique questions from ${state.quiz.keys.length} keys. ${mixLabel(state.quiz.items)}${copyNote}${
          unique < state.quiz.items.length ? " · some questions repeat" : ""
        }`
      : "Pool: 0 questions — turn some starting pitches back on.";

    const title = escapeHTML(state.quiz.title || "Intervals Above");
    const keyMark = isKey ? " — KEY" : "";
    const instructions = escapeHTML(state.quiz.instructions);
    const time = state.quiz.timeLimit.trim();
    const total = state.quiz.items.length;
    const rows = Math.max(1, Math.ceil(total / 2));

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

    els.sheet.className = `minute-sheet interval-sheet copies-${copies}`;

    if (!total) {
      els.sheet.innerHTML = `<article class="interval-copy">${heading}<p class="empty-preview">Nothing to show.</p></article>`;
      return;
    }

    const useStaff = copies > 1;
    const items = useStaff
      ? state.quiz.items
          .map((item, index) => {
            const prompt = escapeHTML(item.prompt);
            const answer = escapeHTML(item.answer);
            return `<figure class="note-card write-card">
          <div class="prompt"><span class="num">${index + 1}.</span> ${prompt}</div>
          <div class="staff-wrap">
            <img class="staff-full" src="keys/treble/Blank.png" alt="Blank treble staff for ${prompt}" />
          </div>
          <figcaption class="caption">${answer}</figcaption>
        </figure>`;
          })
          .join("")
      : state.quiz.items
          .map((item, index) => {
            const prompt = escapeHTML(item.prompt);
            const answer = escapeHTML(item.answer);
            return `<div class="interval-item">
          <span class="num">${index + 1}.</span>
          <span class="prompt">${prompt}</span>
          <span class="blank"></span>
          <span class="answer">= ${answer}</span>
        </div>`;
          })
          .join("");

    const body = useStaff
      ? `<div class="note-grid write-grid interval-grid">${items}</div>`
      : `<div class="interval-list" style="--interval-rows: ${rows}">${items}</div>`;
    const copyHTML = `${heading}${body}`;
    els.sheet.innerHTML = Array.from({ length: copies }, () => `<article class="interval-copy">${copyHTML}</article>`).join(
      ""
    );
  }

  function confirmIfDirty(message) {
    if (!state.dirty) return true;
    return window.confirm(message);
  }

  function loadOpenedQuiz(data, fileName, handle) {
    if (window.routeQuizFile && !window.routeQuizFile(FORMAT, data, fileName)) return;
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
          suggestedName: state.fileName || "write-intervals.json",
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
    downloadText(state.fileName || "write-intervals.json", text);
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
    box.innerHTML = KEYS.map(
      (k) => `<label><input type="checkbox" name="key" value="${k.id}" /> ${escapeHTML(k.display)}</label>`
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
    ["font", "copies"].forEach((key) => {
      els[key].addEventListener("change", () => {
        readFiltersFromUI();
        renderPreview();
        markDirty();
      });
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
    const pending = window.consumePendingQuiz && window.consumePendingQuiz(FORMAT);
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
