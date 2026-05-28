'use strict';
document.addEventListener('DOMContentLoaded', () => {
  initLineNumbers('inputXML');
  document.getElementById('xpathExpr').addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      runXPath();
    }
  });
});

const inputEl      = document.getElementById('inputXML');
const xpathExpr    = document.getElementById('xpathExpr');
const resultArea   = document.getElementById('resultArea');
const inputStatus  = document.getElementById('inputStatus');
const inputStats   = document.getElementById('inputStats');
const outputStatus = document.getElementById('outputStatus');

let parsedDoc = null;
let debounceTimer;

function onInput() {
  clearTimeout(debounceTimer);
  const v = inputEl.value;
  if (v) {
    const lines = v.split('\n').length;
    inputStats.textContent = `${lines} lines · ${v.length} chars · ${formatBytes(new Blob([v]).size)}`;
    debounceTimer = setTimeout(parseXMLDoc, 400);
  } else {
    inputStats.textContent = '';
    inputStatus.className = 'status-badge idle';
    inputStatus.textContent = '';
    parsedDoc = null;
    clearResult();
  }
}

function parseXMLDoc() {
  const raw = inputEl.value.trim();
  if (!raw) { parsedDoc = null; clearResult(); return; }

  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, 'application/xml');
  const parseError = doc.querySelector('parsererror');

  if (parseError) {
    parsedDoc = null;
    const msg = cleanParseError(parseError.textContent || 'XML parse error');
    const lineMatch = (parseError.textContent || '').match(/line[:\s]+(\d+)/i);
    highlightErrorLine('inputXML', lineMatch ? parseInt(lineMatch[1]) : null);
    setStatus(inputStatus, 'invalid', '✗ Invalid XML');
    showError(msg);
  } else {
    parsedDoc = doc;
    highlightErrorLine('inputXML', null);
    setStatus(inputStatus, 'valid', '✓ Valid XML');
    if (xpathExpr.value.trim()) runXPath();
    else clearResult();
  }
}

function runXPath() {
  const expr = xpathExpr.value.trim();
  if (!expr) { clearResult(); return; }
  if (!parsedDoc) {
    showError('Parse valid XML first');
    return;
  }

  try {
    const result = parsedDoc.evaluate(expr, parsedDoc, null, XPathResult.ANY_TYPE, null);
    renderResult(result, expr);
  } catch (e) {
    showError('XPath error: ' + e.message);
    setStatus(outputStatus, 'invalid', '✗ Error');
  }
}

function renderResult(result, expr) {
  const type = result.resultType;
  let html = '';
  let count = 0;

  if (type === XPathResult.NUMBER_TYPE) {
    html = renderScalar('Number', result.numberValue);
    count = 1;
  } else if (type === XPathResult.STRING_TYPE) {
    html = renderScalar('String', escapeHTML(result.stringValue));
    count = 1;
  } else if (type === XPathResult.BOOLEAN_TYPE) {
    html = renderScalar('Boolean', result.booleanValue ? 'true' : 'false');
    count = 1;
  } else {
    // node-set
    const nodes = [];
    let node;
    while ((node = result.iterateNext())) nodes.push(node);
    count = nodes.length;

    if (count === 0) {
      html = `<div style="padding:20px; text-align:center; color:var(--text-muted); font-size:0.9rem;">No matching nodes</div>`;
    } else {
      html = nodes.map((n, i) => renderNode(n, i + 1, count)).join('');
    }
  }

  const summary = `<div style="font-size:0.8rem; color:var(--text-muted); padding:8px 16px; border-bottom:1px solid var(--border); background:var(--primary-light);">
    XPath: <code style="font-family:var(--font-mono); color:var(--primary);">${escapeHTML(expr)}</code> — <strong>${count}</strong> result${count !== 1 ? 's' : ''}
  </div>`;

  resultArea.innerHTML = summary + `<div style="padding:8px 0;">${html}</div>`;
  setStatus(outputStatus, count > 0 ? 'valid' : 'idle', count > 0 ? `✓ ${count} match${count !== 1 ? 'es' : ''}` : '0 matches');
}

