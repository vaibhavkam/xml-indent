'use strict';
document.addEventListener('DOMContentLoaded', () => {
  initLineNumbers('inputArea');

  document.getElementById('outputArea').addEventListener('mousedown', function() {
    this.focus();
  });

  document.getElementById('outputArea').addEventListener('keydown', e => {
    const isMac = navigator.userAgentData
      ? navigator.userAgentData.platform.toUpperCase().includes('MAC')
      : /Mac|iPhone|iPod|iPad/.test(navigator.platform);
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (!mod) return;
    if (e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      const range = document.createRange();
      range.selectNodeContents(outputEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    if (e.key === 'c' || e.key === 'C') {
      const sel = window.getSelection();
      if (sel && sel.toString()) return;
      e.preventDefault();
      copyOutput();
    }
  });
});

const inputEl      = document.getElementById('inputArea');
const outputEl     = document.getElementById('outputArea');
const inputStatus  = document.getElementById('inputStatus');
const outputStatus = document.getElementById('outputStatus');
const inputStats   = document.getElementById('inputStats');
const outputStats  = document.getElementById('outputStats');
const modeEl       = document.getElementById('convMode');

let debounceTimer;

function onInput() {
  clearTimeout(debounceTimer);
  const v = inputEl.value;
  if (v) {
    const lines = v.split('\n').length;
    inputStats.textContent = `${lines} lines · ${v.length} chars · ${formatBytes(new Blob([v]).size)}`;
    debounceTimer = setTimeout(convert, 400);
  } else {
    inputStats.textContent = '';
    inputStatus.className = 'status-badge idle';
    inputStatus.textContent = '';
    highlightErrorLine('inputArea', null);
    clearOutput();
  }
}

function getMode() { return modeEl.value; }

function convert() {
  const raw = inputEl.value.trim();
  if (!raw) { clearOutput(); return; }
  const mode = getMode();
  if (mode === 'xml2json') xmlToJson(raw);
  else if (mode === 'xml2csv') xmlToCsv(raw);
  else xmlToYaml(raw);
}

function xmlToCsv(raw) {
  const result = parseXML(raw);
  if (result.error) {
    highlightErrorLine('inputArea', result.line);
    showError(result.error, result.line);
    setStatus(inputStatus, 'invalid', '✗ Invalid XML');
    return;
  }
  const obj = xmlNodeToObj(result.doc.documentElement);
  showOutput(objToCsvString(obj), 'csv');
  setStatus(inputStatus, 'valid', '✓ Valid XML');
  highlightErrorLine('inputArea', null);
}

function parseXML(raw) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) {
    const msg = err.textContent || 'XML parse error';
    const lineMatch = msg.match(/line[:\s]+(\d+)/i);
    return { error: cleanParseError(msg), line: lineMatch ? parseInt(lineMatch[1]) : null };
  }
  return { doc };
}

function xmlToJson(raw) {
  const result = parseXML(raw);
  if (result.error) {
    highlightErrorLine('inputArea', result.line);
    showError(result.error, result.line);
    setStatus(inputStatus, 'invalid', '✗ Invalid XML');
    return;
  }
  const json = JSON.stringify(xmlNodeToObj(result.doc.documentElement), null, 2);
  showOutput(json, 'json');
  setStatus(inputStatus, 'valid', '✓ Valid XML');
  highlightErrorLine('inputArea', null);
}

function xmlToYaml(raw) {
  const result = parseXML(raw);
  if (result.error) {
    highlightErrorLine('inputArea', result.line);
    showError(result.error, result.line);
    setStatus(inputStatus, 'invalid', '✗ Invalid XML');
    return;
  }
  const obj = xmlNodeToObj(result.doc.documentElement);
  const yaml = jsyaml.dump(obj, { indent: 2, lineWidth: -1, noRefs: true });
  showOutput(yaml, 'yaml');
  setStatus(inputStatus, 'valid', '✓ Valid XML');
  highlightErrorLine('inputArea', null);
}

function xmlNodeToObj(node) {
  // Text-only leaf
  const children = Array.from(node.children);
  const attrs = {};
  for (const a of node.attributes) attrs[`@${a.name}`] = a.value;
  const hasAttrs = Object.keys(attrs).length > 0;

  if (children.length === 0) {
    const text = node.textContent.trim();
    if (!hasAttrs) return text === '' ? null : text;
    return { ...attrs, '#text': text || null };
  }

  const obj = { ...attrs };
  // Group repeated tag names as arrays
  const tagCounts = {};
  children.forEach(c => { tagCounts[c.tagName] = (tagCounts[c.tagName] || 0) + 1; });

  children.forEach(c => {
    const val = xmlNodeToObj(c);
    if (tagCounts[c.tagName] > 1) {
      if (!Array.isArray(obj[c.tagName])) obj[c.tagName] = [];
      obj[c.tagName].push(val);
    } else {
      obj[c.tagName] = val;
    }
  });
  return obj;
}

