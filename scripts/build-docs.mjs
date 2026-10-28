// Dev-only documentation builder: docs-src/**/*.md -> docs/**/*.html (zero dependencies).
// Also generates the options / toolbar buttons / menu items reference tables from the source.
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { resolve, join, relative, dirname } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const srcDir = join(root, 'docs-src');
const outDir = join(root, 'docs');

const NAV = [
  {
    title: 'Guide',
    pages: [
      ['guide/getting-started', 'Getting started'],
      ['guide/migration-from-tinymce', 'Migrating from TinyMCE'],
      ['guide/configuration', 'Configuration'],
      ['guide/toolbar-and-menus', 'Toolbar and menus'],
      ['guide/sanitisation', 'Sanitisation and output'],
      ['guide/uploads', 'Image and media uploads'],
      ['guide/dialogs-and-custom-buttons', 'Dialogs and custom buttons'],
      ['guide/writing-plugins', 'Writing plugins'],
      ['guide/theming', 'Theming and skins'],
      ['guide/i18n', 'Localisation'],
      ['guide/accessibility', 'Accessibility'],
    ],
  },
  {
    title: 'Reference',
    pages: [
      ['reference/options', 'Options'],
      ['reference/toolbar-buttons', 'Toolbar buttons'],
      ['reference/menu-items', 'Menu items'],
      ['reference/editor-api', 'Editor API'],
      ['reference/global-api', 'Global API'],
      ['reference/events', 'Events'],
      ['reference/dialog-spec', 'Dialog specification'],
      ['reference/formats', 'Formats'],
      ['reference/keyboard-shortcuts', 'Keyboard shortcuts'],
      ['reference/compat-matrix', 'TinyMCE compatibility matrix'],
    ],
  },
];

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---- Markdown (subset) -------------------------------------------------------------------------
const inline = (text) => {
  const codes = [];
  text = text.replace(/`([^`]+)`/g, (_m, c) => {
    codes.push(`<code>${escapeHtml(c)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  text = escapeHtml(text);
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  text = text.replace(/(^|[\s(])_([^_\s][^_]*?)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  text = text.replace(/\u0000(\d+)\u0000/g, (_m, i) => codes[Number(i)]);
  return text;
};

const markdown = (md) => {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const listStack = [];
  const closeLists = (toDepth = 0) => {
    while (listStack.length > toDepth) {
      out.push(`</li></${listStack.pop()}>`);
    }
  };
  let para = [];
  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join(' '))}</p>`);
      para = [];
    }
  };
  while (i < lines.length) {
    const line = lines[i];
    // Fenced code
    const fence = /^```\s*([a-z0-9+-]*)\s*$/i.exec(line);
    if (fence) {
      flushPara();
      closeLists();
      const lang = fence[1];
      const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++;
      out.push(`<pre><code${lang ? ` class="language-${lang}"` : ''}>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }
    // Raw HTML block
    if (/^<(div|table|details|section|figure|p|ul|ol|h[1-6]|blockquote|pre|iframe|style|script)\b/i.test(line) || /^<!--/.test(line)) {
      flushPara();
      closeLists();
      const buf = [line];
      i++;
      while (i < lines.length && lines[i].trim() !== '') {
        buf.push(lines[i]);
        i++;
      }
      out.push(buf.join('\n'));
      continue;
    }
    // Headings
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      closeLists();
      const level = h[1].length;
      const text = inline(h[2].trim());
      out.push(`<h${level} id="${slug(h[2])}">${text}</h${level}>`);
      i++;
      continue;
    }
    // Horizontal rule
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      flushPara();
      closeLists();
      out.push('<hr>');
      i++;
      continue;
    }
    // Blockquote
    if (/^>\s?/.test(line)) {
      flushPara();
      closeLists();
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${markdown(buf.join('\n'))}</blockquote>`);
      continue;
    }
    // Table
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1])) {
      flushPara();
      closeLists();
      const cells = (l) => l.replace(/^\||\|\s*$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
      const header = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) {
        rows.push(cells(lines[i]));
        i++;
      }
      out.push(`<table><thead><tr>${header.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    // Lists
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      flushPara();
      const depth = Math.floor(li[1].replace(/\t/g, '  ').length / 2) + 1;
      const type = /^\d/.test(li[2]) ? 'ol' : 'ul';
      while (listStack.length > depth) {
        out.push(`</li></${listStack.pop()}>`);
      }
      if (listStack.length === depth) {
        out.push('</li>');
      } else {
        while (listStack.length < depth) {
          out.push(`<${type}>`);
          listStack.push(type);
        }
      }
      // Continuation lines (indented, not list items) join the item.
      let text = li[3];
      i++;
      while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        text += ' ' + lines[i].trim();
        i++;
      }
      out.push(`<li>${inline(text)}`);
      continue;
    }
    if (line.trim() === '') {
      flushPara();
      if (listStack.length && !(i + 1 < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i + 1]))) {
        closeLists();
      }
      i++;
      continue;
    }
    para.push(line.trim());
    i++;
  }
  flushPara();
  closeLists();
  return out.join('\n');
};

// ---- Source scanning for generated reference tables ------------------------------------------
const walk = (dir, acc = []) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      walk(p, acc);
    } else if (p.endsWith('.ts')) {
      acc.push(p);
    }
  }
  return acc;
};

const sourceGroup = (file) => {
  const rel = relative(join(root, 'src'), file).replace(/\\/g, '/');
  const m = /^plugins\/([a-z0-9]+)\//.exec(rel);
  if (m) {
    return m[1] + ' plugin';
  }
  if (rel.startsWith('ui/')) {
    return 'core (UI)';
  }
  return 'core';
};

const extractBalanced = (text, start) => {
  // text[start] is '{'
  let depth = 0;
  for (let j = start; j < text.length; j++) {
    const ch = text[j];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, j + 1);
    } else if (ch === '\'' || ch === '"' || ch === '`') {
      const q = ch;
      j++;
      while (j < text.length && text[j] !== q) {
        if (text[j] === '\\') j++;
        j++;
      }
    }
  }
  return text.slice(start);
};

