const state = {
  nextId: 1,
  root: { id: 0, text: '', children: [], completed: false, collapsed: false },
  selectedId: null,
  cursorOffset: 0,
  focusIds: [],
  history: [],
  historyIndex: -1,
  historyMerging: false,
  isSearchOpen: false,
  searchQuery: '',
  isCheatsheetOpen: false,
  isVersionOpen: false,
  hideCompleted: false,
  tagFilter: null,
  noKeyboardMode: 'auto',
};

let autosaveTimer = null;
let pendingDeleteId = null;
let renderScheduled = false;

const KEYBINDS = [
  ['enter', 'new sibling'],
  ['tab', 'indent'],
  ['shift+tab', 'outdent'],
  ['ctrl+z', 'undo'],
  ['ctrl+shift+z', 'redo'],
  ['ctrl+k', 'open search'],
  ['ctrl+l', 'toggle complete'],
  ['ctrl+]', 'zoom into node'],
  ['ctrl+[', 'zoom out'],
  ['ctrl+/', 'toggle this cheat sheet'],
];

function getNode(id) {
  function walk(node) {
    if (node.id === id) return node;
    for (const child of node.children) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  }
  return walk(state.root);
}

function findParent(id) {
  function walk(node, parent) {
    if (node.id === id) return parent;
    for (const child of node.children) {
      const found = walk(child, node);
      if (found) return found;
    }
    return null;
  }
  return walk(state.root, null);
}

function getNodeIndex(id) {
  const parent = findParent(id);
  if (!parent) return -1;
  return parent.children.findIndex(c => c.id === id);
}

function createNode(text) {
  return { id: state.nextId++, text, children: [], completed: false, collapsed: false };
}

function getVisibleNodes() {
  const focusRoot = state.focusIds.length > 0
    ? getNode(state.focusIds[state.focusIds.length - 1])
    : state.root;

  if (!focusRoot) return [];

  const result = [];

  function walk(node, depth) {
    if (state.hideCompleted && node.completed && node.children.length === 0) return;
    result.push({ ...node, _depth: depth, _isContext: false });
    if (!node.collapsed && node.children.length > 0) {
      for (let i = 0; i < node.children.length; i++) {
        walk(node.children[i], depth + 1);
      }
    }
  }

  for (let i = 0; i < focusRoot.children.length; i++) {
    walk(focusRoot.children[i], 0);
  }

  return result;
}

function getNodePath(id) {
  const path = [];
  let current = id;
  while (current !== null && current !== 0) {
    path.unshift(current);
    const parent = findParent(current);
    current = parent ? parent.id : null;
  }
  return path;
}

function cloneNode(node) {
  return { ...node, children: node.children.map(cloneNode) };
}

function persistState() {
  const data = {
    root: cloneNode(state.root),
    nextId: state.nextId,
    selectedId: state.selectedId,
    focusIds: [...state.focusIds],
    hideCompleted: state.hideCompleted,
    tagFilter: state.tagFilter,
    noKeyboardMode: state.noKeyboardMode,
  };
  saveCurrent(data);
}

function schedulePersist() {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    persistState();
    autosaveTimer = null;
  }, 1000);
}

function isTouchDeviceDetected() {
  return (
    (typeof window !== 'undefined' && 'ontouchstart' in window) ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
    (typeof navigator !== 'undefined' && navigator.msMaxTouchPoints > 0)
  );
}

function shouldShowActionBar() {
  if (state.noKeyboardMode === 'yes') return true;
  if (state.noKeyboardMode === 'no') return false;
  return isTouchDeviceDetected();
}

function updateActionBar() {
  const actionBar = document.getElementById('action-bar');
  if (shouldShowActionBar()) {
    actionBar.classList.add('open');
  } else {
    actionBar.classList.remove('open');
  }
}

function openVersionHistory() {
  state.isVersionOpen = true;
  document.getElementById('version-overlay').classList.add('open');
  renderVersionList();
}

function closeVersionHistory() {
  state.isVersionOpen = false;
  document.getElementById('version-overlay').classList.remove('open');
}

function openSettings() {
  document.getElementById('settings-overlay').classList.add('open');
}

function closeSettings() {
  document.getElementById('settings-overlay').classList.remove('open');
}

function renderVersionList() {
  const list = document.getElementById('version-list');
  list.innerHTML = '<div class="search-empty">loading...</div>';
  getVersions().then(versions => {
    if (versions.length === 0) {
      list.innerHTML = '<div class="search-empty">no versions saved</div>';
      return;
    }
    let html = '';
    for (const v of versions) {
      const nodeCount = v.snapshot && v.snapshot.root ? countAllDescendants(v.snapshot.root) : 0;
      html += `<div class="version-item">
        <div>
          <div class="v-time">${escapeHtml(v.timestamp)}</div>
          <div class="v-info">${nodeCount} nodes</div>
        </div>
        <button class="v-restore" data-action="restore-version" data-version-id="${v.id}">restore</button>
      </div>`;
    }
    list.innerHTML = html;
  }).catch(() => {
    list.innerHTML = '<div class="search-empty">failed to load versions</div>';
  });
}

