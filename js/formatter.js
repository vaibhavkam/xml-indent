'use strict';
document.addEventListener('DOMContentLoaded', () => {
  initLineNumbers('inputXML');

  document.getElementById('inputXML').addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(debounceTimer);
      formatXML();
    }
  });

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
    debounceTimer = setTimeout(formatXML, 400);
  } else {
    inputStats.textContent = '';
    inputStatus.className = 'status-badge idle';
    inputStatus.textContent = '';
    highlightErrorLine('inputXML', null);
    clearOutput();
  }
}

function getIndent() {
  const v = document.getElementById('indentSize').value;
  return v === 'tab' ? '\t' : ' '.repeat(parseInt(v));
}

function formatXML() {
  const raw = inputEl.value.trim();
  if (!raw) { clearOutput(); return; }

  const result = parseAndFormatXML(raw);
  if (result.error) {
    highlightErrorLine('inputXML', result.line);
    outputEl.style.cssText = 'white-space:normal; overflow:auto; padding:20px; display:flex; flex-direction:column; gap:12px;';
    outputEl.innerHTML = `
      <div style="background:rgba(220,38,38,0.08); border:1px solid rgba(220,38,38,0.25); border-radius:var(--radius-sm); padding:16px; display:flex; align-items:center; gap:10px;">
        <span style="font-size:1.4rem; color:var(--error);">✗</span>
        <div>
          <div style="font-size:1rem; font-weight:700; color:var(--error); font-family:var(--font-mono);">Invalid XML</div>
          <div style="font-size:0.82rem; color:var(--text-muted); margin-top:2px;">Fix the error below</div>
        </div>
      </div>
      <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:14px;">
        <div style="font-family:var(--font-mono); font-size:0.85rem; color:var(--error); line-height:1.6;">${escapeHTML(result.error)}</div>
        ${result.line ? `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:8px; padding-top:8px; border-top:1px solid var(--border);">📍 Line ${result.line}</div>` : ''}
      </div>`;
    setStatus(outputStatus, 'invalid', '✗ Error');
    outputStats.textContent = '';
    setStatus(inputStatus, 'invalid', '✗ Invalid');
    return;
  }

  outputEl.style.cssText = 'white-space:pre; overflow:auto; cursor:text; user-select:text; padding:16px;';
  outputEl.textContent = result.formatted;
  const lines = result.formatted.split('\n').length;
  const bytes = new Blob([result.formatted]).size;
  setStatus(outputStatus, 'valid', '✓ Formatted');
  outputStats.textContent = `${lines} lines · ${result.formatted.length} chars · ${formatBytes(bytes)}`;
  setStatus(inputStatus, 'valid', '✓ Valid');
  highlightErrorLine('inputXML', null);
}

function parseAndFormatXML(raw) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    const msg = parseError.textContent || 'XML parse error';
    const lineMatch = msg.match(/line[:\s]+(\d+)/i);
    return { error: cleanParseError(msg), line: lineMatch ? parseInt(lineMatch[1]) : null };
  }

  const indent = getIndent();
  const formatted = serializeNode(doc.documentElement, 0, indent);
  const xmlDecl = raw.trimStart().startsWith('<?xml') ? '<?xml version="1.0" encoding="UTF-8"?>\n' : '';
  return { formatted: xmlDecl + formatted };
}

function serializeNode(node, depth, indent) {
  const pad = indent.repeat(depth);

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent.trim();
    return text ? pad + escapeXMLText(text) : '';
  }

  if (node.nodeType === Node.COMMENT_NODE) {
    return `${pad}<!--${node.textContent}-->`;
  }

  if (node.nodeType === Node.CDATA_SECTION_NODE) {
    return `${pad}<![CDATA[${node.textContent}]]>`;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const tag = node.tagName;
  let attrs = '';
  for (const attr of node.attributes) {
    attrs += ` ${attr.name}="${escapeXMLAttr(attr.value)}"`;
  }

  const children = Array.from(node.childNodes);
  const childElements = children.filter(c => c.nodeType === Node.ELEMENT_NODE);
  const textNodes = children.filter(c => c.nodeType === Node.TEXT_NODE && c.textContent.trim());

  if (children.length === 0) {
    return `${pad}<${tag}${attrs}/>`;
  }

  if (childElements.length === 0 && textNodes.length > 0) {
    const text = escapeXMLText(node.textContent.trim());
    return `${pad}<${tag}${attrs}>${text}</${tag}>`;
  }

  const childLines = [];
  for (const child of children) {
    const line = serializeNode(child, depth + 1, indent);
    if (line) childLines.push(line);
  }

  if (childLines.length === 0) return `${pad}<${tag}${attrs}/>`;
  return `${pad}<${tag}${attrs}>\n${childLines.join('\n')}\n${pad}</${tag}>`;
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

function clearOutput() {
  outputEl.innerHTML = '<span style="color:var(--text-muted);">Formatted XML will appear here...</span>';
  outputEl.style.cssText = 'white-space:pre; overflow:auto; cursor:text; user-select:text; padding:16px;';
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

function escapeHTML(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    inputEl.value = text;
    onInput();
  } catch {
    inputEl.focus();
    showToast('Click in the input area and use Ctrl+V / Cmd+V');
  }
}

function copyOutput() {
  const text = outputEl.textContent;
  if (!text || outputEl.querySelector('[style*="color:var(--text-muted)"]')) return;
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
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'formatted.xml';
  a.click();
  URL.revokeObjectURL(url);
}

function loadSample() {
  inputEl.value = `<?xml version="1.0" encoding="UTF-8"?>
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
    <available>false</available>
  </book>
</library>`;
  refreshLineNumbers('inputXML');
  formatXML();
  onInput();
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}
