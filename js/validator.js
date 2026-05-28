'use strict';
document.addEventListener('DOMContentLoaded', () => initLineNumbers('inputXML'));

const inputEl      = document.getElementById('inputXML');
const resultArea   = document.getElementById('resultArea');
const inputStatus  = document.getElementById('inputStatus');
const inputStats   = document.getElementById('inputStats');
const outputStatus = document.getElementById('outputStatus');
const placeholder  = document.getElementById('placeholderMsg');

let debounceTimer;

function onInput() {
  clearTimeout(debounceTimer);
  const v = inputEl.value;
  if (v) {
    const lines = v.split('\n').length;
    inputStats.textContent = `${lines} lines · ${v.length} chars · ${formatBytes(new Blob([v]).size)}`;
  } else {
    inputStats.textContent = '';
    inputStatus.className = 'status-badge idle';
    inputStatus.textContent = '';
  }
  debounceTimer = setTimeout(validateXML, 500);
}

function validateXML() {
  const raw = inputEl.value.trim();
  if (!raw) { resetResult(); return; }

  placeholder.style.display = 'none';

  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, 'application/xml');
  const parseError = doc.querySelector('parsererror');

  if (parseError) {
    const msg = parseError.textContent || 'XML parse error';
    const cleanMsg = cleanParseError(msg);
    const lineMatch = msg.match(/line[:\s]+(\d+)/i);
    const lineNum = lineMatch ? parseInt(lineMatch[1]) : null;
    const colMatch = msg.match(/column[:\s]+(\d+)/i);
    const colNum = colMatch ? parseInt(colMatch[1]) : null;
    showInvalid(cleanMsg, lineNum, colNum);
  } else {
    showValid(doc, raw);
  }
}

function showValid(doc, raw) {
  setStatus(inputStatus, 'valid', '✓ Valid');
  highlightErrorLine('inputXML', null);

  const root = doc.documentElement;
  const elemCount = doc.querySelectorAll('*').length;
  const attrCount = countAttributes(doc.documentElement);
  const depth = getDepth(doc.documentElement);
  const sizeBytes = new Blob([raw]).size;

  resultArea.innerHTML = `
    <div style="background:rgba(5,150,105,0.08); border:1px solid rgba(5,150,105,0.25); border-radius:var(--radius-sm); padding:16px; margin-bottom:16px; display:flex; align-items:center; gap:10px;">
      <span style="font-size:1.4rem; line-height:1; color:var(--success);">✓</span>
      <div>
        <div style="font-size:1rem; font-weight:700; color:var(--success);">Valid XML</div>
        <div style="font-size:0.82rem; color:var(--text-muted); margin-top:2px;">No syntax errors found · Root element: &lt;${escapeHTML(root.tagName)}&gt;</div>
      </div>
    </div>
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(100px,1fr)); gap:10px;">
      ${stat('Elements', elemCount)}
      ${stat('Attributes', attrCount)}
      ${stat('Depth', depth)}
      ${stat('Size', formatBytes(sizeBytes))}
    </div>
  `;
  setStatus(outputStatus, 'valid', '✓ Valid');
}

function stat(label, value) {
  return `
    <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:12px; text-align:center;">
      <div style="font-size:1.3rem; font-weight:700; color:var(--primary);">${value}</div>
      <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">${label}</div>
    </div>`;
}

function showInvalid(message, lineNum, colNum) {
  setStatus(inputStatus, 'invalid', '✗ Invalid');
  highlightErrorLine('inputXML', lineNum);

  const locInfo = lineNum ? `Line ${lineNum}${colNum ? ', Column ' + colNum : ''}` : '';

  resultArea.innerHTML = `
    <div style="background:rgba(220,38,38,0.08); border:1px solid rgba(220,38,38,0.25); border-radius:var(--radius-sm); padding:16px; margin-bottom:16px; display:flex; align-items:center; gap:10px;">
      <span style="font-size:1.4rem; line-height:1; color:var(--error);">✗</span>
      <div>
        <div style="font-size:1rem; font-weight:700; color:var(--error);">Invalid XML</div>
        <div style="font-size:0.82rem; color:var(--text-muted); margin-top:2px;">Fix the error below</div>
      </div>
    </div>
    <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:14px;">
      <div style="font-family:var(--font-mono); font-size:0.85rem; color:var(--error); line-height:1.6;">${escapeHTML(message)}</div>
      ${locInfo ? `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:8px; padding-top:8px; border-top:1px solid var(--border);">📍 ${locInfo}</div>` : ''}
    </div>
  `;
  setStatus(outputStatus, 'invalid', '✗ Invalid');
}

function cleanParseError(msg) {
  return msg.replace(/This page contains the following errors:\s*/i, '').replace(/Below is a rendering.*$/s, '').trim().split('\n')[0].trim();
}

function countAttributes(node) {
  let count = node.attributes ? node.attributes.length : 0;
  for (const child of node.children) count += countAttributes(child);
  return count;
}

function getDepth(node, d = 0) {
  if (!node.children || node.children.length === 0) return d;
  return Math.max(...Array.from(node.children).map(c => getDepth(c, d + 1)));
}

function resetResult() {
  resultArea.innerHTML = '';
  resultArea.appendChild(Object.assign(document.createElement('div'), {
    id: 'placeholderMsg',
    style: 'color:var(--text-muted); font-family:var(--font); font-size:0.95rem;',
    textContent: 'Paste XML on the left — validation runs automatically.'
  }));
  setStatus(outputStatus, 'idle', '—');
}

function clearAll() {
  clearTimeout(debounceTimer);
  inputEl.value = '';
  inputStatus.className = 'status-badge idle';
  inputStatus.textContent = '';
  inputStats.textContent = '';
  highlightErrorLine('inputXML', null);
  refreshLineNumbers('inputXML');
  resetResult();
}

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  return (b / 1024).toFixed(1) + ' KB';
}

function setStatus(el, type, text) {
  el.className = 'status-badge ' + type;
  el.textContent = text;
}

function escapeHTML(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function pasteFromClipboard() {
  try {
    inputEl.value = await navigator.clipboard.readText();
    inputEl.dispatchEvent(new InputEvent('input', { bubbles: true }));
  } catch { inputEl.focus(); }
}

function loadSample(type) {
  if (type === 'valid') {
    inputEl.value = `<?xml version="1.0" encoding="UTF-8"?>
<person>
  <name>Jane Doe</name>
  <age>32</age>
  <email>jane@example.com</email>
  <address>
    <city>San Francisco</city>
    <country>USA</country>
  </address>
</person>`;
  } else {
    inputEl.value = `<?xml version="1.0"?>
<person>
  <name>Jane Doe</name>
  <age>32
  <email>jane@example.com</email>
</person>`;
  }
  refreshLineNumbers('inputXML');
  validateXML();
  inputEl.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}
