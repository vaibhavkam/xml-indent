'use strict';
document.addEventListener('DOMContentLoaded', () => initLineNumbers('inputXML'));

const inputEl      = document.getElementById('inputXML');
const outputEl     = document.getElementById('outputArea');
const inputStatus  = document.getElementById('inputStatus');
const outputStatus = document.getElementById('outputStatus');
const inputStats   = document.getElementById('inputStats');
const outputStats  = document.getElementById('outputStats');

let debounceTimer;

function onInput() {
  clearTimeout(debounceTimer);
  const v = inputEl.value;
  if (v) {
    const lines = v.split('\n').length;
    inputStats.textContent = `${lines} lines · ${v.length} chars · ${formatBytes(new Blob([v]).size)}`;
    debounceTimer = setTimeout(minifyXML, 400);
  } else {
    inputStats.textContent = '';
    inputStatus.className = 'status-badge idle';
    inputStatus.textContent = '';
    highlightErrorLine('inputXML', null);
    clearOutput();
  }
}

function minifyXML() {
  const raw = inputEl.value.trim();
  if (!raw) { clearOutput(); return; }

  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, 'application/xml');
  const parseError = doc.querySelector('parsererror');

  if (parseError) {
    const msg = cleanParseError(parseError.textContent || 'XML parse error');
    const lineMatch = (parseError.textContent || '').match(/line[:\s]+(\d+)/i);
    const lineNum = lineMatch ? parseInt(lineMatch[1]) : null;
    highlightErrorLine('inputXML', lineNum);
    outputEl.style.cssText = 'white-space:normal; overflow:auto; outline:none; padding:20px; display:flex; flex-direction:column; gap:12px;';
    outputEl.innerHTML = `
      <div style="background:rgba(220,38,38,0.08); border:1px solid rgba(220,38,38,0.25); border-radius:var(--radius-sm); padding:16px; display:flex; align-items:center; gap:10px;">
        <span style="font-size:1.4rem; color:var(--error);">✗</span>
        <div>
          <div style="font-size:1rem; font-weight:700; color:var(--error); font-family:var(--font-mono);">Invalid XML</div>
          <div style="font-size:0.82rem; color:var(--text-muted); margin-top:2px;">Fix the error in the input</div>
        </div>
      </div>
      <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:14px;">
        <div style="font-family:var(--font-mono); font-size:0.85rem; color:var(--error); line-height:1.6;">${escapeHTML(msg)}</div>
        ${lineNum ? `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:8px; padding-top:8px; border-top:1px solid var(--border);">📍 Line ${lineNum}</div>` : ''}
      </div>`;
    setStatus(inputStatus, 'invalid', '✗ Invalid');
    setStatus(outputStatus, 'invalid', '✗ Error');
    outputStats.textContent = '';
    return;
  }

  // Minify: strip whitespace-only text nodes and XML declaration
  const minified = minifyNode(doc.documentElement);

  outputEl.textContent = minified;
  outputEl.style.cssText = 'white-space:pre-wrap; word-break:break-all; overflow:auto; cursor:text; user-select:text; outline:none; padding:16px;';
  highlightErrorLine('inputXML', null);
  setStatus(inputStatus, 'valid', '✓ Valid');
  setStatus(outputStatus, 'valid', '✓ Minified');
  const origBytes = new Blob([raw]).size;
  const miniBytes = new Blob([minified]).size;
  const saved = origBytes - miniBytes;
  const pct = ((saved / origBytes) * 100).toFixed(1);
  outputStats.textContent = `${formatBytes(miniBytes)}${saved > 0 ? ' · ↓ ' + formatBytes(saved) + ' saved (' + pct + '%)' : ''}`;
}

function minifyNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = node.textContent.trim();
    return t ? escapeXMLText(t) : '';
  }
  if (node.nodeType === Node.COMMENT_NODE) return '';
  if (node.nodeType === Node.CDATA_SECTION_NODE) return `<![CDATA[${node.textContent}]]>`;
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const tag = node.tagName;
  let attrs = '';
  for (const a of node.attributes) attrs += ` ${a.name}="${escapeXMLAttr(a.value)}"`;

  const children = Array.from(node.childNodes).map(minifyNode).join('');
  if (!children) return `<${tag}${attrs}/>`;
  return `<${tag}${attrs}>${children}</${tag}>`;
}

function escapeXMLText(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function escapeXMLAttr(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function cleanParseError(msg) {
  return msg.replace(/This page contains the following errors:\s*/i, '').replace(/Below is a rendering.*$/s, '').trim().split('\n')[0].trim();
}

function escapeHTML(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function clearOutput() {
  outputEl.innerHTML = '<span style="color:var(--text-muted);">Minified XML will appear here...</span>';
  outputEl.style.cssText = 'white-space:pre-wrap; word-break:break-all; overflow:auto; cursor:text; user-select:text; outline:none; padding:16px;';
  setStatus(outputStatus, 'idle', '');
  outputStats.textContent = '';
}

function clearAll() {
  clearTimeout(debounceTimer);
  inputEl.value = '';
  clearOutput();
  inputStatus.className = 'status-badge idle';
  inputStatus.textContent = '';
  inputStats.textContent = '';
  highlightErrorLine('inputXML', null);
  refreshLineNumbers('inputXML');
}

function setStatus(el, type, text) {
  el.className = 'status-badge ' + type;
  el.textContent = text;
}

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  return (b / 1024).toFixed(1) + ' KB';
}

function copyOutput() {
  const text = outputEl.textContent;
  if (!text) return;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard'));
  } else {
    const ta = document.createElement('textarea'); ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;'; document.body.appendChild(ta);
    ta.focus(); ta.select(); try { document.execCommand('copy'); showToast('Copied to clipboard'); } catch { showToast('Press Ctrl+C / Cmd+C to copy'); }
    document.body.removeChild(ta);
  }
}

function downloadOutput() {
  const text = outputEl.textContent;
  if (!text) return;
  const blob = new Blob([text], { type: 'application/xml' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'minified.xml'; a.click();
  URL.revokeObjectURL(url);
}

async function pasteFromClipboard() {
  try {
    inputEl.value = await navigator.clipboard.readText();
    onInput();
  } catch { inputEl.focus(); }
}

function loadSample() {
  inputEl.value = `<?xml version="1.0" encoding="UTF-8"?>
<library>
  <book id="1" genre="fiction">
    <title>The Great Gatsby</title>
    <author>F. Scott Fitzgerald</author>
    <year>1925</year>
  </book>
  <book id="2" genre="non-fiction">
    <title>Sapiens</title>
    <author>Yuval Noah Harari</author>
    <year>2011</year>
  </book>
</library>`;
  onInput();
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}
