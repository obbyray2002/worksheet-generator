window.QUIZ_MAKERS = {
  "box-worksheet": { kind: "box", href: "index.html?kind=box", label: "Write in boxes" },
  "mad-minute": { kind: "notes", href: "index.html?kind=notes", label: "Identify notes" },
  "key-signature-minute": { kind: "keys", href: "index.html?kind=keys", label: "Identify key signatures" },
  "write-key-signature": { kind: "write-keys", href: "index.html?kind=write-keys", label: "Write key signatures" },
  "write-tetrachord": { kind: "write-tetrachords", href: "index.html?kind=write-tetrachords", label: "Write tetrachords" },
  "write-scale": { kind: "write-scales", href: "index.html?kind=write-scales", label: "Write scales" },
};

window.routeQuizFile = function routeQuizFile(expectedFormat, data, fileName) {
  const format = data && data.format;
  if (!format || format === expectedFormat) return true;
  const home = window.QUIZ_MAKERS[format];
  if (!home) return true;
  const name = fileName || "This file";
  const go = window.confirm(`“${name}” belongs in ${home.label}.\n\nSwitch to that worksheet now?`);
  if (go) {
    try {
      sessionStorage.setItem(
        "worksheet-pending-quiz",
        JSON.stringify({ fileName: name, data })
      );
    } catch {
      /* ignore */
    }
    const dest = home.href;
    if (window.top && window.top !== window) window.top.location.href = dest;
    else window.location.href = dest;
  }
  return false;
};

window.consumePendingQuiz = function consumePendingQuiz(expectedFormat) {
  let pending = null;
  try {
    pending = JSON.parse(sessionStorage.getItem("worksheet-pending-quiz") || "null");
    sessionStorage.removeItem("worksheet-pending-quiz");
  } catch {
    pending = null;
  }
  if (!pending || !pending.data) return null;
  if (pending.data.format && pending.data.format !== expectedFormat) return null;
  return pending;
};
