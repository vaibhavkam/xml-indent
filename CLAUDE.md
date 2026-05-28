# CLAUDE.md

Context for Claude Code working in this repo.
This is **collaboration context** — preferences, infra IDs, gotchas — not project documentation.

---

## Project at a glance

- **XML Indent** — static site of free XML tools at https://xml-indent.com
- Owner: Vaibhav Kamble (personal project, not Intuit)
- Stack: Plain HTML + CSS + JS, deployed to S3 + CloudFront
- Tools: Formatter, Validator, Minifier, Diff, XPath Tester + Contact, Support, Privacy, Terms pages
- Sister sites: https://json-indent.com (violet theme) · https://yaml-indent.com (planned)
- Local dev: `python3 -m http.server 8080` from project root

---

## Important infra IDs

| Resource | Value |
|---|---|
| S3 bucket | `xml-indent.com` (us-west-2) |
| CloudFront (xml-indent.com) | `E2LO8C42GD5N0D` |
| CloudFront (www.xml-indent.com) | `EUTYSP62F1O4K` |
| Buy Me a Coffee | `buymeacoffee.com/vaibhav.kamble` |
| Contact form | Web3Forms key `6007bf05-fa0f-441a-961a-5b63b82e26e1` (same as json-indent) |
| GitHub repo | https://github.com/vaibhavkam/xml-indent |
| GA4 | `G-W6V2QQHMTY` (MyDailyTools account 86947416) |

---

## Deployment

Push to `master` → GitHub Actions auto-deploys to S3 + invalidates CloudFront.
Workflow file: `.github/workflows/deploy.yml`

GitHub secrets required in the repo:
- `AWS_ACCESS_KEY_ID` — same IAM user as json-indent
- `AWS_SECRET_ACCESS_KEY` — same IAM user as json-indent
- `CF_DIST_APEX` — CloudFront distribution ID for xml-indent.com
- `CF_DIST_WWW` — CloudFront distribution ID for www.xml-indent.com

**S3 root document:** `index.html`, error document: `error.html`

**Manual deploy if needed:**
```bash
aws s3 sync . s3://xml-indent.com --exclude ".git/*" --exclude ".github/*" --exclude "*.iml" --delete
aws cloudfront create-invalidation --distribution-id <CF_DIST_APEX> --paths "/*"
aws cloudfront create-invalidation --distribution-id <CF_DIST_WWW> --paths "/*"
```

---

## Environment quirks

### `GITHUB_TOKEN` collision
Vaibhav's shell has `GITHUB_TOKEN` exported (Intuit setup) which breaks `gh` CLI for personal GitHub:
```bash
unset GITHUB_TOKEN && gh ...
```

---

## Working preferences

- **Be honest about tradeoffs**, especially before destructive ops. Push back when overkill.
- **One sentence updates** during execution; don't narrate every step.
- **Match scope to request.** A bug fix doesn't need a refactor. "Stop" means stop.
- **Never commit or push** unless explicitly asked — site is live.
- **No comments in code** unless the WHY is non-obvious.

Conversational shortcuts: **"go"/"do all"** = proceed · **"call it for today"** = stop · **single screenshot** = "what's wrong here"

---

## File structure

```
/
├── index.html          ← XML Formatter (homepage)
├── validator.html
├── minifier.html
├── diff.html
├── xpath.html          ← XPath Tester (unique to xml-indent)
├── contact.html        ← Web3Forms contact form
├── support.html        ← Buy Me a Coffee + free support options
├── privacy.html
├── terms.html
├── error.html          ← 404 page
├── sitemap.xml
├── robots.txt
├── css/main.css        ← single stylesheet, teal design system
├── js/
│   ├── formatter.js    ← uses DOMParser for XML parsing
│   ├── validator.js
│   ├── minifier.js
│   ├── diff.js         ← structural DOM diff (not text diff)
│   ├── xpath.js        ← XPath 1.0 via browser evaluate()
│   ├── line-numbers.js ← shared gutter logic (identical to json-indent)
│   └── theme.js        ← dark/light mode toggle (identical to json-indent)
├── img/
│   ├── title.png       ← nav + footer logo
│   └── icon.png        ← favicon
└── .github/workflows/deploy.yml
```

---

## Design system — Teal/Emerald

