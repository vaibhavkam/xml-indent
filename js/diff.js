'use strict';
document.addEventListener('DOMContentLoaded', () => {
  initLineNumbers('xmlA');
  initLineNumbers('xmlB');
});

let debounceTimer;

const xmlA       = document.getElementById('xmlA');
const xmlB       = document.getElementById('xmlB');
const statusA    = document.getElementById('statusA');
const statusB    = document.getElementById('statusB');
const statsA     = document.getElementById('statsA');
const statsB     = document.getElementById('statsB');
const diffOutput = document.getElementById('diffOutput');
const diffSummary= document.getElementById('diffSummary');
const resultPanel= document.getElementById('resultPanel');
const errorEl    = document.getElementById('errorMsg');

function onInput() {
  clearTimeout(debounceTimer);
  const rawA = xmlA.value.trim();
  const rawB = xmlB.value.trim();

  if (!rawA) {
    statusA.className = 'status-badge idle'; statusA.textContent = '';
    statsA.style.cssText = ''; statsA.textContent = '';
    clearGutterHighlights('xmlA');
  } else {
    const res = parseXML(rawA);
    if (res.error) {
      setStatus(statusA, 'invalid', '✗ Invalid');
      statsA.style.cssText = ''; statsA.textContent = '';
      highlightErrorLine('xmlA', res.line);
    } else {
      setStatus(statusA, 'valid', '✓ Valid');
      statsA.style.cssText = ''; statsA.textContent = '';
      highlightErrorLine('xmlA', null);
    }
  }

  if (!rawB) {
    statusB.className = 'status-badge idle'; statusB.textContent = '';
    statsB.style.cssText = ''; statsB.textContent = '';
    clearGutterHighlights('xmlB');
  } else {
    const res = parseXML(rawB);
    if (res.error) {
      setStatus(statusB, 'invalid', '✗ Invalid');
      statsB.style.cssText = ''; statsB.textContent = '';
      highlightErrorLine('xmlB', res.line);
    } else {
      setStatus(statusB, 'valid', '✓ Valid');
      statsB.style.cssText = ''; statsB.textContent = '';
      highlightErrorLine('xmlB', null);
    }
  }

  showError(null);
  if (rawA && rawB) {
    debounceTimer = setTimeout(diffXML, 600);
  } else {
    resultPanel.style.display = 'none';
  }
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

function diffXML() {
  const rawA = xmlA.value.trim();
  const rawB = xmlB.value.trim();

  const resA = parseXML(rawA);
  const resB = parseXML(rawB);

  if (resA.error || resB.error) {
    const parts = [];
    if (resA.error) parts.push(`Source — ${resA.error}${resA.line ? ' (line ' + resA.line + ')' : ''}`);
    if (resB.error) parts.push(`Target — ${resB.error}${resB.line ? ' (line ' + resB.line + ')' : ''}`);
    showError(parts.join('\n'));
    resultPanel.style.display = 'none';
    return;
  }

  showError(null);
  setStatus(statusA, 'valid', '✓ Valid');
  setStatus(statusB, 'valid', '✓ Valid');

  statsA.style.cssText = '';
  statsB.style.cssText = '';
  statsA.textContent = statLine(rawA);
  statsB.textContent = statLine(rawB);

  const diffs = [];
  diffNodes(resA.doc.documentElement, resB.doc.documentElement, '', diffs);
  renderDiff(diffs);
}

function diffNodes(nodeA, nodeB, path, diffs) {
  if (!nodeA && !nodeB) return;

  const tagA = nodeA ? nodeA.tagName : null;
  const tagB = nodeB ? nodeB.tagName : null;
  const p = path || (tagA || tagB);

  if (!nodeA) { diffs.push({ type: 'added', path: p, value: serializeCompact(nodeB) }); return; }
  if (!nodeB) { diffs.push({ type: 'removed', path: p, value: serializeCompact(nodeA) }); return; }
  if (tagA !== tagB) {
    diffs.push({ type: 'changed', path: p, from: `<${tagA}>`, to: `<${tagB}>` });
    return;
  }

  // Compare attributes
  const attrsA = attrMap(nodeA);
  const attrsB = attrMap(nodeB);
  const allAttrs = new Set([...Object.keys(attrsA), ...Object.keys(attrsB)]);
  allAttrs.forEach(attr => {
    const ap = `${p}/@${attr}`;
    if (!(attr in attrsA)) diffs.push({ type: 'added',   path: ap, value: attrsB[attr] });
    else if (!(attr in attrsB)) diffs.push({ type: 'removed', path: ap, value: attrsA[attr] });
    else if (attrsA[attr] !== attrsB[attr]) diffs.push({ type: 'changed', path: ap, from: attrsA[attr], to: attrsB[attr] });
  });

  // Compare child elements by tag name
  const childrenA = Array.from(nodeA.children);
  const childrenB = Array.from(nodeB.children);

  // Group children by tag
  const groupA = groupByTag(childrenA);
  const groupB = groupByTag(childrenB);
  const allTags = new Set([...Object.keys(groupA), ...Object.keys(groupB)]);

  allTags.forEach(tag => {
    const listA = groupA[tag] || [];
    const listB = groupB[tag] || [];
    const len = Math.max(listA.length, listB.length);
    for (let i = 0; i < len; i++) {
      const childPath = `${p}/${tag}${len > 1 ? '[' + (i + 1) + ']' : ''}`;
      diffNodes(listA[i] || null, listB[i] || null, childPath, diffs);
    }
  });

  // Compare text content (only for leaf nodes)
  if (childrenA.length === 0 && childrenB.length === 0) {
    const textA = nodeA.textContent.trim();
    const textB = nodeB.textContent.trim();
    if (textA !== textB) {
      diffs.push({ type: 'changed', path: `${p}/text()`, from: textA, to: textB });
    }
  }
}

function groupByTag(children) {
  const map = {};
  children.forEach(c => {
    if (!map[c.tagName]) map[c.tagName] = [];
    map[c.tagName].push(c);
  });
  return map;
}

function attrMap(node) {
  const m = {};
  for (const a of node.attributes) m[a.name] = a.value;
  return m;
}

function serializeCompact(node) {
  const tag = node.tagName;
  let attrs = '';
  for (const a of node.attributes) attrs += ` ${a.name}="${a.value}"`;
  if (node.children.length === 0) {
    const text = node.textContent.trim();
    if (!text) return `<${tag}${attrs}/>`;
    return `<${tag}${attrs}>${text}</${tag}>`;
  }
  return `<${tag}${attrs}>...</${tag}>`;
}

function renderDiff(diffs) {
  resultPanel.style.display = '';
  clearGutterHighlights('xmlA');
  clearGutterHighlights('xmlB');

  if (diffs.length === 0) {
    diffOutput.innerHTML = `<div style="padding:24px; text-align:center; color:var(--success); font-size:1rem; font-weight:600;">✓ XML documents are identical</div>`;
    const nodiff = `<span style="color:var(--success);">✓ Identical</span>`;
    diffSummary.innerHTML = nodiff;
    statsA.style.cssText = '';
    statsB.style.cssText = '';
    statsA.innerHTML = nodiff;
    statsB.innerHTML = nodiff;
    smoothScrollTo(resultPanel);
    return;
  }

  const added   = diffs.filter(d => d.type === 'added').length;
  const removed = diffs.filter(d => d.type === 'removed').length;
  const changed = diffs.filter(d => d.type === 'changed').length;

  const summaryHtml = [
    added   ? `<span style="color:var(--success);">+${added} added</span>`   : '',
    removed ? `<span style="color:var(--error);">−${removed} removed</span>` : '',
    changed ? `<span style="color:var(--warning);">~${changed} changed</span>` : '',
  ].join(' ');

  diffSummary.innerHTML = summaryHtml;
  statsA.style.cssText = '';
  statsB.style.cssText = '';
  statsA.innerHTML = summaryHtml;
  statsB.innerHTML = summaryHtml;

  diffOutput.innerHTML = diffs.map(d => {
    const cls  = d.type === 'added' ? 'diff-added' : d.type === 'removed' ? 'diff-removed' : 'diff-changed';
    const icon = d.type === 'added' ? '+' : d.type === 'removed' ? '−' : '~';
    const label = d.type === 'changed'
      ? `<span class="diff-key">${escapeHTML(d.path)}</span>: ${escapeHTML(String(d.from))} → ${escapeHTML(String(d.to))}`
      : `<span class="diff-key">${escapeHTML(d.path)}</span>: ${escapeHTML(String(d.value))}`;
    return `<span class="diff-line ${cls}">${icon} ${label}</span>`;
  }).join('');

  smoothScrollTo(resultPanel);
}

function cleanParseError(msg) {
  return msg
    .replace(/This page contains the following errors:\s*/i, '')
    .replace(/Below is a rendering.*$/s, '')
    .trim().split('\n')[0].trim();
}

function clearSource() {
  xmlA.value = '';
  statusA.className = 'status-badge idle'; statusA.textContent = '';
  statsA.textContent = ''; statsA.style.cssText = '';
  refreshLineNumbers('xmlA');
  clearGutterHighlights('xmlA');
  resultPanel.style.display = 'none';
  showError(null);
  statsB.textContent = ''; statsB.style.cssText = '';
}

function clearTarget() {
  xmlB.value = '';
  statusB.className = 'status-badge idle'; statusB.textContent = '';
  statsB.textContent = ''; statsB.style.cssText = '';
  refreshLineNumbers('xmlB');
  clearGutterHighlights('xmlB');
  resultPanel.style.display = 'none';
  showError(null);
  statsA.textContent = ''; statsA.style.cssText = '';
}

function clearAll() { clearSource(); clearTarget(); }

function clearGutterHighlights(textareaId) {
  const gutter = document.getElementById('gutter-' + textareaId);
  if (!gutter) return;
  Array.from(gutter.children).forEach(d => d.style.cssText = '');
}

function smoothScrollTo(el) {
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function statLine(text) {
  if (!text) return '';
  const lines = text.split('\n').length;
  const bytes = new Blob([text]).size;
  return `${lines} lines · ${bytes < 1024 ? bytes + ' B' : (bytes / 1024).toFixed(1) + ' KB'}`;
}

function showError(msg) {
  if (msg) {
    errorEl.innerHTML = msg.split('\n').map(l => `⚠ ${escapeHTML(l)}`).join('<br>');
    errorEl.classList.add('visible');
  } else {
    errorEl.classList.remove('visible');
  }
}

function setStatus(el, type, text) {
  el.className = 'status-badge ' + type;
  el.textContent = text;
}

function escapeHTML(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function loadSample() {
  xmlA.value = `<?xml version="1.0" encoding="UTF-8"?>
<library>
  <book id="1" genre="fiction">
    <title>The Great Gatsby</title>
    <author>F. Scott Fitzgerald</author>
    <year>1925</year>
    <available>true</available>
  </book>
  <book id="2" genre="non-fiction">
    <title>Sapiens</title>
    <author>Yuval Noah Harari</author>
    <year>2011</year>
  </book>
</library>`;

  xmlB.value = `<?xml version="1.0" encoding="UTF-8"?>
<library>
  <book id="1" genre="literary-fiction">
    <title>The Great Gatsby</title>
    <author>F. Scott Fitzgerald</author>
    <year>1925</year>
    <available>false</available>
  </book>
  <book id="2" genre="non-fiction">
    <title>Sapiens: A Brief History</title>
    <author>Yuval Noah Harari</author>
    <year>2011</year>
    <rating>4.8</rating>
  </book>
</library>`;

  xmlA.dispatchEvent(new InputEvent('input', { bubbles: true }));
  xmlB.dispatchEvent(new InputEvent('input', { bubbles: true }));
  diffXML();
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}
