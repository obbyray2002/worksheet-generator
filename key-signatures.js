(() => {
  "use strict";

  const STORAGE_KEY = "key-signature-maker-v1";
  const ACCEPT = {
    types: [{ description: "Quiz file", accept: { "application/json": [".json"] } }],
  };
  const CLEFS = window.KEY_CLEFS || ["treble", "alto", "tenor", "bass"];
  const ClefLabel = { treble: "Treble", alto: "Alto", tenor: "Tenor", bass: "Bass" };
  const KEY_DEFS = (window.KEY_DEFS || []).slice().sort((a, b) => a.order - b.order);
  const CATALOG = (window.KEY_CATALOG || []).slice();
  const ALL_FILES = KEY_DEFS.map((k) => k.file);

  const PREFERRED_EXTRAS = ["treble", "bass"];
  const PRESETS = {
    all: { keys: ALL_FILES.slice() },
    flats: { keys: KEY_DEFS.filter((k) => k.side === "flat").map((k) => k.file) },
    sharps: { keys: KEY_DEFS.filter((k) => k.side === "sharp").map((k) => k.file) },
    common: { keys: KEY_DEFS.filter((k) => k.order >= 4 && k.order <= 12).map((k) => k.file) },
    beginner: { keys: KEY_DEFS.filter((k) => ["F", "C", "G", "D"].includes(k.name)).map((k) => k.file) },
    "split-4clefs": { keys: ALL_FILES.slice(), clefs: CLEFS.slice(), eachKey: 1 },
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
    eachKey: document.getElementById("field-each"),
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
      title: "Key Signature Mad Minute",
      instructions: "Name each major key signature.",
      timeLimit: "1 minute",
      preset: "all",
      eachKey: 1,
      count: 15,
      clefs: ["treble"],
      clefCounts: { treble: 15, alto: 0, tenor: 0, bass: 0 },
      keys: ALL_FILES.slice(),
      items: [],
    };
  }

  function emptyClefCounts() {
    return { treble: 0, alto: 0, tenor: 0, bass: 0 };
  }

  function sumClefCounts(counts) {
    return CLEFS.reduce((n, c) => n + (counts[c] || 0), 0);
  }

  function distributeClefCounts(total, selected) {
    const counts = emptyClefCounts();
    const active = CLEFS.filter((c) => selected.includes(c));
    if (!active.length || total < 1) return counts;
    const n = active.length;
    const base = Math.floor(total / n);
    let extra = total % n;
    for (const c of active) counts[c] = base;
    const extrasFor = PREFERRED_EXTRAS.filter((c) => active.includes(c));
    const cycle = extrasFor.length ? extrasFor : active;
    let i = 0;
    while (extra > 0) {
      counts[cycle[i % cycle.length]] += 1;
      extra -= 1;
      i += 1;
    }
    return counts;
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

  function toKeyFile(id) {
    if (!id) return null;
    const hit = CATALOG.find((k) => k.id === id);
    if (hit) return hit.file;
    if (ALL_FILES.includes(id)) return id;
    const tail = String(id).split("-").pop();
    return ALL_FILES.includes(tail) ? tail : null;
  }

  function normalizeQuiz(raw) {
    const src = raw && raw.quiz ? raw.quiz : raw || {};
    const base = defaultQuiz();
    const keys = Array.isArray(src.keys)
      ? [...new Set(src.keys.map(toKeyFile).filter(Boolean))]
      : base.keys;
    const eachKey = clamp(parseInt(src.eachKey, 10) || base.eachKey, 1, 8);
    let clefs = Array.isArray(src.clefs) ? src.clefs.filter((c) => CLEFS.includes(c)) : base.clefs.slice();
    const rawCounts = src.clefCounts && typeof src.clefCounts === "object" ? src.clefCounts : null;
    let clefCounts = emptyClefCounts();
    if (rawCounts) {
      CLEFS.forEach((c) => {
        clefCounts[c] = clamp(parseInt(rawCounts[c], 10) || 0, 0, 60);
      });
      const fromCounts = CLEFS.filter((c) => clefCounts[c] > 0);
      if (fromCounts.length) clefs = fromCounts;
    }
    if (!clefs.length) clefs = ["treble"];
    let count = clamp(parseInt(src.count, 10) || keys.length * eachKey || base.count, 1, 60);
    if (!rawCounts) clefCounts = distributeClefCounts(count, clefs);
    const summed = sumClefCounts(clefCounts);
    if (summed > 0) count = clamp(summed, 1, 60);
    else clefCounts = distributeClefCounts(count, clefs);
    const items = Array.isArray(src.items)
      ? src.items.map((item) => (typeof item === "string" ? byId(item) : byId(item && item.id))).filter(Boolean)
      : [];
    return {
      title: String(src.title ?? base.title),
      instructions: String(src.instructions ?? base.instructions),
      timeLimit: String(src.timeLimit ?? base.timeLimit),
      preset: PRESETS[src.preset] ? src.preset : "custom",
      eachKey,
      count,
      clefs,
      clefCounts,
      keys: keys.length ? keys : ALL_FILES.slice(),
      items,
    };
  }

  function pairItem(file, clef) {
    return CATALOG.find((k) => k.file === file && k.clef === clef) || null;
  }

  function shuffle(list) {
    const next = list.slice();
    for (let i = next.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
  }

  function evenKeyList(files, total) {
    if (!files.length || total < 1) return [];
    const copies = Math.floor(total / files.length);
    const extra = total % files.length;
    const list = [];
    files.forEach((file) => {
      for (let i = 0; i < copies; i += 1) list.push(file);
    });
    shuffle(files.slice())
      .slice(0, extra)
      .forEach((file) => list.push(file));
    return shuffle(list);
  }

  function drawItems() {
    const files = state.quiz.keys.slice();
    const counts = state.quiz.clefCounts || emptyClefCounts();
    const total = sumClefCounts(counts);
    if (!files.length || total < 1) return [];
    const keyList = evenKeyList(files, total);
    const bag = [];
    CLEFS.forEach((clef) => {
      for (let i = 0; i < (counts[clef] || 0); i += 1) bag.push(clef);
    });
    const remaining = shuffle(bag);
    const used = new Set();
    const items = [];
    keyList.forEach((file) => {
      if (!remaining.length) return;
      let idx = remaining.findIndex((clef) => !used.has(`${clef}-${file}`));
      if (idx < 0) idx = 0;
      const clef = remaining.splice(idx, 1)[0];
      const item = pairItem(file, clef);
      if (item) {
        used.add(item.id);
        items.push(item);
      }
    });
    return items;
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
    return JSON.stringify({ format: "key-signature-minute", version: 2, quiz }, null, 2);
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
    document.title = `${mark}${state.fileName} — Key Signatures`;
  }

  function itemsMatchCounts(items, counts) {
    const got = emptyClefCounts();
    items.forEach((item) => {
      if (item && item.clef) got[item.clef] = (got[item.clef] || 0) + 1;
    });
    return CLEFS.every((c) => (got[c] || 0) === (counts[c] || 0));
  }

  function setQuiz(quiz, fileName, dirty, reshuffleIfEmpty) {
    state.quiz = normalizeQuiz(quiz);
    state.quiz.preset = matchPreset();
    state.fileName = fileName || state.fileName;
    state.dirty = Boolean(dirty);
    state.undoItems = null;
    els.undo.disabled = true;
    const counts = state.quiz.clefCounts || emptyClefCounts();
    if (
      reshuffleIfEmpty &&
      (!state.quiz.items.length || !itemsMatchCounts(state.quiz.items, counts))
    ) {
      state.quiz.items = drawItems();
    }
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

  function matchPreset() {
    const keySet = state.quiz.keys.slice().sort().join(",");
    const allClefs =
      state.quiz.clefs.length === CLEFS.length && CLEFS.every((c) => state.quiz.clefs.includes(c));
    if (keySet === ALL_FILES.slice().sort().join(",") && allClefs) return "split-4clefs";
    const found = Object.keys(PRESETS).find((name) => {
      if (name === "split-4clefs") return false;
      return PRESETS[name].keys.slice().sort().join(",") === keySet;
    });
    return found || "custom";
  }

  function applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    state.applyingPreset = true;
    state.quiz.preset = name;
    state.quiz.keys = preset.keys.slice();
    if (preset.eachKey) state.quiz.eachKey = preset.eachKey;
    if (preset.clefs) state.quiz.clefs = preset.clefs.slice();
    const total = clamp(state.quiz.keys.length * (state.quiz.eachKey || 1), 1, 60);
    state.quiz.count = total;
    state.quiz.clefCounts = distributeClefCounts(total, state.quiz.clefs);
    state.quiz.clefs = CLEFS.filter((c) => state.quiz.clefCounts[c] > 0);
    syncFields();
    state.applyingPreset = false;
    randomize(false);
  }

  function readTextFields() {
    state.quiz.title = els.title.value;
    state.quiz.instructions = els.instructions.value;
    state.quiz.timeLimit = els.time.value;
  }

  function applyEachKeyTotal() {
    const keys = state.quiz.keys.length || 1;
    const total = clamp(keys * state.quiz.eachKey, 1, 60);
    state.quiz.count = total;
    state.quiz.clefCounts = distributeClefCounts(total, state.quiz.clefs);
    state.quiz.clefs = CLEFS.filter((c) => state.quiz.clefCounts[c] > 0);
  }

  function readFiltersFromUI() {
    readTextFields();
    state.quiz.keys = checkedValues("key");
    if (!state.quiz.keys.length) state.quiz.keys = ALL_FILES.slice();
    if (!state.applyingPreset) {
      state.quiz.preset = matchPreset();
      els.preset.value = state.quiz.preset;
    }
  }

  function syncClefCountInputs() {
    const counts = state.quiz.clefCounts || emptyClefCounts();
    CLEFS.forEach((clef) => {
      const input = document.querySelector(`input[data-clef-count="${clef}"]`);
      if (input) {
        input.value = String(counts[clef] || 0);
        input.disabled = !state.quiz.clefs.includes(clef);
      }
    });
    setChecked("clef", state.quiz.clefs);
  }

  function syncFields() {
    state.applyingPreset = true;
    els.title.value = state.quiz.title;
    els.instructions.value = state.quiz.instructions;
    els.time.value = state.quiz.timeLimit;
    els.eachKey.value = String(state.quiz.eachKey);
    els.count.value = String(state.quiz.count);
    els.preset.value = PRESETS[state.quiz.preset] ? state.quiz.preset : "custom";
    setChecked("key", state.quiz.keys);
    syncClefCountInputs();
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
    const counts = state.quiz.clefCounts || emptyClefCounts();
    const mix = CLEFS.filter((c) => counts[c] > 0)
      .map((c) => `${ClefLabel[c]} ${counts[c]}`)
      .join(", ");
    const keysN = state.quiz.keys.length;
    const each = state.quiz.eachKey;
    const even = keysN > 0 && state.quiz.count === keysN * each;
    els.pool.textContent = state.quiz.count
      ? `${state.quiz.count} cards · ${even ? `each of ${keysN} keys × ${each}` : `${keysN} keys, spread evenly`} · ${mix || "no clefs"}`
      : "0 cards — turn a clef or some keys back on.";

    const title = escapeHTML(state.quiz.title || "Key Signatures");
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
      els.sheet.innerHTML = `${heading}<p class="empty-preview">No key signatures to show.</p>`;
      return;
    }

    const cards = state.quiz.items
      .map(
        (item) => `<figure class="note-card">
          <img src="${escapeHTML(item.src)}?v=clef1" alt="${escapeHTML(item.display)} in ${escapeHTML(item.clef)} clef" />
          <figcaption class="caption">${escapeHTML(item.display)}</figcaption>
        </figure>`
      )
      .join("");

    els.sheet.innerHTML = `${heading}<div class="note-grid cols-5">${cards}</div>`;
  }

  function confirmIfDirty(message) {
    if (!state.dirty) return true;
    return window.confirm(message);
  }

  function loadOpenedQuiz(data, fileName, handle) {
    if (window.routeQuizFile && !window.routeQuizFile("key-signature-minute", data, fileName)) return;
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
          suggestedName: state.fileName || "key-signatures.json",
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
    downloadText(state.fileName || "key-signatures.json", text);
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
    document.getElementById("clefs").innerHTML = CLEFS.map(
      (clef) =>
        `<div class="clef-row">
          <label><input type="checkbox" name="clef" value="${clef}" /> ${ClefLabel[clef]}</label>
          <input type="number" min="0" max="60" data-clef-count="${clef}" aria-label="${ClefLabel[clef]} count" />
        </div>`
    ).join("");
    document.getElementById("keys").innerHTML = KEY_DEFS.map(
      (k) =>
        `<label><input type="checkbox" name="key" value="${k.file}" /> ${escapeHTML(k.display)}</label>`
    ).join("");

    ["title", "instructions", "time"].forEach((key) => {
      els[key].addEventListener("input", () => {
        readTextFields();
        renderPreview();
        markDirty();
      });
    });
    els.eachKey.addEventListener("change", () => {
      state.quiz.eachKey = clamp(parseInt(els.eachKey.value, 10) || 1, 1, 8);
      els.eachKey.value = String(state.quiz.eachKey);
      applyEachKeyTotal();
      syncFields();
      randomize(false);
    });
    els.count.addEventListener("change", () => {
      const total = clamp(parseInt(els.count.value, 10) || 15, 1, 60);
      state.quiz.count = total;
      if (state.quiz.keys.length && total % state.quiz.keys.length === 0) {
        state.quiz.eachKey = total / state.quiz.keys.length;
      }
      state.quiz.clefCounts = distributeClefCounts(total, state.quiz.clefs);
      state.quiz.clefs = CLEFS.filter((c) => state.quiz.clefCounts[c] > 0);
      syncFields();
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
    document.getElementById("clefs").addEventListener("change", (event) => {
      if (state.applyingPreset) return;
      const t = event.target;
      if (t && t.matches("input[name='clef']")) {
        const selected = checkedValues("clef");
        if (!selected.length) {
          setChecked("clef", state.quiz.clefs);
          return;
        }
        state.quiz.clefs = selected;
        state.quiz.clefCounts = distributeClefCounts(state.quiz.count, selected);
        state.quiz.clefs = CLEFS.filter((c) => state.quiz.clefCounts[c] > 0);
        if (!state.applyingPreset) {
          state.quiz.preset = matchPreset();
          els.preset.value = state.quiz.preset;
        }
        syncClefCountInputs();
        els.count.value = String(sumClefCounts(state.quiz.clefCounts));
        state.quiz.count = sumClefCounts(state.quiz.clefCounts);
        randomize(false);
        return;
      }
      if (t && t.matches("input[data-clef-count]")) {
        const clef = t.getAttribute("data-clef-count");
        const n = clamp(parseInt(t.value, 10) || 0, 0, 60);
        state.quiz.clefCounts[clef] = n;
        if (n > 0 && !state.quiz.clefs.includes(clef)) state.quiz.clefs.push(clef);
        if (n === 0) state.quiz.clefs = state.quiz.clefs.filter((c) => c !== clef);
        if (!state.quiz.clefs.length) {
          state.quiz.clefs = ["treble"];
          state.quiz.clefCounts.treble = Math.max(1, state.quiz.count);
        }
        state.quiz.count = clamp(sumClefCounts(state.quiz.clefCounts), 1, 60);
        if (!state.applyingPreset) {
          state.quiz.preset = matchPreset();
          els.preset.value = PRESETS[state.quiz.preset] ? state.quiz.preset : "custom";
        }
        syncFields();
        randomize(false);
      }
    });
    document.getElementById("keys").addEventListener("change", () => {
      if (state.applyingPreset) return;
      readFiltersFromUI();
      applyEachKeyTotal();
      syncFields();
      randomize(false);
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
        window.alert("That file could not be read as a key-signature JSON file.");
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
    const pending = window.consumePendingQuiz && window.consumePendingQuiz("key-signature-minute");
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
