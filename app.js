(() => {
  "use strict";

  const STORAGE_KEY = "box-worksheet-maker-v1";
  const ACCEPT = {
    types: [
      {
        description: "Quiz file",
        accept: { "application/json": [".json"] },
      },
    ],
  };

  const MAJOR_SCALES_SAMPLE = {
    title: "Quiz 9",
    instructions: "Write each major scale using accidentals.",
    timeLimit: "7 ½ minutes",
    copiesPerPage: 4,
    columns: 8,
    items: [
      { prompt: "F♯", answers: ["G♯", "A♯", "B", "C♯", "D♯", "E♯", "F♯"] },
      { prompt: "B♭", answers: ["C", "D", "E♭", "F", "G", "A", "B♭"] },
      { prompt: "E♭", answers: ["F", "G", "A♭", "B♭", "C", "D", "E♭"] },
      { prompt: "C♭", answers: ["D♭", "E♭", "F♭", "G♭", "A♭", "B♭", "C♭"] },
      { prompt: "A", answers: ["B", "C♯", "D", "E", "F♯", "G♯", "A"] },
      { prompt: "D", answers: ["E", "F♯", "G", "A", "B", "C♯", "D"] },
      { prompt: "C♯", answers: ["D♯", "E♯", "F♯", "G♯", "A♯", "B♯", "C♯"] },
      { prompt: "A♭", answers: ["B♭", "C", "D♭", "E♭", "F", "G", "A♭"] },
      { prompt: "B", answers: ["C♯", "D♯", "E", "F♯", "G♯", "A♯", "B"] },
      { prompt: "G", answers: ["A", "B", "C", "D", "E", "F♯", "G"] },
      { prompt: "C", answers: ["D", "E", "F", "G", "A", "B", "C"] },
      { prompt: "E", answers: ["F♯", "G♯", "A", "B", "C♯", "D♯", "E"] },
      { prompt: "D♭", answers: ["E♭", "F", "G♭", "A♭", "B♭", "C", "D♭"] },
      { prompt: "F", answers: ["G", "A", "B♭", "C", "D", "E", "F"] },
      { prompt: "G♭", answers: ["A♭", "B♭", "C♭", "D♭", "E♭", "F", "G♭"] },
    ],
  };

  const state = {
    fileName: "untitled.json",
    fileHandle: null,
    dirty: false,
    previewMode: "student",
    lastFocusedInput: null,
    undoItems: null,
    quiz: blankQuiz(),
  };

  const els = {
    title: document.getElementById("field-title"),
    instructions: document.getElementById("field-instructions"),
    time: document.getElementById("field-time"),
    copies: document.getElementById("field-copies"),
    columns: document.getElementById("field-columns"),
    itemsTable: document.getElementById("items-table"),
    sheet: document.getElementById("sheet"),
    fileStatus: document.getElementById("file-status"),
    fileInput: document.getElementById("file-input"),
    undo: document.getElementById("btn-undo"),
    help: document.getElementById("help-dialog"),
    paste: document.getElementById("paste-dialog"),
    pasteText: document.getElementById("paste-text"),
  };

  function blankQuiz() {
    return {
      title: "",
      instructions: "",
      timeLimit: "",
      copiesPerPage: 4,
      columns: 8,
      items: [newItem(8)],
    };
  }

  function newItem(columns) {
    return {
      prompt: "",
      answers: Array.from({ length: Math.max(0, columns - 1) }, () => ""),
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function padAnswers(item, extraCount) {
    const answers = Array.isArray(item.answers) ? item.answers.map((a) => String(a ?? "")) : [];
    while (answers.length < extraCount) answers.push("");
    return {
      prompt: String(item.prompt ?? ""),
      answers,
    };
  }

  function normalizeQuiz(raw) {
    const src = raw && raw.quiz ? raw.quiz : raw || {};
    const columns = clamp(parseInt(src.columns, 10) || 8, 2, 12);
    const copies = [1, 2, 4].includes(Number(src.copiesPerPage)) ? Number(src.copiesPerPage) : 4;
    const extra = columns - 1;
    const items = Array.isArray(src.items) && src.items.length
      ? src.items.map((item) => padAnswers(item, extra))
      : [newItem(columns)];
    return {
      title: String(src.title ?? ""),
      instructions: String(src.instructions ?? ""),
      timeLimit: String(src.timeLimit ?? ""),
      copiesPerPage: copies,
      columns,
      items,
    };
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function serialize() {
    return JSON.stringify(
      {
        format: "box-worksheet",
        version: 1,
        quiz: state.quiz,
      },
      null,
      2
    );
  }

  function markDirty() {
    state.dirty = true;
    persistScratch();
    updateStatus();
  }

  function persistScratch() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          fileName: state.fileName,
          quiz: state.quiz,
          previewMode: state.previewMode,
        })
      );
    } catch {
      /* ignore quota */
    }
  }

  function updateStatus() {
    const mark = state.dirty ? "• " : "";
    els.fileStatus.textContent = `${mark}${state.fileName}`;
    document.title = `${mark}${state.fileName} — Box Worksheet Maker`;
  }

  function setQuiz(quiz, fileName, dirty) {
    state.quiz = normalizeQuiz(quiz);
    state.fileName = fileName || state.fileName;
    state.dirty = Boolean(dirty);
    state.undoItems = null;
    els.undo.disabled = true;
    syncMetaFields();
    renderItemsTable();
    renderPreview();
    persistScratch();
    updateStatus();
  }

  function syncMetaFields() {
    els.title.value = state.quiz.title;
    els.instructions.value = state.quiz.instructions;
    els.time.value = state.quiz.timeLimit;
    els.copies.value = String(state.quiz.copiesPerPage);
    els.columns.value = String(state.quiz.columns);
  }

  function headingHTML(isKey) {
    const title = escapeHTML(state.quiz.title || "Untitled");
    const instructions = escapeHTML(state.quiz.instructions);
    const time = state.quiz.timeLimit.trim();
    const keyMark = isKey ? " — KEY" : "";
    const titleBit = `<span class="title">${title}${keyMark}.</span>`;
    const instructBit = instructions ? `  ${instructions}` : "";
    const timeBit = time ? `<div>You’ll have ${escapeHTML(time)}.</div>` : "";
    return `${titleBit}${instructBit}${timeBit}`;
  }

  function renderPreview() {
    const copies = state.quiz.copiesPerPage;
    const isKey = state.previewMode === "key";
    document.body.dataset.print = isKey ? "key" : "student";
    els.sheet.className = `sheet copies-${copies}`;
    els.sheet.innerHTML = "";

    const extra = state.quiz.columns - 1;
    const rows = Math.max(1, state.quiz.items.length);

    for (let i = 0; i < copies; i += 1) {
      const copy = document.createElement("article");
      copy.className = "quiz-copy";

      const heading = document.createElement("div");
      heading.className = "quiz-heading";
      heading.innerHTML = headingHTML(isKey);
      copy.appendChild(heading);

      const grid = document.createElement("div");
      grid.className = "scale-grid";
      grid.style.setProperty("--extra-cols", String(extra));
      grid.style.setProperty("--rows", String(rows));

      state.quiz.items.forEach((item) => {
        const prompt = document.createElement("div");
        prompt.className = "cell prompt";
        prompt.textContent = item.prompt;
        grid.appendChild(prompt);

        for (let c = 0; c < extra; c += 1) {
          const cell = document.createElement("div");
          cell.className = "cell answer";
          cell.textContent = item.answers[c] || "";
          grid.appendChild(cell);
        }
      });

      copy.appendChild(grid);
      els.sheet.appendChild(copy);
    }
  }

  function renderItemsTable() {
    const extra = state.quiz.columns - 1;
    const thead = ["#", "Given", ...Array.from({ length: extra }, (_, i) => String(i + 2)), ""];
    const header = `<tr>${thead.map((h) => `<th>${h}</th>`).join("")}</tr>`;

    const body = state.quiz.items
      .map((item, index) => {
        const answers = Array.from({ length: extra }, (_, i) => {
          const value = escapeAttr(item.answers[i] || "");
          return `<td><input data-row="${index}" data-answer="${i}" value="${value}" /></td>`;
        }).join("");
        return `<tr>
          <td class="row-num">${index + 1}</td>
          <td><input class="prompt" data-row="${index}" data-prompt="1" value="${escapeAttr(item.prompt)}" /></td>
          ${answers}
          <td class="row-actions">
            <button type="button" data-move="${index}" data-dir="-1" title="Move up">↑</button>
            <button type="button" data-move="${index}" data-dir="1" title="Move down">↓</button>
            <button type="button" data-delete="${index}" title="Delete row">×</button>
          </td>
        </tr>`;
      })
      .join("");

    els.itemsTable.innerHTML = header + body;
  }

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeAttr(value) {
    return escapeHTML(value).replace(/"/g, "&quot;");
  }

  function currentColumns() {
    return clamp(parseInt(els.columns.value, 10) || 8, 2, 12);
  }

  function applyColumnCount(next) {
    const columns = clamp(next, 2, 12);
    const extra = columns - 1;
    state.quiz.columns = columns;
    state.quiz.items = state.quiz.items.map((item) => padAnswers(item, extra));
    els.columns.value = String(columns);
    renderItemsTable();
    renderPreview();
    markDirty();
  }

  function shuffle(list) {
    const next = list.slice();
    for (let i = next.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
  }

  function confirmIfDirty(message) {
    if (!state.dirty) return true;
    return window.confirm(message);
  }

  function loadOpenedQuiz(data, fileName, handle) {
    if (window.routeQuizFile && !window.routeQuizFile("box-worksheet", data, fileName)) return;
    state.fileHandle = handle || null;
    setQuiz(data, fileName, false);
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
          suggestedName: state.fileName || "quiz.json",
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

    downloadText(state.fileName || "quiz.json", text);
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

  function insertAtCursor(text) {
    const input = state.lastFocusedInput;
    if (!input || input.tagName !== "INPUT") return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
    const pos = start + text.length;
    input.setSelectionRange(pos, pos);
  }

  function parsePastedRows(text) {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const cells = line.includes("\t")
          ? line.split("\t")
          : line.split(",").map((part) => part.trim());
        return {
          prompt: cells[0] || "",
          answers: cells.slice(1),
        };
      });
  }

  function applyPastedRows(rows, append) {
    const extra = state.quiz.columns - 1;
    const incoming = rows.map((row) => padAnswers(row, extra));
    state.quiz.items = append ? state.quiz.items.concat(incoming) : incoming.length ? incoming : [newItem(state.quiz.columns)];
    renderItemsTable();
    renderPreview();
    markDirty();
  }

  function bind() {
    els.title.addEventListener("input", () => {
      state.quiz.title = els.title.value;
      renderPreview();
      markDirty();
    });
    els.instructions.addEventListener("input", () => {
      state.quiz.instructions = els.instructions.value;
      renderPreview();
      markDirty();
    });
    els.time.addEventListener("input", () => {
      state.quiz.timeLimit = els.time.value;
      renderPreview();
      markDirty();
    });
    els.copies.addEventListener("change", () => {
      state.quiz.copiesPerPage = Number(els.copies.value);
      renderPreview();
      markDirty();
    });
    els.columns.addEventListener("change", () => applyColumnCount(currentColumns()));

    els.itemsTable.addEventListener("input", (event) => {
      const input = event.target.closest("input");
      if (!input) return;
      const row = Number(input.dataset.row);
      const item = state.quiz.items[row];
      if (!item) return;
      if (input.dataset.prompt) item.prompt = input.value;
      else if (input.dataset.answer != null) item.answers[Number(input.dataset.answer)] = input.value;
      renderPreview();
      markDirty();
    });

    els.itemsTable.addEventListener("focusin", (event) => {
      if (event.target.tagName === "INPUT") state.lastFocusedInput = event.target;
    });

    els.itemsTable.addEventListener("click", (event) => {
      const del = event.target.closest("[data-delete]");
      if (del) {
        const index = Number(del.dataset.delete);
        if (state.quiz.items.length === 1) {
          state.quiz.items = [newItem(state.quiz.columns)];
        } else {
          state.quiz.items.splice(index, 1);
        }
        renderItemsTable();
        renderPreview();
        markDirty();
        return;
      }
      const move = event.target.closest("[data-move]");
      if (move) {
        const index = Number(move.dataset.move);
        const next = index + Number(move.dataset.dir);
        if (next < 0 || next >= state.quiz.items.length) return;
        const [row] = state.quiz.items.splice(index, 1);
        state.quiz.items.splice(next, 0, row);
        renderItemsTable();
        renderPreview();
        markDirty();
      }
    });

    document.querySelectorAll("[data-insert]").forEach((btn) => {
      btn.addEventListener("mousedown", (event) => event.preventDefault());
      btn.addEventListener("click", () => insertAtCursor(btn.dataset.insert));
    });

    document.getElementById("btn-add-row").addEventListener("click", () => {
      state.quiz.items.push(newItem(state.quiz.columns));
      renderItemsTable();
      renderPreview();
      markDirty();
    });

    document.getElementById("btn-new").addEventListener("click", () => {
      if (!confirmIfDirty("Start a new quiz and lose unsaved changes?")) return;
      state.fileHandle = null;
      setQuiz(blankQuiz(), "untitled.json", false);
    });

    document.getElementById("btn-open").addEventListener("click", () => {
      if (!confirmIfDirty("Open a file and lose unsaved changes?")) return;
      openWithPicker();
    });

    document.getElementById("btn-save").addEventListener("click", () => saveQuiz(false));
    document.getElementById("btn-save-as").addEventListener("click", () => saveQuiz(true));
    document.getElementById("btn-randomize").addEventListener("click", () => {
      state.undoItems = clone(state.quiz.items);
      state.quiz.items = shuffle(state.quiz.items);
      els.undo.disabled = false;
      renderItemsTable();
      renderPreview();
      markDirty();
    });
    els.undo.addEventListener("click", () => {
      if (!state.undoItems) return;
      state.quiz.items = state.undoItems;
      state.undoItems = null;
      els.undo.disabled = true;
      renderItemsTable();
      renderPreview();
      markDirty();
    });

    document.getElementById("btn-print").addEventListener("click", () => printSheet("student"));
    document.getElementById("btn-print-key").addEventListener("click", () => printSheet("key"));

    document.getElementById("btn-help").addEventListener("click", () => els.help.showModal());
    document.getElementById("btn-help-close").addEventListener("click", () => els.help.close());
    document.getElementById("btn-paste").addEventListener("click", () => {
      els.pasteText.value = "";
      els.paste.showModal();
      els.pasteText.focus();
    });
    document.getElementById("btn-paste-close").addEventListener("click", () => els.paste.close());
    document.getElementById("btn-paste-replace").addEventListener("click", () => {
      applyPastedRows(parsePastedRows(els.pasteText.value), false);
      els.paste.close();
    });
    document.getElementById("btn-paste-append").addEventListener("click", () => {
      applyPastedRows(parsePastedRows(els.pasteText.value), true);
      els.paste.close();
    });
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
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "s") {
        event.preventDefault();
        saveQuiz(event.shiftKey);
      }
    });

    window.addEventListener("beforeunload", (event) => {
      if (!state.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });

    window.addEventListener("dragover", (event) => {
      event.preventDefault();
    });
    window.addEventListener("drop", async (event) => {
      event.preventDefault();
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (!file || !file.name.toLowerCase().endsWith(".json")) return;
      if (!confirmIfDirty("Open this file and lose unsaved changes?")) return;
      try {
        loadOpenedQuiz(JSON.parse(await file.text()), file.name, null);
      } catch {
        window.alert("That file could not be read as a quiz JSON file.");
      }
    });
  }

  function boot() {
    bind();
    const pending = window.consumePendingQuiz && window.consumePendingQuiz("box-worksheet");
    if (pending) {
      setQuiz(pending.data, pending.fileName || "untitled.json", false);
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
      setQuiz(restored.quiz, restored.fileName || "untitled.json", true);
    } else {
      setQuiz(MAJOR_SCALES_SAMPLE, "Major Scale Quiz.json", true);
    }
  }

  boot();
})();
