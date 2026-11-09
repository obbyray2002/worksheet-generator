(() => {
  "use strict";

  const KINDS = {
    notes: {
      src: "mad-minutes.html?embed=1",
      label: "Identify notes (4 clefs)",
    },
    keys: {
      src: "key-signatures.html?embed=1&v=2",
      label: "Identify key signatures (4 clefs)",
    },
    "write-keys": {
      src: "write-key-signatures.html?embed=1&v=2",
      label: "Write key signatures",
    },
    "write-tetrachords": {
      src: "write-tetrachords.html?embed=1",
      label: "Write major tetrachords",
    },
    "write-scales": {
      src: "write-scales.html?embed=1&v=18",
      label: "Write major scales",
    },
    "write-intervals": {
      src: "write-intervals.html?embed=1&v=3",
      label: "Write intervals above",
    },
    box: {
      src: "box.html?embed=1",
      label: "Write in boxes (letter names)",
    },
  };

  const select = document.getElementById("kind");
  const frame = document.getElementById("workspace");
  const share = document.getElementById("share-dialog");

  function currentKind() {
    const params = new URLSearchParams(window.location.search);
    const kind = params.get("kind");
    return KINDS[kind] ? kind : "notes";
  }

  function markEmbedded() {
    try {
      const doc = frame.contentDocument;
      if (!doc) return;
      doc.documentElement.classList.add("embedded");
      if (doc.body) doc.body.classList.add("embedded");
    } catch {
      /* ignore */
    }
  }

  function show(kind) {
    const next = KINDS[kind] ? kind : "notes";
    select.value = next;
    frame.src = KINDS[next].src;
    const url = new URL(window.location.href);
    url.searchParams.set("kind", next);
    window.history.replaceState(null, "", url);
    document.title = `${KINDS[next].label} — Worksheet Generator`;
  }

  frame.addEventListener("load", markEmbedded);
  select.addEventListener("change", () => show(select.value));
  document.getElementById("btn-share").addEventListener("click", () => share.showModal());
  document.getElementById("btn-share-close").addEventListener("click", () => share.close());

  show(currentKind());
})();
