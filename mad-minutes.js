(() => {
  "use strict";

  const STORAGE_KEY = "mad-minute-maker-v1";
  const ACCEPT = {
    types: [{ description: "Quiz file", accept: { "application/json": [".json"] } }],
  };
  const CLEFS = ["treble", "bass", "alto", "tenor"];
  const ACCIDENTALS = ["natural", "sharp", "flat"];
  const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
  const CATALOG = window.NOTE_CATALOG || [];
  const OCTAVES = [...new Set(CATALOG.map((n) => n.octave))].sort((a, b) => a - b);
  const ClefLabel = { treble: "Treble", bass: "Bass", alto: "Alto", tenor: "Tenor" };
  const AccLabel = { natural: "Naturals", sharp: "Sharps", flat: "Flats" };

  const PRESETS = {
    "treble-natural": { clefs: ["treble"], accidentals: ["natural"] },
    "bass-natural": { clefs: ["bass"], accidentals: ["natural"] },
    "grand-natural": { clefs: ["treble", "bass"], accidentals: ["natural"] },
    "c-clefs-natural": { clefs: ["alto", "tenor"], accidentals: ["natural"] },
    "all-natural": { clefs: CLEFS.slice(), accidentals: ["natural"] },
    "treble-all": { clefs: ["treble"], accidentals: ACCIDENTALS.slice() },
    "all-all": { clefs: CLEFS.slice(), accidentals: ACCIDENTALS.slice() },
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
    octaveKey: document.getElementById("field-octave-key"),
    pool: document.getElementById("pool-status"),
    sheet: document.getElementById("sheet"),
    fileStatus: document.getElementById("file-status"),
    fileInput: document.getElementById("file-input"),
    undo: document.getElementById("btn-undo"),
    help: document.getElementById("help-dialog"),
  };

  function defaultQuiz() {
    return {
      title: "Mad Minute",
      instructions: "Name each note.",
      timeLimit: "1 minute",
      preset: "treble-natural",
      count: 30,
      showOctaveOnKey: false,
      clefs: ["treble"],
      accidentals: ["natural"],
      letters: LETTERS.slice(),
      octaves: OCTAVES.slice(),
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
    return CATALOG.find((n) => n.id === id) || null;
  }

  function normalizeQuiz(raw) {
    const src = raw && raw.quiz ? raw.quiz : raw || {};
    const base = defaultQuiz();
    const clefs = Array.isArray(src.clefs) ? src.clefs.filter((c) => CLEFS.includes(c)) : base.clefs;
    const accidentals = Array.isArray(src.accidentals)
      ? src.accidentals.filter((a) => ACCIDENTALS.includes(a))
      : base.accidentals;
    const letters = Array.isArray(src.letters) ? src.letters.filter((l) => LETTERS.includes(l)) : base.letters;
    const octaves = Array.isArray(src.octaves)
      ? src.octaves.map(Number).filter((o) => OCTAVES.includes(o))
      : base.octaves;
    const items = Array.isArray(src.items)
      ? src.items.map((item) => (typeof item === "string" ? byId(item) : byId(item && item.id))).filter(Boolean)
      : [];
    return {
      title: String(src.title ?? base.title),
      instructions: String(src.instructions ?? base.instructions),
      timeLimit: String(src.timeLimit ?? base.timeLimit),
      preset: PRESETS[src.preset] ? src.preset : "custom",
      count: clamp(parseInt(src.count, 10) || base.count, 6, 72),
      showOctaveOnKey: Boolean(src.showOctaveOnKey),
      clefs: clefs.length ? clefs : ["treble"],
      accidentals: accidentals.length ? accidentals : ["natural"],
      letters: letters.length ? letters : LETTERS.slice(),
      octaves: octaves.length ? octaves : OCTAVES.slice(),
      items,
    };
  }

  function pool() {
    const clefs = new Set(state.quiz.clefs);
    const accs = new Set(state.quiz.accidentals);
    const letters = new Set(state.quiz.letters);
    const octaves = new Set(state.quiz.octaves);
    return CATALOG.filter(
      (n) =>
        clefs.has(n.clef) &&
        accs.has(n.accidental) &&
        letters.has(n.letter) &&
        octaves.has(n.octave)
    );
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
    while (items.length < count) {
      items.push(...shuffle(source));
    }
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
    quiz.items = state.quiz.items.map((n) => n.id);
    return JSON.stringify({ format: "mad-minute", version: 1, quiz }, null, 2);
  }

  function markDirty() {
    state.dirty = true;
    persistScratch();
    updateStatus();
  }

  function persistScratch() {
    try {
      const quiz = clone(state.quiz);
      quiz.items = state.quiz.items.map((n) => n.id);
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
    document.title = `${mark}${state.fileName} — Mad Minutes`;
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

  function buildChecks(containerId, name, items, labels) {
    const box = document.getElementById(containerId);
    box.innerHTML = items
      .map(
        (value) =>
          `<label><input type="checkbox" name="${name}" value="${value}" /> ${labels[value] || value}</label>`
      )
      .join("");
  }

  function applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    state.applyingPreset = true;
    state.quiz.preset = name;
    state.quiz.clefs = preset.clefs.slice();
    state.quiz.accidentals = preset.accidentals.slice();
    state.quiz.letters = LETTERS.slice();
    state.quiz.octaves = OCTAVES.slice();
    syncFields();
    state.applyingPreset = false;
    randomize(false);
  }

  function readFiltersFromUI() {
    state.quiz.title = els.title.value;
    state.quiz.instructions = els.instructions.value;
    state.quiz.timeLimit = els.time.value;
    state.quiz.count = clamp(parseInt(els.count.value, 10) || 30, 6, 72);
    els.count.value = String(state.quiz.count);
    state.quiz.showOctaveOnKey = els.octaveKey.checked;
    state.quiz.clefs = checkedValues("clef");
    state.quiz.accidentals = checkedValues("accidental");
    state.quiz.letters = checkedValues("letter");
    state.quiz.octaves = checkedValues("octave").map(Number);
    if (!state.applyingPreset) {
      state.quiz.preset = "custom";
      els.preset.value = "custom";
    }
  }

  function syncFields() {
    state.applyingPreset = true;
    els.title.value = state.quiz.title;
    els.instructions.value = state.quiz.instructions;
    els.time.value = state.quiz.timeLimit;
    els.count.value = String(state.quiz.count);
    els.octaveKey.checked = state.quiz.showOctaveOnKey;
    els.preset.value = PRESETS[state.quiz.preset] ? state.quiz.preset : "custom";
    setChecked("clef", state.quiz.clefs);
    setChecked("accidental", state.quiz.accidentals);
    setChecked("letter", state.quiz.letters);
    setChecked("octave", state.quiz.octaves);
    state.applyingPreset = false;
  }

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderPreview() {
    const isKey = state.previewMode === "key";
    document.body.dataset.print = isKey ? "key" : "student";
    const available = pool();
    const repeats = state.quiz.items.length > available.length;
    els.pool.textContent = available.length
      ? `Pool: ${available.length} unique notes${repeats && available.length < state.quiz.count ? " · some notes will repeat" : ""}`
      : "Pool: 0 notes — turn more options back on.";

    const title = escapeHTML(state.quiz.title || "Mad Minute");
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
      els.sheet.innerHTML = `${heading}<p class="empty-preview">No notes to show.</p>`;
      return;
    }

    const cards = state.quiz.items
      .map((note) => {
        const label = state.quiz.showOctaveOnKey ? note.displayOctave : note.display;
        return `<figure class="note-card">
          <img src="${escapeHTML(note.src)}?v=crop1" alt="${escapeHTML(note.displayOctave)}" />
          <figcaption class="caption">${escapeHTML(label)}</figcaption>
        </figure>`;
      })
      .join("");

    els.sheet.innerHTML = `${heading}<div class="note-grid${total > 36 ? " compact" : ""}">${cards}</div>`;
  }

  function confirmIfDirty(message) {
    if (!state.dirty) return true;
    return window.confirm(message);
  }

  function loadOpenedQuiz(data, fileName, handle) {
    if (window.routeQuizFile && !window.routeQuizFile("mad-minute", data, fileName)) return;
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
          suggestedName: state.fileName || "mad-minute.json",
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
    downloadText(state.fileName || "mad-minute.json", text);
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
    buildChecks("clefs", "clef", CLEFS, ClefLabel);
    buildChecks("accidentals", "accidental", ACCIDENTALS, AccLabel);
    buildChecks("letters", "letter", LETTERS, Object.fromEntries(LETTERS.map((l) => [l, l])));
    buildChecks(
      "octaves",
      "octave",
      OCTAVES,
      Object.fromEntries(OCTAVES.map((o) => [o, String(o)]))
    );

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
    els.octaveKey.addEventListener("change", () => {
      readFiltersFromUI();
      renderPreview();
      markDirty();
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
        window.alert("That file could not be read as a Mad Minute JSON file.");
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
    const pending = window.consumePendingQuiz && window.consumePendingQuiz("mad-minute");
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