// Convert a parsed object/array into CSV. An array becomes rows; a single object
// whose only property is an array of objects uses that array as the rows
// (the common XML "list" shape, e.g. <library><book/>…); otherwise the object is
// emitted as one row. Nested objects flatten to dot-notation columns; scalar
// arrays are joined.
function objToCsvString(data) {
  let rows;
  if (Array.isArray(data)) {
    rows = data;
  } else if (data && typeof data === 'object') {
    const keys = Object.keys(data);
    const arrKey = keys.find(k => Array.isArray(data[k]) && data[k].some(x => x && typeof x === 'object'));
    rows = (keys.length === 1 && arrKey) ? data[arrKey] : [data];
  } else {
    rows = [data];
  }
  rows = rows.map(r => (r !== null && typeof r === 'object' && !Array.isArray(r)) ? flattenForCsv(r) : { value: r });
  const cols = [];
  rows.forEach(r => Object.keys(r).forEach(k => { if (!cols.includes(k)) cols.push(k); }));
  const esc = v => {
    if (v === null || v === undefined) return '';
    let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [cols.map(esc).join(',')];
  rows.forEach(r => lines.push(cols.map(c => esc(r[c])).join(',')));
  return lines.join('\r\n');
}

function flattenForCsv(obj, prefix, out) {
  out = out || {}; prefix = prefix || '';
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flattenForCsv(v, key, out);
    else if (Array.isArray(v) && v.every(x => x === null || typeof x !== 'object')) out[key] = v.join('; ');
    else out[key] = v;
  }
  return out;
}

function cleanParseError(msg) {
  return msg
    .replace(/This page contains the following errors:\s*/i, '')
    .replace(/Below is a rendering.*$/s, '')
    .trim().split('\n')[0].trim();
}

function showOutput(text, type) {
  outputEl.style.cssText = 'white-space:pre; overflow:auto; cursor:text; user-select:text; padding:16px;';
  outputEl.textContent = text;
  const lines = text.split('\n').length;
  const bytes = new Blob([text]).size;
  setStatus(outputStatus, 'valid', '✓ Converted');
  outputStats.textContent = `${lines} lines · ${formatBytes(bytes)}`;
}

function showError(message, lineNum) {
  outputEl.style.cssText = 'white-space:normal; overflow:auto; padding:20px; display:flex; flex-direction:column; gap:12px;';
  outputEl.innerHTML = `
    <div style="background:rgba(220,38,38,0.08); border:1px solid rgba(220,38,38,0.25); border-radius:var(--radius-sm); padding:16px; display:flex; align-items:center; gap:10px;">
      <span style="font-size:1.4rem; color:var(--error);">✗</span>
      <div>
        <div style="font-size:1rem; font-weight:700; color:var(--error); font-family:var(--font-mono);">Conversion failed</div>
        <div style="font-size:0.82rem; color:var(--text-muted); margin-top:2px;">Fix the error in the input</div>
      </div>
    </div>
    <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:14px;">
      <div style="font-family:var(--font-mono); font-size:0.85rem; color:var(--error); line-height:1.6;">${escapeHTML(message)}</div>
      ${lineNum ? `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:8px; padding-top:8px; border-top:1px solid var(--border);">📍 Line ${lineNum}</div>` : ''}
    </div>`;
  setStatus(outputStatus, 'invalid', '✗ Error');
  outputStats.textContent = '';
}

function clearOutput() {
  const m = getMode();
  const hint = m === 'xml2json' ? 'JSON output will appear here...' : m === 'xml2csv' ? 'CSV output will appear here...' : 'YAML output will appear here...';
  outputEl.innerHTML = `<span style="color:var(--text-muted);">${hint}</span>`;
  outputEl.style.cssText = 'white-space:pre; overflow:auto; cursor:text; user-select:text; padding:16px;';
  setStatus(outputStatus, 'idle', '');
  outputStats.textContent = '';
}

function clearAll() {
  clearTimeout(debounceTimer);
  inputEl.value = '';
  inputStatus.className = 'status-badge idle';
  inputStatus.textContent = '';
  inputStats.textContent = '';
  highlightErrorLine('inputArea', null);
  refreshLineNumbers('inputArea');
  clearOutput();
}

function updatePlaceholder() {
  inputEl.placeholder = 'Paste your XML here...';
  clearOutput();
  if (inputEl.value.trim()) convert();
}

function copyOutput() {
  const text = outputEl.textContent;
  if (!text || outputEl.querySelector('[style*="color:var(--text-muted)"]')) return;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard'));
  } else {
    const ta = document.createElement('textarea'); ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;'; document.body.appendChild(ta);
    ta.focus(); ta.select();
    try { document.execCommand('copy'); showToast('Copied to clipboard'); } catch { showToast('Press Ctrl+C / Cmd+C to copy'); }
    document.body.removeChild(ta);
  }
}

function downloadOutput() {
  const text = outputEl.textContent;
  if (!text) return;
  const mode = getMode();
  const ext = mode === 'xml2json' ? 'json' : mode === 'xml2csv' ? 'csv' : 'yaml';
  const type = mode === 'xml2json' ? 'application/json' : mode === 'xml2csv' ? 'text/csv' : 'application/x-yaml';
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `converted.${ext}`; a.click();
  URL.revokeObjectURL(url);
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
  refreshLineNumbers('inputArea');
  convert();
  inputEl.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

function setStatus(el, type, text) { el.className = 'status-badge ' + type; el.textContent = text; }
function formatBytes(b) { return b < 1024 ? b + ' B' : (b / 1024).toFixed(1) + ' KB'; }
function escapeHTML(str) { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}