```css
--bg:           #f0fdfa   /* barely-teal white */
--bg-secondary: #ffffff
--bg-editor:    #ffffff
--primary:      #0d9488   /* teal-600 */
--primary-hover:#0f766e
--primary-light:#f0fdfa
--accent:       #059669   /* emerald */
--text:         #0d1f1e
--text-muted:   #2d6a64
--border:       #ccfbf1
```

**Dark mode:** `#0d1f1e` bg, `#2dd4bf` primary, deep teal tones.

**Nav:** White background, 3px gradient bottom border:
`linear-gradient(to right, #0d9488, #14b8a6, #059669)`

**Footer:** `#071a19` background (deep teal-black).

**Panel headers:** `background: var(--primary)` with white text.

### Logo
- Nav: `<img src="/img/title.png" alt="XML Indent" height="22">`
- Footer: `<img src="/img/title.png" alt="XML Indent" height="19">`
- Icon (favicon): `/img/icon.png`

---

## XML parsing pattern — always use DOMParser

All XML tools use the browser's built-in `DOMParser`:
```js
const parser = new DOMParser();
const doc = parser.parseFromString(raw, 'application/xml');
const parseError = doc.querySelector('parsererror');
if (parseError) {
  const msg = cleanParseError(parseError.textContent || 'XML parse error');
  // extract line number from msg with /line[:\s]+(\d+)/i
}
```

`cleanParseError()` strips the verbose Chrome prefix:
```js
function cleanParseError(msg) {
  return msg
    .replace(/This page contains the following errors:\s*/i, '')
    .replace(/Below is a rendering.*$/s, '')
    .trim().split('\n')[0].trim();
}
```

---

## HTML/JS patterns — follow these exactly

### Output areas (formatter, minifier)
Output is a **`<div>`** not `<textarea>`:
```html
<div id="outputArea" class="output-area" tabindex="0" style="white-space:pre; overflow:auto; cursor:text; user-select:text; outline:none; padding:16px;"></div>
```
- Use `outputEl.textContent = text` for valid output
- Use `outputEl.innerHTML = '...'` for styled errors
- **Never use `outputEl.value`**

### Input textarea IDs
- Single-input tools: `id="inputXML"`, gutter: `id="gutter-inputXML"`
- Diff tool: `id="xmlA"` / `id="xmlB"`, gutters: `id="gutter-xmlA"` / `id="gutter-xmlB"`

### Line numbers
- `initLineNumbers('inputXML')` — call in `DOMContentLoaded`
- `refreshLineNumbers('inputXML')` — call after programmatic value changes
- `highlightErrorLine('inputXML', lineNum)` — highlights error line red; pass `null` to clear

### Contact/email links
- **All contact links** → `/contact.html` only. No `mailto:` anywhere.

---

## SEO constraints — do not regress

| Page | Primary keywords |
|------|-----------------|
| `index.html` | `xml formatter`, `format xml`, `xml beautifier` |
| `validator.html` | `xml validator`, `validate xml`, `xml lint` |
| `minifier.html` | `xml minifier`, `minify xml`, `compress xml` |
| `diff.html` | `xml diff`, `compare xml` |
| `xpath.html` | `xpath tester`, `xpath evaluator`, `test xpath online` |

- Every page: unique `<title>`, `<meta name="description">`, `<link rel="canonical">`, favicon, theme flash script
- FAQ schema JSON-LD on all 5 tool pages
- WebApplication schema JSON-LD on all 5 tool pages
- Sitemap at `/sitemap.xml` — update `<lastmod>` when content changes

---

## Failure modes

- **Old content after deploy** → CloudFront cache. Always invalidate both distributions.
- **Nav links 404 locally** → Use `python3 -m http.server 8080`, not `file://`.
- **XML parse errors showing raw browser message** → `cleanParseError()` strips "This page contains the following errors:" prefix.
- **Output div not updating** → Are you using `.value`? Use `.textContent` or `.innerHTML` on a div.
- **Line numbers not updating after programmatic value set** → Call `dispatchEvent(new Event('input'))` or `refreshLineNumbers()`.
- **Diff showing errors in stats bar** → Never put error text in `statsA`/`statsB` — only in `showError()` bar below panels.
- **XPath tool not evaluating** → `parsedDoc` is null until `parseXMLDoc()` succeeds; check `inputStatus` is valid first.

---

Last updated: 2026-05-28 (session 1 — initial build, all 5 tools, logo, audit clean)