function restoreVersionFromHistory(versionId) {
  restoreVersion(versionId).then(snapshot => {
    if (!snapshot) return;
    restoreSnapshot(snapshot);
    state.history = [];
    state.historyIndex = -1;
    saveSnapshot();
    closeVersionHistory();
    render();
  });
}

function saveSnapshot() {
  if (state.historyMerging) return;
  function clone(node) {
    return { ...node, children: node.children.map(clone) };
  }
  const snapshot = {
    root: clone(state.root),
    nextId: state.nextId,
    selectedId: state.selectedId,
    focusIds: [...state.focusIds],
  };
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(snapshot);
  if (state.history.length > 200) state.history.shift();
  state.historyIndex = state.history.length - 1;
  persistState();
}

function mergeSnapshot() {
  state.historyMerging = true;
  saveSnapshot();
  state.historyMerging = false;
}

function undo() {
  if (state.historyIndex <= 0) return;
  state.historyIndex--;
  restoreSnapshot(state.history[state.historyIndex]);
  render();
}

function redo() {
  if (state.historyIndex >= state.history.length - 1) return;
  state.historyIndex++;
  restoreSnapshot(state.history[state.historyIndex]);
  render();
}

function restoreSnapshot(snapshot) {
  function clone(node) {
    return { ...node, children: node.children.map(clone) };
  }
  state.root = clone(snapshot.root);
  state.nextId = snapshot.nextId;
  state.selectedId = snapshot.selectedId;
  state.focusIds = [...snapshot.focusIds];
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function formatNodeText(text, searchQuery) {
  let html = escapeHtml(text);

  if (searchQuery) {
    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(${escaped})`, 'gi');
    html = html.replace(re, '<span class="hl">$1</span>');
  }

  html = html.replace(/(#[\w\u00C0-\u024F]+|#[\d]+[\w]*)/g, '<span class="tag">$1</span>');

  if (!html) html = '<br>';
  return html;
}

function getIndentPx(depth) {
  return depth * 24 + 8;
}

function saveCurrentText() {
  if (state.selectedId === null) return;
  const el = document.querySelector(`[data-id="${state.selectedId}"] .node-text`);
  if (el) {
    const node = getNode(state.selectedId);
    if (node) {
      node.text = el.textContent || '';
    }
  }
}

function selectNode(id, offset) {
  saveCurrentText();
  state.selectedId = id;
  state.cursorOffset = offset !== undefined ? offset : 0;
   render();
}

function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    render();
    renderScheduled = false;
  });
}

function render() {
  const container = document.getElementById('outliner');
  const visibleNodes = getVisibleNodes();
  const breadcrumb = document.getElementById('breadcrumb');

  let bcHtml = '';
  if (state.focusIds.length > 0) {
    const items = [
      '<span class="bc-item" data-zoom="root">jot-it-down</span>'
    ];
    for (let i = 0; i < state.focusIds.length; i++) {
      const node = getNode(state.focusIds[i]);
      if (!node) continue;
      const isLast = i === state.focusIds.length - 1;
      const label = node.text ? node.text.substring(0, 40) : 'untitled';
      if (isLast) {
        items.push(`<span class="bc-item bc-current">${escapeHtml(label)}</span>`);
      } else {
        items.push(`<span class="bc-item" data-zoom="${node.id}">${escapeHtml(label)}</span>`);
      }
    }
    items.reverse();
    bcHtml = items.map((item, idx) => {
      const sep = idx > 0 ? '<span class="bc-sep">›</span>' : '';
      return sep + item;
    }).join('');
  } else {
    bcHtml = '<span class="bc-item bc-current">jot-it-down</span>';
  }
  breadcrumb.innerHTML = bcHtml;

  if (state.tagFilter) {
    const filtered = visibleNodes.filter(n => n.text.includes(state.tagFilter));
    if (filtered.length === 0) {
      container.innerHTML = '<div class="search-empty">no nodes with ' + escapeHtml(state.tagFilter) + '</div>';
      return;
    }
    renderNodeList(container, filtered);
    return;
  }

  if (visibleNodes.length === 0) {
    container.innerHTML = '<div id="empty-state">nothing here yet</div>';
    return;
  }

  renderNodeList(container, visibleNodes);
  restoreFocus();
}

function renderNodeList(container, nodes) {
  let html = '';
  for (const n of nodes) {
    const isSelected = n.id === state.selectedId;
    const indent = getIndentPx(n._depth);
    let classes = 'node';
    if (isSelected) classes += ' selected';
    if (n.completed) classes += ' completed';

    const bulletHtml = `<span class="node-bullet" data-id="${n.id}">•</span>`;
    const toggleHtml = n.children.length > 0 ? `<span class="node-toggle ${n.collapsed ? 'collapsed' : ''}" data-id="${n.id}">${n.collapsed ? '▸' : '▾'}</span>` : '';

    let textHtml;
    if (isSelected) {
      textHtml = escapeHtml(n.text) || '<br>';
    } else {
      textHtml = formatNodeText(n.text, null);
    }

    html += `<div class="${classes}" data-id="${n.id}" data-depth="${n._depth}" style="padding-left:${indent}px">
      ${toggleHtml}
      ${bulletHtml}
      <span class="node-text">${textHtml}</span>
    </div>`;
  }
  container.innerHTML = html;
}

function updateMenuIcon(active) {
  const icon = document.querySelector('#menu-dropdown .menu-icon');
  if (icon) {
    icon.classList.toggle('active', active);
  }
}

function restoreFocus() {
  if (state.selectedId === null) return;
  const el = document.querySelector(`[data-id="${state.selectedId}"] .node-text`);
  if (!el) return;

  if (el.innerHTML === '<br>' || el.innerHTML === '') {
    el.innerHTML = '<br>';
  }

  el.contentEditable = 'true';
  el.focus();

  const text = el.textContent || '';
  const offset = Math.min(state.cursorOffset, text.length);
  try {
    const range = document.createRange();
    const sel = window.getSelection();
    if (el.firstChild) {
      range.setStart(el.firstChild, offset);
    } else {
      range.selectNodeContents(el);
    }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (e) {
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

function addSibling(text) {
  if (state.selectedId === null) return createFirstNode(text);

  const parent = findParent(state.selectedId);
  if (!parent) return;
  const idx = getNodeIndex(state.selectedId);
  const newNode = createNode(text);
  parent.children.splice(idx + 1, 0, newNode);
  state.selectedId = newNode.id;
  state.cursorOffset = 0;
  saveSnapshot();
  render();
}

function createFirstNode(text) {
  const node = createNode(text);
  state.root.children.push(node);
  state.selectedId = node.id;
  state.cursorOffset = 0;
  saveSnapshot();
  render();
}

function addChild() {
  if (state.selectedId === null) return;
  const parent = getNode(state.selectedId);
  if (!parent) return;
  const newNode = createNode('');
  parent.children.unshift(newNode);
  state.selectedId = newNode.id;
  state.cursorOffset = 0;
  saveSnapshot();
  render();
}

function indentNode() {
  if (state.selectedId === null) return;
  saveCurrentText();
  const parent = findParent(state.selectedId);
  if (!parent) return;
  const idx = getNodeIndex(state.selectedId);
  if (idx <= 0) return;
  const newParent = parent.children[idx - 1];
  const [moved] = parent.children.splice(idx, 1);
  newParent.children.push(moved);
  saveSnapshot();
  render();
}

function outdentNode() {
  if (state.selectedId === null) return;
  saveCurrentText();
  const parent = findParent(state.selectedId);
  if (!parent || parent.id === 0) return;
  const grandparent = findParent(parent.id);
  if (!grandparent) return;
  const pIdx = grandparent.children.findIndex(c => c.id === parent.id);
  const nodeIdx = parent.children.findIndex(c => c.id === state.selectedId);
  const [moved] = parent.children.splice(nodeIdx, 1);
  grandparent.children.splice(pIdx + 1, 0, moved);
  saveSnapshot();
  render();
}

function countAllDescendants(node) {
  let count = 0;
  for (const child of node.children) {
    count += 1 + countAllDescendants(child);
  }
  return count;
}

function deleteNode(id) {
  const node = getNode(id);
  const totalDescendants = node ? countAllDescendants(node) : 0;
  if (totalDescendants > 5) {
    pendingDeleteId = id;
    document.getElementById('confirm-overlay').classList.add('open');
  } else {
    removeNode(id);
  }
}

function removeNode(id) {
  if (id === null) return;
  saveCurrentText();
  const parent = findParent(id);
  if (!parent) return;
  const visibleBefore = getVisibleNodes();
  const visibleIdx = visibleBefore.findIndex(n => n.id === id);
  const idx = getNodeIndex(id);
  parent.children.splice(idx, 1);
  const visible = getVisibleNodes();
  if (visible.length > 0) {
    const newIdx = visibleIdx > 0 ? Math.min(visibleIdx - 1, visible.length - 1) : 0;
    const target = visible[newIdx];
    state.selectedId = target.id;
    state.cursorOffset = target.text.length;
  } else {
    state.selectedId = null;
    state.cursorOffset = 0;
  }
  saveSnapshot();
  render();
}

function toggleComplete() {
  if (state.selectedId === null) return;
  saveCurrentText();
  const node = getNode(state.selectedId);
  if (!node) return;
  node.completed = !node.completed;
  saveSnapshot();
  render();
}

function toggleCollapse(id) {
  const node = getNode(id);
  if (!node || node.children.length === 0) return;
  node.collapsed = !node.collapsed;
  saveSnapshot();
  render();
}

function collapseAll() {
  function walk(node) {
    if (node.children.length > 0) {
      node.collapsed = true;
    }
    for (const child of node.children) {
      walk(child);
    }
  }
  walk(state.root);
  saveSnapshot();
  render();
}

function expandAll() {
  function walk(node) {
    node.collapsed = false;
    for (const child of node.children) {
      walk(child);
    }
  }
  walk(state.root);
  saveSnapshot();
  render();
}

function focusOnNode(id) {
  saveCurrentText();
  const path = getNodePath(id);
  state.focusIds = path;
  state.selectedId = null;
  saveSnapshot();
  render();
  if (getVisibleNodes().length > 0) {
    state.selectedId = getVisibleNodes()[0].id;
  }
  render();
}

function zoomIn() {
  if (state.selectedId === null) return;
  focusOnNode(state.selectedId);
}

function zoomOut() {
  if (state.focusIds.length === 0) return;
  saveCurrentText();
  const prevFocus = state.focusIds.pop();
  state.selectedId = prevFocus;
  saveSnapshot();
  render();
}

function zoomTo(id) {
  if (id === 'root') {
    if (state.focusIds.length > 0) {
      state.selectedId = state.focusIds[0];
      state.focusIds = [];
      saveSnapshot();
      render();
    }
    return;
  }
  const numId = parseInt(id, 10);
  const idx = state.focusIds.indexOf(numId);
  if (idx >= 0) {
    state.focusIds = state.focusIds.slice(0, idx + 1);
    const visible = getVisibleNodes();
    state.selectedId = visible.length > 0 ? visible[0].id : null;
    saveSnapshot();
    render();
  }
}

function moveUp() {
  if (state.selectedId === null) return;
  const parent = findParent(state.selectedId);
  if (!parent) return;
  const idx = getNodeIndex(state.selectedId);
  if (idx <= 0) return;
  [parent.children[idx - 1], parent.children[idx]] = [parent.children[idx], parent.children[idx - 1]];
  saveSnapshot();
  render();
}

function moveDown() {
  if (state.selectedId === null) return;
  const parent = findParent(state.selectedId);
  if (!parent) return;
  const idx = getNodeIndex(state.selectedId);
  if (idx >= parent.children.length - 1) return;
  [parent.children[idx], parent.children[idx + 1]] = [parent.children[idx + 1], parent.children[idx]];
  saveSnapshot();
  render();
}

function getParentOfSelected() {
  if (state.selectedId === null) return null;
  return findParent(state.selectedId);
}

function selectNext() {
  const visible = getVisibleNodes();
  if (visible.length === 0) return;
  const idx = visible.findIndex(n => n.id === state.selectedId);
  if (idx < visible.length - 1) {
    selectNode(visible[idx + 1].id);
  }
}

function selectPrev() {
  const visible = getVisibleNodes();
  if (visible.length === 0) return;
  const idx = visible.findIndex(n => n.id === state.selectedId);
  if (idx > 0) {
    selectNode(visible[idx - 1].id);
  }
}

function openSearch() {
  state.isSearchOpen = true;
  state.searchQuery = '';
  const overlay = document.getElementById('search-overlay');
  overlay.classList.add('open');
  const input = document.getElementById('search-input');
  input.value = '';
  input.focus();
  document.getElementById('search-results').innerHTML = '';
}

function closeSearch() {
  state.isSearchOpen = false;
  state.searchQuery = '';
  document.getElementById('search-overlay').classList.remove('open');
}

function performSearch(query) {
  state.searchQuery = query;
  const resultsContainer = document.getElementById('search-results');
  if (!query.trim()) {
    resultsContainer.innerHTML = '';
    return;
  }

  const allNodes = [];
  function walk(node, depth) {
    allNodes.push({ ...node, _depth: depth });
    for (const child of node.children) walk(child, depth + 1);
  }
  for (const child of state.root.children) walk(child, 0);

  const q = query.toLowerCase();
  const matches = allNodes.filter(n => n.text.toLowerCase().includes(q));

  if (matches.length === 0) {
    resultsContainer.innerHTML = '<div class="search-empty">no matches</div>';
    return;
  }

   let html = '';
   for (const m of matches) {
     const path = getNodePath(m.id);
     const context = m._depth > 0 ? 'depth ' + m._depth : 'root';
     const displayText = m.text.length > 80 ? m.text.substring(0, 80) + '...' : m.text;
     const formatted = formatNodeText(displayText, query);
     html += `<div class="search-result" data-id="${m.id}" tabindex="0">
       <span class="sr-depth">${m._depth}</span>
       <div class="sr-text">${formatted}<span class="sr-context">${context}</span></div>
     </div>`;
   }
   resultsContainer.innerHTML = html;
}

function toggleCheatsheet() {
  state.isCheatsheetOpen = !state.isCheatsheetOpen;
  document.getElementById('cheatsheet-overlay').classList.toggle('open', state.isCheatsheetOpen);
}

function exportPlainText() {
  let result = '';
  function walk(node, depth) {
    if (node.id === 0) {
      for (const child of node.children) walk(child, depth);
      return;
    }
    const prefix = '  '.repeat(depth);
    const text = node.completed ? `~~${node.text}~~` : node.text;
    result += prefix + text + '\n';
    for (const child of node.children) walk(child, depth + 1);
  }
  walk(state.root, 0);
  return result;
}

function exportMarkdown() {
  let result = '';
  function walk(node, depth) {
    if (node.id === 0) {
      for (const child of node.children) walk(child, depth);
      return;
    }
    const checkbox = node.completed ? '[x] ' : '[ ] ';
    const prefix = depth === 0 ? '- ' : '  '.repeat(depth) + '- ';
    result += prefix + checkbox + node.text + '\n';
    for (const child of node.children) walk(child, depth + 1);
  }
  walk(state.root, 0);
  return result;
}

function exportJSON() {
  function serialize(node) {
    return {
      text: node.text,
      completed: node.completed,
      collapsed: node.collapsed,
      children: node.children.map(serialize),
    };
  }
  return JSON.stringify(state.root.children.map(serialize), null, 2);
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function parseMarkdown(text) {
  const lines = text.split('\n');
  const root = { id: state.nextId++, text: '', children: [], completed: false, collapsed: false };
  const stack = [{ node: root, indent: -1 }];

  for (const line of lines) {
    const match = line.match(/^(\s*)([-*])\s+\[([x ])\]\s+(.*)/);
    const simpleMatch = line.match(/^(\s*)([-*])\s+(.*)/);
    
    if (!match && !simpleMatch) continue;

    const indent = match ? match[1].length / 2 : simpleMatch[1].length / 2;
    const completed = match ? match[3].toLowerCase() === 'x' : false;
    const text = match ? match[4] : simpleMatch[3];

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const newNode = { id: state.nextId++, text, children: [], completed, collapsed: false };
    stack[stack.length - 1].node.children.push(newNode);
    stack.push({ node: newNode, indent });
  }

  return root.children;
}

function parseJSON(text) {
  try {
    const data = JSON.parse(text);
    function restoreIds(node) {
      node.id = state.nextId++;
      node.completed = node.completed || false;
      node.collapsed = node.collapsed || false;
      if (node.children) {
        for (const child of node.children) {
          restoreIds(child);
        }
      }
      return node;
    }
    if (Array.isArray(data)) {
      return data.map(restoreIds);
    } else {
      return [restoreIds(data)];
    }
  } catch (e) {
    return [];
  }
}

function parsePlainText(text) {
  const lines = text.split('\n');
  const root = { id: state.nextId++, text: '', children: [], completed: false, collapsed: false };
  const stack = [{ node: root, indent: -1 }];

  for (const line of lines) {
    if (!line.trim()) continue;
    
    const match = line.match(/^(\s*)~~(.+)~~$/);
    const simpleMatch = line.match(/^(\s*)(.+)$/);
    
    if (!simpleMatch) continue;

    const indentSpaces = simpleMatch[1].length;
    const indent = Math.floor(indentSpaces / 2);
    const completed = !!match;
    const text = match ? match[2] : simpleMatch[2];

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const newNode = { id: state.nextId++, text, children: [], completed, collapsed: false };
    stack[stack.length - 1].node.children.push(newNode);
    stack.push({ node: newNode, indent });
  }

  return root.children;
}

function openImport() {
  document.getElementById('import-overlay').classList.add('open');
  document.getElementById('import-mode-select').style.display = 'block';
  document.getElementById('import-file-input-section').style.display = 'none';
  document.getElementById('import-node-select').style.display = 'none';
}

function closeImport() {
  document.getElementById('import-overlay').classList.remove('open');
}

function showImportNodeSelect() {
  const list = document.getElementById('import-node-list');
  const visibleNodes = getVisibleNodes();
  let html = '';
  for (const n of visibleNodes) {
    html += `<div class="import-node-item" data-id="${n.id}" tabindex="0">
      <span class="import-node-text">${escapeHtml(n.text || 'untitled')}</span>
    </div>`;
  }
  list.innerHTML = html;
  document.getElementById('import-node-select').style.display = 'block';
}

function initCheatsheet() {
  const grid = document.querySelector('.cheatsheet-grid');
  for (const [key, desc] of KEYBINDS) {
    const item = document.createElement('div');
    item.className = 'cheatsheet-item';
    item.innerHTML = `<span class="cheatsheet-key">${key}</span><span class="cheatsheet-desc">${desc}</span>`;
    grid.appendChild(item);
  }
}

function init() {
  initCheatsheet();

  const outliner = document.getElementById('outliner');
  const searchInput = document.getElementById('search-input');
  const searchOverlay = document.getElementById('search-overlay');
  const cheatsheetOverlay = document.getElementById('cheatsheet-overlay');
  const breadcrumb = document.getElementById('breadcrumb');
  const menuBtn = document.getElementById('menu-btn');
  const menuDropdown = document.getElementById('menu-dropdown');
  const versionOverlay = document.getElementById('version-overlay');
  const versionClose = document.getElementById('version-close');
  const settingsOverlay = document.getElementById('settings-overlay');
  const settingsClose = document.getElementById('settings-close');

  loadCurrent().then(saved => {
    if (saved) {
      state.root = saved.root;
      state.nextId = saved.nextId;
      state.selectedId = saved.selectedId;
      state.focusIds = saved.focusIds || [];
      state.hideCompleted = saved.hideCompleted || false;
      state.tagFilter = saved.tagFilter || null;
      state.noKeyboardMode = saved.noKeyboardMode || 'auto';
    }
  }).finally(() => {
    render();
    updateMenuIcon(state.hideCompleted);
    updateActionBar();
    document.getElementById('no-keyboard-mode').value = state.noKeyboardMode;
  });

  setInterval(() => {
    saveVersion({
      root: cloneNode(state.root),
      nextId: state.nextId,
      selectedId: state.selectedId,
      focusIds: [...state.focusIds],
    });
  }, 300000);

  outliner.addEventListener('click', (e) => {
    if (e.target.closest('#empty-state')) {
      createFirstNode('');
      return;
    }
    const nodeEl = e.target.closest('.node');
    if (!nodeEl) return;

    const id = parseInt(nodeEl.dataset.id, 10);

    if (e.target.classList.contains('node-bullet')) {
      focusOnNode(id);
      return;
    }

    if (e.target.classList.contains('node-toggle')) {
      toggleCollapse(id);
      return;
    }

    if (e.target.classList.contains('node-text')) {
      const range = document.caretRangeFromPoint(e.clientX, e.clientY);
      const offset = range ? range.startOffset : 0;
      selectNode(id, offset);
      return;
    }

    const tagEl = e.target.closest('.tag');
    if (tagEl) {
      const tagText = tagEl.textContent;
      state.tagFilter = state.tagFilter === tagText ? null : tagText;
      render();
      return;
    }

    selectNode(id);
  });

  outliner.addEventListener('dblclick', (e) => {
    const nodeEl = e.target.closest('.node');
    if (!nodeEl) return;
    const id = parseInt(nodeEl.dataset.id, 10);
    const node = getNode(id);
    if (node && node.children.length > 0) {
      toggleCollapse(id);
    }
   });

  document.addEventListener('keydown', (e) => {
    if (state.isSearchOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeSearch();
        return;
      }
      return;
    }

    if (state.isCheatsheetOpen) {
      if (e.key === 'Escape' || (e.ctrlKey && e.key === '/')) {
        e.preventDefault();
        toggleCheatsheet();
        return;
      }
      return;
    }

    if (document.getElementById('confirm-overlay').classList.contains('open')) {
      if (e.key === 'y' || e.key === 'Enter' || e.key === 'Delete') {
        e.preventDefault();
        if (pendingDeleteId !== null) {
          removeNode(pendingDeleteId);
          pendingDeleteId = null;
        }
        document.getElementById('confirm-overlay').classList.remove('open');
      } else if (e.key === 'n' || e.key === 'Backspace' || e.key === 'Escape') {
        e.preventDefault();
        pendingDeleteId = null;
        document.getElementById('confirm-overlay').classList.remove('open');
      }
      return;
    }

    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && e.key === 'z') {
      e.preventDefault();
      undo();
      return;
    }

    if (ctrl && e.shiftKey && e.key === 'z') {
      e.preventDefault();
      redo();
      return;
    }

    if (ctrl && e.key === 'v') {
      e.preventDefault();
      if (state.selectedId !== null) {
        const el = document.querySelector(`[data-id="${state.selectedId}"] .node-text`);
        if (el && el.contentEditable === 'true') {
          navigator.clipboard.readText().then(text => {
            const lines = text.split('\n').filter(line => line !== '');
            
            if (lines.length <= 1) {
              const sel = window.getSelection();
              if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                const textNode = document.createTextNode(text);
                range.insertNode(textNode);
                range.setStartAfter(textNode);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
              }
              return;
            }
            
            saveCurrentText();
            const node = getNode(state.selectedId);
            if (!node) return;

            const currentText = el.textContent || '';
            const sel = window.getSelection();
            const cursorPos = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).startOffset : 0;

            const beforeText = currentText.slice(0, cursorPos);
            const afterText = currentText.slice(cursorPos);

            node.text = beforeText + lines[0];

            for (let i = 1; i < lines.length; i++) {
              const newText = i === lines.length - 1 ? lines[i] + afterText : lines[i];
              addSibling(newText);
            }

            saveSnapshot();
            render();
          }).catch(() => {
            // Fallback if clipboard API fails
          });
        }
      }
      return;
    }

    if (ctrl && e.key === 'k') {
      e.preventDefault();
      openSearch();
      return;
    }

    if (ctrl && e.key === 'l') {
      e.preventDefault();
      toggleComplete();
      return;
    }

    if (ctrl && e.key === ']') {
      e.preventDefault();
      zoomIn();
      return;
    }

    if (ctrl && e.key === '[') {
      e.preventDefault();
      zoomOut();
      return;
    }

    if (ctrl && e.key === '/') {
      e.preventDefault();
      toggleCheatsheet();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveCurrentText();
      const node = state.selectedId ? getNode(state.selectedId) : null;
      if (state.selectedId === null) {
        createFirstNode('');
      } else if (node && node.children.length > 0) {
        addChild();
      } else {
        addSibling('');
      }
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        outdentNode();
      } else {
        indentNode();
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectPrev();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectNext();
      return;
    }

    if (ctrl && e.shiftKey && e.key === 'Backspace') {
      e.preventDefault();
      if (state.selectedId !== null) {
        deleteNode(state.selectedId);
      }
      return;
    }

    if (e.key === 'Backspace') {
      if (state.selectedId !== null) {
        const node = getNode(state.selectedId);
        const el = document.querySelector(`[data-id="${state.selectedId}"] .node-text`);
        const text = el ? el.textContent || '' : (node ? node.text : '');

        if (text === '' || text.length === 0) {
          e.preventDefault();
          deleteNode(state.selectedId);
          return;
        }
      }
      return;
    }

    if (e.key === 'Escape') {
      if (state.selectedId !== null) {
        saveCurrentText();
        state.selectedId = null;
        render();
      }
      return;
    }
  });

  searchInput.addEventListener('input', (e) => {
    performSearch(e.target.value);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const focusedResult = document.querySelector('.search-result:focus');
      if (focusedResult) {
        const id = parseInt(focusedResult.dataset.id, 10);
        const node = getNode(id);
        if (node) {
          const parent = findParent(id);
          closeSearch();
          if (parent && parent.id !== 0) {
            focusOnNode(parent.id);
          } else {
            selectNode(id);
          }
        }
      }
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const results = Array.from(document.querySelectorAll('.search-result'));
      if (results.length === 0) return;
      const focusedResult = document.querySelector('.search-result:focus');
      if (!focusedResult) {
        results[0].focus();
      } else {
        const currentIdx = results.indexOf(focusedResult);
        const nextIdx = e.shiftKey ? (currentIdx - 1 + results.length) % results.length : (currentIdx + 1) % results.length;
        results[nextIdx].focus();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const first = document.querySelector('.search-result');
      if (first) first.focus();
    }
  });

  searchOverlay.addEventListener('click', (e) => {
    const result = e.target.closest('.search-result');
    if (result) {
      const id = parseInt(result.dataset.id, 10);
      closeSearch();
      selectNode(id);
      return;
    }
    if (e.target === searchOverlay) {
      closeSearch();
    }
  });

  document.addEventListener('blur', (e) => {
    const el = e.target;
    if (el && el.classList && el.classList.contains('node-text') && el.contentEditable === 'true') {
      saveCurrentText();
    }
  }, true);

  updateMenuIcon(state.hideCompleted);

  breadcrumb.addEventListener('click', (e) => {
    const item = e.target.closest('.bc-item');
    if (!item) return;
    const zoomTarget = item.dataset.zoom;
    if (zoomTarget) {
      zoomTo(zoomTarget);
    }
  });

  cheatsheetOverlay.addEventListener('click', (e) => {
    if (e.target === cheatsheetOverlay || e.target.closest('#cheatsheet-close')) {
      toggleCheatsheet();
    }
  });

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menuDropdown.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#menu-wrapper')) {
      menuDropdown.classList.remove('open');
    }
  });

   menuDropdown.addEventListener('click', (e) => {
     const btn = e.target.closest('button');
     if (!btn) return;
     const action = btn.dataset.action;
     menuDropdown.classList.remove('open');
     if (action === 'global-search') {
       openSearch();
     } else if (action === 'toggle-hide-completed') {
       state.hideCompleted = !state.hideCompleted;
       updateMenuIcon(state.hideCompleted);
       render();
       if (state.selectedId !== null) restoreFocus();
       schedulePersist();
      } else if (action === 'collapse-all') {
         collapseAll();
         schedulePersist();
       } else if (action === 'expand-all') {
         expandAll();
         schedulePersist();
       } else if (action === 'settings') {
         openSettings();
       } else if (action === 'version-history') {
         openVersionHistory();
       }
   });

  versionOverlay.addEventListener('click', (e) => {
    if (e.target === versionOverlay) {
      closeVersionHistory();
    }
    const restoreBtn = e.target.closest('[data-action="restore-version"]');
    if (restoreBtn) {
      const versionId = parseInt(restoreBtn.dataset.versionId, 10);
      restoreVersionFromHistory(versionId);
    }
  });

  versionClose.addEventListener('click', closeVersionHistory);

  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) {
      closeSettings();
      return;
    }
    const btn = e.target.closest('.settings-btn');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'import-file') {
      openImport();
    } else if (action === 'export-text') {
      downloadFile(exportPlainText(), 'jot-it-down.txt', 'text/plain');
    } else if (action === 'export-markdown') {
      downloadFile(exportMarkdown(), 'jot-it-down.md', 'text/markdown');
    } else if (action === 'export-json') {
      downloadFile(exportJSON(), 'jot-it-down.json', 'application/json');
    }
  });

  settingsClose.addEventListener('click', closeSettings);

  document.getElementById('no-keyboard-mode').addEventListener('change', (e) => {
    state.noKeyboardMode = e.target.value;
    updateActionBar();
    schedulePersist();
  });

  const actionBar = document.getElementById('action-bar');
  actionBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.action-btn');
    if (!btn) return;
    const action = btn.dataset.action;
    
    switch (action) {
      case 'undo':
        undo();
        break;
      case 'redo':
        redo();
        break;
      case 'indent':
        indentNode();
        break;
      case 'unindent':
        outdentNode();
        break;
      case 'focus-in':
        zoomIn();
        break;
      case 'focus-out':
        zoomOut();
        break;
    }
  });

  const importOverlay = document.getElementById('import-overlay');
  const importFileInput = document.getElementById('import-file-input');
  const importClose = document.getElementById('import-close');
  let importMode = null;
  let importedNodes = null;

  importOverlay.addEventListener('click', (e) => {
    if (e.target === importOverlay) {
      closeImport();
      return;
    }

    const modeBtn = e.target.closest('#import-mode-select button');
    if (modeBtn) {
      importMode = modeBtn.dataset.mode;
      document.getElementById('import-mode-select').style.display = 'none';
      document.getElementById('import-file-input-section').style.display = 'block';
      importFileInput.click();
      return;
    }

    const nodeItem = e.target.closest('.import-node-item');
    if (nodeItem && importedNodes) {
      const selectedId = parseInt(nodeItem.dataset.id, 10);
      const targetNode = getNode(selectedId);
      if (targetNode) {
        targetNode.children.push(...importedNodes);
        saveSnapshot();
        render();
        closeImport();
        closeSettings();
      }
      return;
    }
  });

  importFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) {
      document.getElementById('import-mode-select').style.display = 'block';
      document.getElementById('import-file-input-section').style.display = 'none';
      return;
    }

    const text = await file.text();
    const extension = file.name.split('.').pop().toLowerCase();

    let nodes = [];
    if (extension === 'json') {
      nodes = parseJSON(text);
    } else if (extension === 'md') {
      nodes = parseMarkdown(text);
    } else if (extension === 'txt') {
      nodes = parsePlainText(text);
    }

    if (nodes.length === 0) {
      alert('failed to parse file');
      closeImport();
      return;
    }

    if (importMode === 'replace') {
      state.root.children = nodes;
      setTimeout(() => {
        saveSnapshot();
        render();
        closeImport();
        closeSettings();
      }, 5000);
      alert('will replace in 5 seconds...');
    } else {
      importedNodes = nodes;
      showImportNodeSelect();
    }
  });

  importClose.addEventListener('click', closeImport);

  outliner.addEventListener('paste', (e) => {
    const el = e.target;
    if (!el || !el.classList.contains('node-text')) return;

    const text = e.clipboardData.getData('text/plain');
    const lines = text.split('\n').filter(line => line !== '');

    if (lines.length <= 1) {
      return;
    }

    e.preventDefault();
    saveCurrentText();
    if (state.selectedId === null) {
      for (let i = 0; i < lines.length; i++) {
        if (i === 0) {
          createFirstNode(lines[i]);
        } else {
          addSibling(lines[i]);
        }
      }
      return;
    }

    const node = getNode(state.selectedId);
    if (!node) return;

    const currentText = el.textContent || '';
    const sel = window.getSelection();
    const cursorPos = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).startOffset : 0;

    const beforeText = currentText.slice(0, cursorPos);
    const afterText = currentText.slice(cursorPos);

    node.text = beforeText + lines[0];

    for (let i = 1; i < lines.length; i++) {
      const newText = i === lines.length - 1 ? lines[i] + afterText : lines[i];
      addSibling(newText);
    }

    saveSnapshot();
    render();
  }, true);

  outliner.addEventListener('cut', (e) => {
    const el = e.target;
    if (!el || !el.classList.contains('node-text')) return;
    setTimeout(() => {
      saveCurrentText();
      schedulePersist();
    }, 0);
  }, true);

  outliner.addEventListener('copy', (e) => {
    const el = e.target;
    if (!el || !el.classList.contains('node-text')) return;
    saveCurrentText();
  }, true);

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el && el.classList.contains('node-text') && el.contentEditable === 'true') {
      const nodeEl = el.closest('.node');
      if (nodeEl) {
        const id = parseInt(nodeEl.dataset.id, 10);
        if (id === state.selectedId) {
          const node = getNode(state.selectedId);
          if (node) {
            node.text = el.textContent || '';
          }
          const sel = window.getSelection();
          state.cursorOffset = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).startOffset : 0;
          schedulePersist();
        }
      }
     }
    }, true);

  /* mobile keyboard handling */
  if (typeof visualViewport !== 'undefined') {
    visualViewport.addEventListener('resize', () => {
      const app = document.getElementById('app');
      if (app) {
        app.style.height = window.innerHeight + 'px';
      }
    });
  }

  /* prevent topbar/action-bar from being hidden by mobile keyboard */
  document.addEventListener('focusin', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      setTimeout(() => {
        e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, true);
}

document.addEventListener('DOMContentLoaded', init);
