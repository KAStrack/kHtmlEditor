// Shared docs behaviour: source toggles and live output panels.
(function () {
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.view-source-btn');
    if (!btn) return;
    var block = btn.parentElement.querySelector('.source-block');
    var open = block.hasAttribute('data-open');
    if (open) { block.removeAttribute('data-open'); } else { block.setAttribute('data-open', ''); }
    btn.setAttribute('aria-expanded', String(!open));
  });
  window.kheDocs = {
    bindOutput: function (editorId, outputId) {
      var out = document.getElementById(outputId);
      var render = function () {
        var ed = window.kHtmlEditor.get(editorId);
        if (ed && out) out.textContent = ed.getContent();
      };
      var ed = window.kHtmlEditor.get(editorId);
      if (ed) {
        ed.on('init change input undo redo SetContent', render);
        render();
      }
    },
    escape: function (html) {
      return html.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; });
    }
  };
})();
