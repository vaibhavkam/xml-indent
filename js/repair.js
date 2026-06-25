'use strict';
/* XML Repair — heuristically fix the most common XML breakages, then format.
   Fixes: unescaped & (and bare < where clearly text), smart quotes in markup,
   unquoted attribute values, and unclosed tags (balanced from a tag stack).
   Then re-parses with the browser's XML parser and pretty-prints. */

document.addEventListener('DOMContentLoaded', () => {
  initLineNumbers('inputArea');
  outputEl.addEventListener('mousedown', function () { this.focus(); });
  outputEl.addEventListener('keydown', e => {
    const isMac = navigator.userAgentData
      ? navigator.userAgentData.platform.toUpperCase().includes('MAC')
      : /Mac|iPhone|iPod|iPad/.test(navigator.platform);
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (!mod) return;
    if (e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      const range = document.createRange();
      range.selectNodeContents(outputEl);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    }
    if (e.key === 'c' || e.key === 'C') {
      const sel = window.getSelection();
      if (sel && sel.toString()) return;
      e.preventDefault(); copyOutput();
    }
  });
});

const inputEl      = document.getElementById('inputArea');
const outputEl     = document.getElementById('outputArea');
const inputStatus  = document.getElementById('inputStatus');
const outputStatus = document.getElementById('outputStatus');
const inputStats   = document.getElementById('inputStats');
const fixListEl    = document.getElementById('fixList');

let debounceTimer;

function onInput() {
  clearTimeout(debounceTimer);
  const v = inputEl.value;
  if (v) {
    const lines = v.split('\n').length;
    inputStats.textContent = `${lines} lines · ${v.length} chars`;
    debounceTimer = setTimeout(repair, 350);
  } else {
    inputStats.textContent = '';
    setStatus(inputStatus, 'idle', '');
    highlightErrorLine('inputArea', null);
    clearOutput();
  }
}

// Void/self-closing-by-convention element names are not auto-closed.
function repairXml(src) {
  const fixes = [];
  let s = src;

  // 1. Normalize smart quotes (anywhere — safe for markup, rare in real text)
  const beforeSmart = s;
  s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  if (s !== beforeSmart) fixes.push('Replaced smart quotes with straight quotes');

  // 2. Quote unquoted attribute values inside start tags: <a b=c d=1> → <a b="c" d="1">
  let attrFix = 0;
  s = s.replace(/<([a-zA-Z_][\w:.\-]*)((?:\s+[^<>]*?)?)\s*(\/?)>/g, (m, name, attrPart, slash) => {
    if (!attrPart) return m;
    const fixed = attrPart.replace(/(\s[\w:.\-]+\s*=\s*)([^\s"'<>][^\s<>]*)/g, (mm, lhs, val) => {
      attrFix++;
      return `${lhs}"${val}"`;
    });
    return `<${name}${fixed}${slash ? '/' : ''}>`;
  });
  if (attrFix) fixes.push(`Quoted ${attrFix} unquoted attribute value${attrFix > 1 ? 's' : ''}`);

  // 3. Escape bare ampersands that are not the start of a valid entity
  const beforeAmp = s;
  s = s.replace(/&(?!#\d+;|#x[0-9a-fA-F]+;|[a-zA-Z][a-zA-Z0-9]*;)/g, '&amp;');
  if (s !== beforeAmp) fixes.push('Escaped unescaped & as &amp;');

  // 4. Balance unclosed elements from a tag stack
  const closers = unclosedClosers(s);
  if (closers.length) {
    s += closers.map(t => `</${t}>`).join('');
    fixes.push(`Closed ${closers.length} unclosed tag${closers.length > 1 ? 's' : ''}`);
  }

  return { text: s, fixes };
}

// Walk the markup, skipping comments/CDATA/PI/doctype, and return the list of
// still-open tag names (in the order they must be closed: innermost first).
function unclosedClosers(s) {
  const stack = [];
  const tagRe = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([a-zA-Z_][\w:.\-]*)\s*>|<([a-zA-Z_][\w:.\-]*)(?:\s+[^<>]*?)?(\/?)>/g;
  let m;
  while ((m = tagRe.exec(s)) !== null) {
    const closeName = m[1];
    const openName = m[2];
    const selfClose = m[3];
    if (closeName) {
      // pop to matching open if present
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i] === closeName) { stack.length = i; break; }
      }
    } else if (openName && !selfClose) {
      stack.push(openName);
    }
  }
  return stack.reverse();
}

function repair() {
  const raw = inputEl.value;
  if (!raw.trim()) { clearOutput(); return; }

  const { text, fixes } = repairXml(raw);

  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');
  const errEl = doc.querySelector('parsererror');
  if (errEl) {
    return showUnfixable(cleanParseError(errEl.textContent || 'XML parse error'));
  }

  const declared = text.trimStart().startsWith('<?xml');
  const xmlDecl = declared ? '<?xml version="1.0" encoding="UTF-8"?>\n' : '';
  const formatted = xmlDecl + serializeNode(doc.documentElement, 0, '  ');
  showRepaired(formatted, fixes);
  highlightErrorLine('inputArea', null);
}