const summariseDefault = (spec) => {
  const m = /default:\s*/.exec(spec);
  if (!m) return '';
  let rest = spec.slice(m.index + m[0].length);
  // Take the expression up to the next top-level ',' or the closing brace.
  let depth = 0;
  let out = '';
  for (let j = 0; j < rest.length; j++) {
    const ch = rest[j];
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') {
      if (depth === 0) break;
      depth--;
    } else if (ch === ',' && depth === 0) break;
    else if (ch === '\'' || ch === '"' || ch === '`') {
      const q = ch;
      out += ch;
      j++;
      while (j < rest.length && rest[j] !== q) {
        if (rest[j] === '\\') {
          out += rest[j];
          j++;
        }
        out += rest[j];
        j++;
      }
    }
    out += ch;
  }
  out = out.trim().replace(/\s+/g, ' ');
  // Defaults computed from the editor or element are not meaningful as literals.
  if (/=>|editor\.|\bas\b/.test(out)) return '(computed)';
  if (out.length > 90) out = out.slice(0, 87) + '…';
  return out;
};

const summariseType = (spec) => {
  const m = /processor:\s*('[^']+'|"[^"]+")/.exec(spec);
  if (m) return m[1].replace(/['"]/g, '');
  if (/processor:\s*\(/.test(spec) || /processor:\s*[a-zA-Z]/.test(spec)) return 'custom';
  return '';
};

const collectOptions = () => {
  const rows = [];
  const seen = new Set();
  for (const file of walk(join(root, 'src'))) {
    const text = readFileSync(file, 'utf8');
    const re = /\b(?:registerOption|register|r)\(\s*'([a-z0-9_]+)'\s*,\s*\{/g;
    let m;
    while ((m = re.exec(text))) {
      const name = m[1];
      const spec = extractBalanced(text, m.index + m[0].length - 1);
      const key = name + '@' + file;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ name, group: sourceGroup(file), type: summariseType(spec), def: summariseDefault(spec) });
    }
  }
  rows.sort((a, b) => (a.group === b.group ? a.name.localeCompare(b.name) : a.group.localeCompare(b.group)));
  return rows;
};

const collectRegistry = (methods) => {
  const rows = [];
  for (const file of walk(join(root, 'src'))) {
    const text = readFileSync(file, 'utf8');
    const re = new RegExp(`\\.(${methods.join('|')})\\(\\s*'([a-z0-9_-]+)'`, 'g');
    let m;
    while ((m = re.exec(text))) {
      rows.push({ name: m[2], kind: m[1].replace(/^add/, '').replace(/Spec$/, ''), group: sourceGroup(file) });
    }
    // Buttons registered through helper functions (cmdButton('name', ...) in the table plugin).
    const helper = /cmdButton\(\s*'([a-z0-9_-]+)'/g;
    while ((m = helper.exec(text)) && methods.includes('addButton')) {
      rows.push({ name: m[1], kind: 'Button', group: sourceGroup(file) });
    }
  }
  const byName = new Map();
  rows.forEach((r) => {
    if (!byName.has(r.name)) byName.set(r.name, r);
  });
  return Array.from(byName.values()).sort((a, b) => (a.group === b.group ? a.name.localeCompare(b.name) : a.group.localeCompare(b.group)));
};

const table = (header, rows) => `| ${header.join(' | ')} |\n|${header.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.map((c) => String(c).replace(/\|/g, '\\|')).join(' | ')} |`).join('\n')}\n`;

const generated = {
  OPTIONS_TABLE: () => table(['Option', 'Type', 'Default', 'Provided by'], collectOptions().map((o) => [`\`${o.name}\``, o.type, o.def ? `\`${o.def.replace(/`/g, '')}\`` : '', o.group])),
  BUTTONS_TABLE: () => table(['Button', 'Kind', 'Provided by'], collectRegistry(['addButton', 'addToggleButton', 'addMenuButton', 'addSplitButton', 'addGroupToolbarButton']).map((b) => [`\`${b.name}\``, b.kind, b.group])),
  MENU_ITEMS_TABLE: () => table(['Menu item', 'Kind', 'Provided by'], collectRegistry(['addMenuItem', 'addNestedMenuItem', 'addToggleMenuItem']).map((b) => [`\`${b.name}\``, b.kind, b.group])),
};