function renderNode(node, idx, total) {
  const type = nodeTypeName(node.nodeType);
  let content = '';
  let label = '';

  if (node.nodeType === Node.ELEMENT_NODE) {
    label = `&lt;${escapeHTML(node.tagName)}&gt;`;
    // serialize element compactly
    content = escapeHTML(serializeCompact(node));
  } else if (node.nodeType === Node.ATTRIBUTE_NODE) {
    label = `@${escapeHTML(node.name)}`;
    content = escapeHTML(node.value);
  } else if (node.nodeType === Node.TEXT_NODE) {
    label = 'text()';
    content = escapeHTML(node.textContent.trim());
  } else {
    label = type;
    content = escapeHTML(node.textContent.trim());
  }

  return `<div style="padding:10px 16px; ${idx < total ? 'border-bottom:1px solid var(--border);' : ''}">
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
      <span style="font-size:0.7rem; background:var(--primary-light); color:var(--primary); padding:2px 8px; border-radius:var(--radius-sm); font-weight:600; text-transform:uppercase;">${type}</span>
      <code style="font-family:var(--font-mono); font-size:0.85rem; color:var(--primary); font-weight:600;">${label}</code>
    </div>
    <pre style="font-family:var(--font-mono); font-size:0.82rem; color:var(--text); background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:8px 12px; overflow-x:auto; white-space:pre-wrap; word-break:break-all;">${content}</pre>
  </div>`;
}

function renderScalar(type, value) {
  return `<div style="padding:10px 16px;">
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
      <span style="font-size:0.7rem; background:var(--primary-light); color:var(--primary); padding:2px 8px; border-radius:var(--radius-sm); font-weight:600; text-transform:uppercase;">${type}</span>
    </div>
    <pre style="font-family:var(--font-mono); font-size:0.9rem; color:var(--text); background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:8px 12px;">${value}</pre>
  </div>`;
}

function nodeTypeName(type) {
  const names = { 1:'Element', 2:'Attribute', 3:'Text', 4:'CDATA', 7:'PI', 8:'Comment', 9:'Document' };
  return names[type] || 'Node';
}

function serializeCompact(node) {
  const tag = node.tagName;
  let attrs = '';
  for (const a of node.attributes) attrs += ` ${a.name}="${a.value}"`;
  const children = Array.from(node.childNodes);
  const hasElements = children.some(c => c.nodeType === Node.ELEMENT_NODE);
  if (node.children.length === 0) {
    const text = node.textContent.trim();
    if (!text) return `<${tag}${attrs}/>`;
    return `<${tag}${attrs}>${text}</${tag}>`;
  }
  if (hasElements) return `<${tag}${attrs}>...</${tag}>`;
  return `<${tag}${attrs}>${node.textContent.trim()}</${tag}>`;
}

function showError(msg) {
  resultArea.innerHTML = `
    <div style="padding:20px;">
      <div style="background:rgba(220,38,38,0.08); border:1px solid rgba(220,38,38,0.25); border-radius:var(--radius-sm); padding:14px;">
        <div style="font-family:var(--font-mono); font-size:0.85rem; color:var(--error); line-height:1.6;">${escapeHTML(msg)}</div>
      </div>
    </div>`;
  setStatus(outputStatus, 'invalid', '✗ Error');
}

function clearResult() {
  resultArea.innerHTML = `<div style="padding:20px; color:var(--text-muted); font-size:0.95rem;">Enter an XPath expression above and paste XML on the left.</div>`;
  setStatus(outputStatus, 'idle', '');
}

function cleanParseError(msg) {
  return msg.replace(/This page contains the following errors:\s*/i, '').replace(/Below is a rendering.*$/s, '').trim().split('\n')[0].trim();
}

function setStatus(el, type, text) {
  el.className = 'status-badge ' + type;
  el.textContent = text;
}

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  return (b / 1024).toFixed(1) + ' KB';
}

function escapeHTML(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function clearAll() {
  clearTimeout(debounceTimer);
  inputEl.value = '';
  xpathExpr.value = '';
  parsedDoc = null;
  inputStatus.className = 'status-badge idle';
  inputStatus.textContent = '';
  inputStats.textContent = '';
  highlightErrorLine('inputXML', null);
  refreshLineNumbers('inputXML');
  clearResult();
}

async function pasteFromClipboard() {
  try {
    inputEl.value = await navigator.clipboard.readText();
    inputEl.dispatchEvent(new InputEvent('input', { bubbles: true }));
  } catch { inputEl.focus(); }
}

function loadSample() {
  inputEl.value = `<?xml version="1.0" encoding="UTF-8"?>
<bookstore>
  <book category="fiction">
    <title lang="en">The Great Gatsby</title>
    <author>F. Scott Fitzgerald</author>
    <price>12.99</price>
  </book>
  <book category="fiction">
    <title lang="en">1984</title>
    <author>George Orwell</author>
    <price>9.99</price>
  </book>
  <book category="tech">
    <title lang="en">Clean Code</title>
    <author>Robert C. Martin</author>
    <price>34.99</price>
  </book>
</bookstore>`;
  xpathExpr.value = '//book[@category="fiction"]/title';
  refreshLineNumbers('inputXML');
  parseXMLDoc();
  inputEl.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}
