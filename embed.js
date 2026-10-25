(() => {
  function mark() {
    const params = new URLSearchParams(window.location.search);
    const embedded = params.has("embed") || window.self !== window.top;
    if (!embedded) return;
    document.documentElement.classList.add("embedded");
    if (document.body) document.body.classList.add("embedded");
    if (!document.getElementById("embed-hide-nav")) {
      const style = document.createElement("style");
      style.id = "embed-hide-nav";
      style.textContent = ".app-switch{display:none!important}.brand>strong{display:none!important}";
      (document.head || document.documentElement).appendChild(style);
    }
  }
  mark();
  document.addEventListener("DOMContentLoaded", mark);
})();