// ---- Layout -------------------------------------------------------------------------------------
const layout = ({ title, description, body, path }) => {
  const depth = path.split('/').length - 1;
  const rel = '../'.repeat(depth);
  const nav = NAV.map(
    (section) =>
      `<h4>${section.title}</h4>` +
      section.pages.map(([p, t]) => `<a href="${rel}${p}.html"${p === path ? ' class="active"' : ''}>${escapeHtml(t)}</a>`).join(''),
  ).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — kHtmlEditor</title>
  <meta name="description" content="${escapeHtml(description || title)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${rel}assets/site.css">
</head>
<body>
<header class="page-header page-header--compact">
  <a class="github-link" href="https://github.com/KAStrack/kHtmlEditor" target="_blank" rel="noopener noreferrer" aria-label="View kHtmlEditor on GitHub">GitHub</a>
  <h1><a href="${rel}index.html"><span>k</span>HtmlEditor</a></h1>
  <div class="header-links">
    <a class="header-link" href="${rel}demo/">Demo</a>
    <a class="header-link" href="${rel}examples/">Examples</a>
    <a class="header-link" href="${rel}guide/getting-started.html">Guide</a>
    <a class="header-link" href="${rel}reference/options.html">Reference</a>
  </div>
</header>
<div class="container">
  <div class="docs-layout">
    <nav class="docs-nav" aria-label="Documentation">${nav}</nav>
    <main class="docs-content">
${body}
    </main>
  </div>
</div>
<footer class="page-footer">
  <p><a href="https://www.kastrack.com" target="_blank" rel="noopener">Sponsored by KAStrack</a></p>
  <p>kHtmlEditor — MIT License — Vanilla JS, zero dependencies.</p>
</footer>
<script src="${rel}assets/site.js"></script>
</body>
</html>
`;
};

const frontMatter = (text) => {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  m[1].split('\n').forEach((l) => {
    const i = l.indexOf(':');
    if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  });
  return { meta, body: text.slice(m[0].length) };
};

let count = 0;
for (const file of walk(srcDir).concat(readdirSync(srcDir, { recursive: true }).map((f) => join(srcDir, f)).filter((f) => f.endsWith('.md')))) {
  if (!file.endsWith('.md')) continue;
  const relPath = relative(srcDir, file).replace(/\\/g, '/').replace(/\.md$/, '');
  const { meta, body } = frontMatter(readFileSync(file, 'utf8'));
  const withGenerated = body.replace(/<!--\s*([A-Z_]+)\s*-->/g, (m, key) => (generated[key] ? generated[key]() : m));
  const html = layout({ title: meta.title || relPath, description: meta.description, body: markdown(withGenerated), path: relPath });
  const outFile = join(outDir, relPath + '.html');
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, html);
  count++;
}
console.log(`docs: built ${count} pages`);
