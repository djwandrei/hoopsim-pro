/*
 * Public renderer for the structured Fan Tools visual editor.
 * Only allow-listed text, image, and presentation values are applied. Saved
 * documents cannot provide markup, scripts, selectors beyond the current DOM,
 * or arbitrary CSS declarations.
 */
(() => {
  'use strict';

  const PAGE_KEYS = Object.freeze({
    '/tools/': 'fan-tools',
    '/lineup-lab/': 'lineup-lab',
    '/tools/collection-lineup-builder/': 'collection-lineup-builder',
    '/tools/draft-night/': 'draft-night',
    '/tools/fix-the-five/': 'fix-the-five',
    '/tools/franchise-rebuild-challenge/': 'franchise-rebuild-challenge',
    '/tools/player-card-matchups/': 'player-card-matchups',
    '/tools/position-lens/': 'position-lens',
    '/tools/research/': 'research',
    '/tools/roster-fit-simulator/': 'roster-fit-simulator',
    '/tools/shared-result/': 'shared-result',
    '/tools/swishiq-studio/': 'swishiq-studio',
    '/tools/swishiq-studio/career/': 'career-lab',
    '/tools/swishiq-studio/chemistry/': 'chemistry-lab',
    '/tools/swishiq-studio/forge/': 'composite-forge',
    '/tools/swishiq-studio/game/': 'game-lab',
    '/tools/swishiq-studio/players/': 'player-blueprints',
    '/tools/swishiq-studio/players/compare/': 'player-compare',
    '/tools/swishiq-studio/players/dossier/': 'player-dossier',
    '/tools/swishiq-studio/season/': 'season-lab',
    '/tools/swishiq-studio/spin/': 'spin-room',
    '/tools/team-dna-atlas/': 'team-dna-atlas',
    '/tools/trade-package-builder/': 'trade-package-builder',
    '/tools/virtual-pack-opening/': 'virtual-pack-opening',
    '/tools/workshop/': 'workshop',
  });
  const FONT_FAMILIES = Object.freeze({
    inter: 'Inter, sans-serif',
    bebas: '"Bebas Neue", sans-serif',
    lobster: '"Lobster Two", cursive',
    system: 'system-ui, sans-serif',
    serif: 'Georgia, serif',
  });
  const CONTENT_TAGS = new Set(['a', 'b', 'br', 'code', 'em', 'i', 'li', 'mark', 'ol', 'p', 's', 'small', 'span', 'strong', 'u', 'ul']);
  const originalState = new WeakMap();
  const modifiedElements = new Set();

  function pageKey() {
    return PAGE_KEYS[window.location.pathname] || '';
  }

  function safeText(value, max = 12000) {
    return typeof value === 'string' ? value.slice(0, max) : '';
  }

  function safeImageUrl(value) {
    const raw = String(value || '').trim();
    if (!raw || raw.length > 2048) return '';
    try {
      const url = new URL(raw, window.location.href);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
        ? url.href
        : '';
    } catch {
      return '';
    }
  }

  function finitePx(value, min, max) {
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max ? `${number}px` : '';
  }

  function safeColor(value) {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '';
  }

  function safeStyle(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const output = {};
    const fontKey = String(input.fontFamily || '');
    if (FONT_FAMILIES[fontKey]) output.fontFamily = FONT_FAMILIES[fontKey];
    const fontSize = finitePx(input.fontSize, 10, 96);
    if (fontSize) output.fontSize = fontSize;
    const color = safeColor(input.color);
    if (color) output.color = color;
    const backgroundColor = safeColor(input.backgroundColor);
    if (backgroundColor) output.backgroundColor = backgroundColor;
    const maxWidth = finitePx(input.maxWidth, 160, 1800);
    if (maxWidth) output.maxWidth = maxWidth;
    const width = finitePx(input.width, 40, 1800);
    if (width) output.width = width;
    const padding = finitePx(input.padding, 0, 160);
    if (padding) output.padding = padding;
    const marginBottom = finitePx(input.marginBottom, 0, 160);
    if (marginBottom) output.marginBottom = marginBottom;
    const borderRadius = finitePx(input.borderRadius, 0, 100);
    if (borderRadius) output.borderRadius = borderRadius;
    const gap = finitePx(input.gap, 0, 100);
    if (gap) output.gap = gap;
    const height = finitePx(input.height, 24, 1600);
    if (height) output.height = height;
    const minHeight = finitePx(input.minHeight, 80, 1200);
    if (minHeight) output.minHeight = minHeight;
    const borderWidth = finitePx(input.borderWidth, 0, 20);
    if (borderWidth !== '') {
      output.borderWidth = borderWidth;
      output.borderStyle = 'solid';
    }
    const borderColor = safeColor(input.borderColor);
    if (borderColor) {
      output.borderColor = borderColor;
      output.borderStyle = 'solid';
    }
    const fontWeight = Number(input.fontWeight);
    if (Number.isInteger(fontWeight) && fontWeight >= 300 && fontWeight <= 900) output.fontWeight = String(fontWeight);
    const lineHeight = Number(input.lineHeight);
    if (Number.isFinite(lineHeight) && lineHeight >= 1 && lineHeight <= 3) output.lineHeight = String(lineHeight);
    if (['block', 'flex', 'grid', 'inline-block', 'none'].includes(input.display)) output.display = input.display;
    if (['left', 'center', 'right', 'justify'].includes(input.textAlign)) output.textAlign = input.textAlign;
    if (['row', 'column', 'row-reverse', 'column-reverse'].includes(input.flexDirection)) output.flexDirection = input.flexDirection;
    if (['flex-start', 'center', 'flex-end', 'space-between', 'space-around'].includes(input.justifyContent)) output.justifyContent = input.justifyContent;
    if (['stretch', 'center', 'flex-start', 'flex-end', 'baseline'].includes(input.alignItems)) output.alignItems = input.alignItems;
    if (['cover', 'contain', 'fill', 'none'].includes(input.objectFit)) output.objectFit = input.objectFit;
    const columns = Number(input.columns);
    if (Number.isInteger(columns) && columns >= 1 && columns <= 4) {
      output.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
    }
    return output;
  }

  function setStyles(element, style) {
    Object.entries(safeStyle(style)).forEach(([property, value]) => {
      element.style[property] = value;
    });
  }

  function applyTextPatch(element, patch) {
    if (typeof patch.text !== 'string') return;
    const nodes = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE);
    const index = Number.isInteger(patch.textIndex) && patch.textIndex >= 0 ? patch.textIndex : 0;
    if (nodes[index]) nodes[index].nodeValue = safeText(patch.text);
    else if (!element.children.length) element.append(document.createTextNode(safeText(patch.text)));
  }

  function safeContentNodes(input, depth = 0, budget = { remaining: 500 }) {
    if (!Array.isArray(input) || depth > 12) return [];
    const output = [];
    for (const item of input) {
      budget.remaining -= 1;
      if (budget.remaining < 0 || !item || typeof item !== 'object' || Array.isArray(item)) break;
      if (typeof item.text === 'string' && Object.keys(item).every(key => key === 'text')) {
        output.push({ text: safeText(item.text) });
        continue;
      }
      const tag = String(item.tag || '').toLowerCase();
      if (!CONTENT_TAGS.has(tag) || !Array.isArray(item.children)) continue;
      const attrs = {};
      if (tag === 'a' && item.attrs && typeof item.attrs === 'object' && !Array.isArray(item.attrs)) {
        const href = safeLinkUrl(item.attrs.href);
        if (href) attrs.href = href;
        if (typeof item.attrs.title === 'string') attrs.title = safeText(item.attrs.title, 300);
        if (item.attrs.target === '_blank') {
          attrs.target = '_blank';
          attrs.rel = 'noopener noreferrer';
        }
      }
      output.push({ tag, attrs, children: safeContentNodes(item.children, depth + 1, budget) });
    }
    return output;
  }

  function safeLinkUrl(value) {
    const raw = String(value || '').trim();
    if (!raw || raw.length > 2048) return '';
    try {
      const url = new URL(raw, window.location.href);
      return ['http:', 'https:', 'mailto:'].includes(url.protocol) && !url.username && !url.password
        ? url.href
        : '';
    } catch {
      return '';
    }
  }

  function createContentNodes(input) {
    return safeContentNodes(input).map(item => {
      if (Object.hasOwn(item, 'text')) return document.createTextNode(item.text);
      const element = document.createElement(item.tag);
      Object.entries(item.attrs).forEach(([name, value]) => element.setAttribute(name, value));
      if (item.tag !== 'br') element.append(...createContentNodes(item.children));
      return element;
    });
  }

  function applyElementPatch(patch) {
    if (!patch || typeof patch.selector !== 'string' || patch.selector.length > 1800) return;
    let element;
    try { element = document.querySelector(patch.selector); } catch { return; }
    if (!element || element.tagName.toLowerCase() !== String(patch.tag || '').toLowerCase()) return;
    if (/^(script|style|iframe|object|embed|link|meta|base|template)$/i.test(element.tagName)) return;
    if (!originalState.has(element)) {
      originalState.set(element, {
        style: element.getAttribute('style'),
        childNodes: [...element.childNodes],
        text: [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => ({ node, value: node.nodeValue })),
        src: element instanceof HTMLImageElement ? element.getAttribute('src') : null,
        alt: element instanceof HTMLImageElement ? element.getAttribute('alt') : null,
        parent: element.parentNode,
        previousSibling: element.previousSibling,
        nextSibling: element.nextSibling,
        contentChanged: false,
      });
    }
    modifiedElements.add(element);
    applyTextPatch(element, patch);
    if (Array.isArray(patch.content)) {
      const original = originalState.get(element);
      original.contentChanged = true;
      element.replaceChildren(...createContentNodes(patch.content));
    }
    if (element instanceof HTMLImageElement) {
      const source = safeImageUrl(patch.src);
      if (source) element.src = source;
      if (typeof patch.alt === 'string') element.alt = safeText(patch.alt, 1000);
    }
    if (patch.hidden === true) element.style.display = 'none';
    setStyles(element, patch.style);
  }

  function resolveSelector(selector) {
    if (typeof selector !== 'string' || selector.length > 1800) return null;
    try { return document.querySelector(selector); } catch { return null; }
  }

  function appendAddition(addition, placement = {}) {
    if (!addition || typeof addition !== 'object' || typeof addition.parentSelector !== 'string') return;
    const parent = placement.parent || resolveSelector(addition.parentSelector);
    if (!parent || /^(script|style|iframe|object|embed|link|meta|base|template|form)$/i.test(parent.tagName)) return;

    let node;
    const type = String(addition.type || '');
    if (type === 'text') {
      node = document.createElement('p');
      node.textContent = safeText(addition.text);
    } else if (type === 'image') {
      const source = safeImageUrl(addition.src);
      if (!source) return;
      node = document.createElement('figure');
      const image = document.createElement('img');
      image.src = source;
      image.alt = safeText(addition.alt, 1000);
      image.loading = 'lazy';
      image.decoding = 'async';
      image.style.maxWidth = '100%';
      image.style.height = 'auto';
      setStyles(image, addition.imageStyle);
      node.append(image);
      const caption = safeText(addition.text, 2000);
      if (caption) {
        const figcaption = document.createElement('figcaption');
        figcaption.textContent = caption;
        node.append(figcaption);
      }
    } else if (type === 'section') {
      node = document.createElement('section');
      const heading = document.createElement('h2');
      heading.textContent = safeText(addition.title || 'New section', 300);
      node.append(heading);
      const copy = safeText(addition.text);
      if (copy) {
        const paragraph = document.createElement('p');
        paragraph.textContent = copy;
        node.append(paragraph);
      }
    } else {
      return;
    }

    node.classList.add('fan-tools-editor-added-content');
    node.dataset.fanEditorAdded = String(addition.id || 'content').replace(/[^a-z0-9_-]/gi, '').slice(0, 80);
    setStyles(node, addition.style);
    if (addition.hidden === true) node.style.display = 'none';
    const before = placement.before || null;
    if (before?.parentElement === parent) parent.insertBefore(node, before);
    else parent.append(node);
  }

  function applyDocument(documentValue) {
    if (!documentValue || typeof documentValue !== 'object' || documentValue.version !== 1) return;
    const elements = Array.isArray(documentValue.elements) ? documentValue.elements.slice(0, 800) : [];
    const additions = Array.isArray(documentValue.additions) ? documentValue.additions.slice(0, 200) : [];
    modifiedElements.forEach(element => {
      const original = originalState.get(element);
      if (!original || !element.isConnected) return;
      if (original.style === null) element.removeAttribute('style');
      else element.setAttribute('style', original.style);
      if (original.contentChanged) element.replaceChildren(...original.childNodes);
      original.text.forEach(item => {
        if (item.node.parentNode === element) item.node.nodeValue = item.value;
      });
      const originalNodes = new Set(original.childNodes);
      [...element.childNodes].forEach(node => {
        if (node.nodeType === Node.TEXT_NODE && !originalNodes.has(node)) node.remove();
      });
      if (element instanceof HTMLImageElement) {
        if (original.src === null) element.removeAttribute('src');
        else element.setAttribute('src', original.src);
        if (original.alt === null) element.removeAttribute('alt');
        else element.setAttribute('alt', original.alt);
      }
    });
    modifiedElements.forEach(element => {
      const original = originalState.get(element);
      const parent = original?.parent;
      if (!parent?.isConnected || element.parentNode === parent && element.nextSibling === original.nextSibling) return;
      if (original.nextSibling?.parentNode === parent) parent.insertBefore(element, original.nextSibling);
      else if (original.previousSibling?.parentNode === parent) parent.insertBefore(element, original.previousSibling.nextSibling);
      else parent.append(element);
    });
    modifiedElements.clear();
    document.querySelectorAll('[data-fan-editor-added]').forEach(node => node.remove());
    const moveTargets = elements.map(patch => ({
      patch,
      element: resolveSelector(patch?.selector),
      parent: resolveSelector(patch?.move?.parentSelector),
      before: resolveSelector(patch?.move?.beforeSelector),
    }));
    const additionTargets = additions.map(addition => ({
      parent: resolveSelector(addition?.parentSelector),
      before: resolveSelector(addition?.beforeSelector),
    }));
    additions.forEach((addition, index) => appendAddition(addition, additionTargets[index]));
    elements
      .slice()
      .sort((left, right) => String(left?.selector || '').split('>').length - String(right?.selector || '').split('>').length)
      .forEach(applyElementPatch);
    additions.forEach((addition, index) => {
      const id = String(addition?.id || 'content').replace(/[^a-z0-9_-]/gi, '').slice(0, 80);
      const node = document.querySelector(`[data-fan-editor-added="${id}"]`);
      const placement = additionTargets[index] || {};
      const parent = placement.parent || resolveSelector(addition?.parentSelector);
      const before = placement.before || resolveSelector(addition?.beforeSelector);
      if (!node || !parent || node === parent || node.contains(parent) || /^(script|style|iframe|object|embed|link|meta|base|template|form)$/i.test(parent.tagName)) return;
      parent.insertBefore(node, before?.parentElement === parent && before !== node && !node.contains(before) ? before : null);
    });
    moveTargets.forEach(({ patch, element, parent, before }) => {
      const movingElement = element || resolveSelector(patch?.selector);
      const destination = parent || resolveSelector(patch?.move?.parentSelector);
      const insertionTarget = before || resolveSelector(patch?.move?.beforeSelector);
      if (!patch?.move || !movingElement || !destination || movingElement === destination || movingElement.contains(destination)) return;
      if (/^(script|style|iframe|object|embed|link|meta|base|template|form)$/i.test(movingElement.tagName)
        || /^(script|style|iframe|object|embed|link|meta|base|template|form)$/i.test(destination.tagName)) return;
      const insertionPoint = insertionTarget?.parentElement === destination && insertionTarget !== movingElement && !movingElement.contains(insertionTarget) ? insertionTarget : null;
      destination.insertBefore(movingElement, insertionPoint);
    });
  }

  function waitForClientRenderedRoot() {
    const root = document.getElementById('root');
    if (!root || root.children.length) return Promise.resolve();
    return new Promise(resolve => {
      let timer = 0;
      const finish = () => {
        observer.disconnect();
        if (timer) window.clearTimeout(timer);
        resolve();
      };
      const observer = new MutationObserver(() => {
        if (root.children.length) finish();
      });
      observer.observe(root, { childList: true });
      timer = window.setTimeout(finish, 7000);
    });
  }

  function loadPublishedDesign() {
    const key = pageKey();
    if (!key || new URLSearchParams(window.location.search).has('fanDesigner')) return;

    const begin = async () => {
      try {
        const response = await fetch('/fan-tools-editor-api.php?action=published&pageKey=' + encodeURIComponent(key), {
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) return;
        const payload = await response.json();
        if (payload.design?.document) {
          await waitForClientRenderedRoot();
          applyDocument(payload.design.document);
        }
      } catch {
        // Published overrides are optional; the hand-authored page remains usable.
      }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', begin, { once: true });
    else void begin();
  }

  window.DJFanToolsDesign = Object.freeze({ applyDocument });
  loadPublishedDesign();
})();