function serializeNode(node, depth, indent) {
  const pad = indent.repeat(depth);
  if (node.nodeType === Node.TEXT_NODE) {
    const t = node.textContent.trim();
    return t ? pad + escapeXMLText(t) : '';
  }
  if (node.nodeType === Node.COMMENT_NODE) return `${pad}<!--${node.textContent}-->`;
  if (node.nodeType === Node.CDATA_SECTION_NODE) return `${pad}<![CDATA[${node.textContent}]]>`;
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const tag = node.tagName;
  let attrs = '';
  for (const a of node.attributes) attrs += ` ${a.name}="${escapeXMLAttr(a.value)}"`;
  const children = Array.from(node.childNodes);
  const childElements = children.filter(c => c.nodeType === Node.ELEMENT_NODE);
  const textNodes = children.filter(c => c.nodeType === Node.TEXT_NODE && c.textContent.trim());

  if (children.length === 0) return `${pad}<${tag}${attrs}/>`;
  if (childElements.length === 0 && textNodes.length > 0) {
    return `${pad}<${tag}${attrs}>${escapeXMLText(node.textContent.trim())}</${tag}>`;
  }
  const lines = [];
  for (const c of children) { const l = serializeNode(c, depth + 1, indent); if (l) lines.push(l); }
  if (lines.length === 0) return `${pad}<${tag}${attrs}/>`;
  return `${pad}<${tag}${attrs}>\n${lines.join('\n')}\n${pad}</${tag}>`;
}

function escapeXMLText(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escapeXMLAttr(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function cleanParseError(msg) {
  return msg.replace(/This page contains the following errors:\s*/i, '').replace(/Below is a rendering.*$/s, '').trim().split('\n')[0].trim();
}

function showRepaired(text, fixes) {
  outputEl.style.cssText = 'white-space:pre; overflow:auto; cursor:text; user-select:text; padding:16px;';
  outputEl.textContent = text;
  setStatus(inputStatus, 'valid', fixes.length ? '✓ Repaired' : '✓ Already valid');
  setStatus(outputStatus, 'valid', '✓ Valid XML');
  fixListEl.style.display = 'block';
  if (fixes.length) {
    fixListEl.innerHTML = '<strong>Fixes applied:</strong><ul style="margin:6px 0 0; padding-left:18px;">' +
      fixes.map(f => `<li>${escapeHTML(f)}</li>`).join('') + '</ul>';
  } else {
    fixListEl.innerHTML = '<strong>No changes needed</strong> — your XML was already well-formed.';
  }
}

function showUnfixable(message) {
  outputEl.style.cssText = 'white-space:normal; overflow:auto; padding:20px; display:flex; flex-direction:column; gap:12px;';
  outputEl.innerHTML = `
    <div style="background:rgba(220,38,38,0.08); border:1px solid rgba(220,38,38,0.25); border-radius:var(--radius-sm); padding:16px; display:flex; align-items:center; gap:10px;">
      <span style="font-size:1.4rem; color:var(--error);">✗</span>
      <div>
        <div style="font-size:1rem; font-weight:700; color:var(--error);">Couldn't auto-repair this XML</div>
        <div style="font-size:0.82rem; color:var(--text-muted); margin-top:2px;">We fixed what we safely could — the remaining error needs a manual edit.</div>
      </div>
    </div>
    <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:14px;">
      <div style="font-family:var(--font-mono); font-size:0.85rem; color:var(--error); line-height:1.6;">${escapeHTML(message)}</div>
    </div>`;
  setStatus(inputStatus, 'invalid', '✗ Needs manual fix');
  setStatus(outputStatus, 'invalid', '✗ Error');
  fixListEl.style.display = 'none';
}

function clearOutput() {
  outputEl.innerHTML = '<span style="color:var(--text-muted);">Repaired XML will appear here…</span>';
  outputEl.style.cssText = 'white-space:pre; overflow:auto; cursor:text; user-select:text; padding:16px;';
  setStatus(outputStatus, 'idle', '');
  if (fixListEl) fixListEl.style.display = 'none';
}

function clearAll() {
  clearTimeout(debounceTimer);
  inputEl.value = '';
  setStatus(inputStatus, 'idle', '');
  inputStats.textContent = '';
  highlightErrorLine('inputArea', null);
  refreshLineNumbers('inputArea');
  clearOutput();
}

function loadSample() {
  inputEl.value = '<note>\n  <to>Tove</to>\n  <from>Jani & co</from>\n  <heading priority=high>Reminder</heading>\n  <body>Don’t forget me this weekend!</body>';
  refreshLineNumbers('inputArea');
  repair();
  inputEl.dispatchEvent(new InputEvent('input', { bubbles: true }));
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
  if (!text || outputEl.querySelector('[style*="color:var(--text-muted)"]')) return;
  const blob = new Blob([text], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'repaired.xml'; a.click();
  URL.revokeObjectURL(url);
}

function setStatus(el, type, text) { el.className = 'status-badge ' + type; el.textContent = text; }
function escapeHTML(str) { return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}
