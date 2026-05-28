'use strict';

const _lineNumberInstances = {};

function initLineNumbers(textareaId) {
  const ta     = document.getElementById(textareaId);
  const gutter = document.getElementById('gutter-' + textareaId);
  if (!ta || !gutter) return;

  function update() {
    const text  = ta.value;
    const lines = text ? text.split('\n').length : 1;
    while (gutter.children.length < lines) {
      const d = document.createElement('div');
      d.textContent = gutter.children.length + 1;
      gutter.appendChild(d);
    }
    while (gutter.children.length > lines) {
      gutter.removeChild(gutter.lastChild);
    }
    syncScroll();
  }

  function syncScroll() {
    gutter.scrollTop = ta.scrollTop;
  }

  ta.addEventListener('input',  update);
  ta.addEventListener('keyup',  update);
  ta.addEventListener('paste',  () => requestAnimationFrame(update));
  ta.addEventListener('scroll', syncScroll);

  _lineNumberInstances[textareaId] = { update, ta, gutter };
  update();
}

function refreshLineNumbers(textareaId) {
  const inst = _lineNumberInstances[textareaId];
  if (inst) { inst.update(); return; }
  const ta     = document.getElementById(textareaId);
  const gutter = document.getElementById('gutter-' + textareaId);
  if (!ta || !gutter) return;
  const lines = ta.value ? ta.value.split('\n').length : 1;
  while (gutter.children.length < lines) {
    const d = document.createElement('div');
    d.textContent = gutter.children.length + 1;
    gutter.appendChild(d);
  }
  while (gutter.children.length > lines) gutter.removeChild(gutter.lastChild);
  ta.scrollTop = 0;
  gutter.scrollTop = 0;
}

function highlightErrorLine(textareaId, lineNumber) {
  const inst = _lineNumberInstances[textareaId];
  if (!inst) return;

  Array.from(inst.gutter.children).forEach(d => d.style.cssText = '');

  if (!lineNumber || lineNumber < 1) return;

  const idx = lineNumber - 1;
  if (inst.gutter.children[idx]) {
    inst.gutter.children[idx].style.cssText =
      'background:rgba(220,38,38,0.20);color:var(--error);font-weight:700;border-radius:2px;';
  }

  const lines     = inst.ta.value.split('\n');
  const lineHeight = parseFloat(getComputedStyle(inst.ta).lineHeight);
  const padding   = parseFloat(getComputedStyle(inst.ta).paddingTop);
  inst.ta.scrollTop = Math.max(0, (lineNumber - 3) * lineHeight + padding);
  inst.gutter.scrollTop = inst.ta.scrollTop;
}
