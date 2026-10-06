/* Admin visual editor for supported Fan Tools presentation changes. */
(() => {
  'use strict';

  const PAGES = Object.freeze([
    { key: 'fan-tools', label: 'Fan Tools home', path: '/tools/' },
    { key: 'lineup-lab', label: 'Lineup Lab', path: '/lineup-lab/' },
    { key: 'collection-lineup-builder', label: 'Collection Lineup Builder', path: '/tools/collection-lineup-builder/' },
    { key: 'draft-night', label: 'Draft Night', path: '/tools/draft-night/' },
    { key: 'fix-the-five', label: 'Fix the Five', path: '/tools/fix-the-five/' },
    { key: 'franchise-rebuild-challenge', label: 'Franchise Rebuild Challenge', path: '/tools/franchise-rebuild-challenge/' },
    { key: 'player-card-matchups', label: 'Player Card Matchups', path: '/tools/player-card-matchups/' },
    { key: 'position-lens', label: 'Position Lens', path: '/tools/position-lens/' },
    { key: 'research', label: 'Research', path: '/tools/research/' },
    { key: 'roster-fit-simulator', label: 'Roster Fit Simulator', path: '/tools/roster-fit-simulator/' },
    { key: 'shared-result', label: 'Shared Result', path: '/tools/shared-result/' },
    { key: 'swishiq-studio', label: 'SwishIQ Studio', path: '/tools/swishiq-studio/' },
    { key: 'career-lab', label: 'SwishIQ Career Lab', path: '/tools/swishiq-studio/career/' },
    { key: 'chemistry-lab', label: 'SwishIQ Chemistry Lab', path: '/tools/swishiq-studio/chemistry/' },
    { key: 'composite-forge', label: 'SwishIQ Composite Forge', path: '/tools/swishiq-studio/forge/' },
    { key: 'game-lab', label: 'SwishIQ Game Lab', path: '/tools/swishiq-studio/game/' },
    { key: 'player-blueprints', label: 'SwishIQ Player Blueprints', path: '/tools/swishiq-studio/players/' },
    { key: 'player-compare', label: 'SwishIQ Player Comparison', path: '/tools/swishiq-studio/players/compare/' },
    { key: 'player-dossier', label: 'SwishIQ Player Dossier', path: '/tools/swishiq-studio/players/dossier/' },
    { key: 'season-lab', label: 'SwishIQ Season Lab', path: '/tools/swishiq-studio/season/' },
    { key: 'spin-room', label: 'SwishIQ Spin Room', path: '/tools/swishiq-studio/spin/' },
    { key: 'team-dna-atlas', label: 'Team DNA Atlas', path: '/tools/team-dna-atlas/' },
    { key: 'trade-package-builder', label: 'Trade Package Builder', path: '/tools/trade-package-builder/' },
    { key: 'virtual-pack-opening', label: 'Virtual Pack Opening', path: '/tools/virtual-pack-opening/' },
    { key: 'workshop', label: 'Workshop', path: '/tools/workshop/' },
  ]);
  const SWISHIQ_PAGE_KEYS = new Set([
    'swishiq-studio', 'career-lab', 'chemistry-lab', 'composite-forge', 'game-lab',
    'player-blueprints', 'player-compare', 'player-dossier', 'season-lab', 'spin-room',
  ]);
  const PAGE_GROUPS = Object.freeze([
    { label: 'Fan Tools', pages: PAGES.filter(page => !SWISHIQ_PAGE_KEYS.has(page.key)) },
    { label: 'SwishIQ Studio', pages: PAGES.filter(page => SWISHIQ_PAGE_KEYS.has(page.key)) },
  ]);
  const FONT_OPTIONS = Object.freeze([
    ['inter', 'Inter'], ['bebas', 'Bebas Neue'], ['lobster', 'Lobster Two'],
    ['system', 'System'], ['serif', 'Georgia'],
  ]);
  const EMPTY_DOCUMENT = () => ({ version: 1, elements: [], additions: [] });
  const SELECTABLE = 'img,h1,h2,h3,h4,h5,h6,p,span,a,button,li,section,article,div,figure,figcaption,header,footer,label';
  const EDITABLE_CONTENT_TAGS = new Set(['a', 'b', 'br', 'code', 'em', 'i', 'li', 'mark', 'ol', 'p', 's', 'small', 'span', 'strong', 'u', 'ul']);
  const STYLE_FIELDS = Object.freeze({
    fontFamily: 'fanEditorFont', fontSize: 'fanEditorFontSize', color: 'fanEditorTextColor',
    backgroundColor: 'fanEditorBackground', maxWidth: 'fanEditorMaxWidth', width: 'fanEditorWidth',
    padding: 'fanEditorPadding', marginBottom: 'fanEditorMargin', borderRadius: 'fanEditorRadius',
    gap: 'fanEditorGap', height: 'fanEditorHeight', minHeight: 'fanEditorMinHeight',
    borderWidth: 'fanEditorBorderWidth', borderColor: 'fanEditorBorderColor', fontWeight: 'fanEditorFontWeight',
    lineHeight: 'fanEditorLineHeight', display: 'fanEditorDisplay', textAlign: 'fanEditorAlign',
    flexDirection: 'fanEditorFlexDirection', justifyContent: 'fanEditorJustify', alignItems: 'fanEditorAlignItems',
    objectFit: 'fanEditorObjectFit', columns: 'fanEditorColumns',
  });

  const state = {
    pageKey: PAGES[0].key,
    documents: new Map(),
    selected: null,
    dirty: false,
    saving: false,
    changeRevision: 0,
    rows: new Map(),
    frameReady: false,
    authSubscription: null,
    frameObserver: null,
    frameResizeObserver: null,
    frameOverlay: null,
    dragOperation: null,
    dropHighlight: null,
    resizeMark: 0,
    inspectorTab: 'design',
    frameHealthTimer: null,
    previewMode: 'desktop',
  };

  function byId(id) { return document.getElementById(id); }
  function isElement(value) { return Boolean(value && value.nodeType === 1 && value.tagName); }
  function isImage(value) { return isElement(value) && value.tagName.toLowerCase() === 'img'; }
  function normalizeDocument(value) {
    if (!value || typeof value !== 'object' || value.version !== 1) return EMPTY_DOCUMENT();
    return {
      version: 1,
      elements: Array.isArray(value.elements) ? value.elements.slice(0, 800).map(item => ({ ...item })) : [],
      additions: Array.isArray(value.additions) ? value.additions.slice(0, 200).map(item => ({ ...item })) : [],
    };
  }
  function setStatus(message, kind = 'info') {
    const status = byId('fanEditorStatus');
    if (!status) return;
    const node = byId('fanEditorStatusText') || status;
    node.textContent = message;
    status.dataset.kind = kind;
  }
  function currentPage() { return PAGES.find(page => page.key === state.pageKey) || PAGES[0]; }
  function currentDocument() {
    if (!state.documents.has(state.pageKey)) state.documents.set(state.pageKey, EMPTY_DOCUMENT());
    return state.documents.get(state.pageKey);
  }
  function markDirty() {
    state.dirty = true;
    state.changeRevision += 1;
    syncActionButtons();
    setStatus(`Unsaved changes for ${currentPage().label}.`, 'dirty');
  }
  function sameDocument(left, right) {
    return JSON.stringify(normalizeDocument(left)) === JSON.stringify(normalizeDocument(right));
  }
  function cloneDocument(value) {
    return JSON.parse(JSON.stringify(normalizeDocument(value)));
  }
  function hasDraftToPublish(pageKey = state.pageKey) {
    const row = state.rows.get(pageKey);
    return Boolean(row?.draftDocument && !sameDocument(row.draftDocument, row.publishedDocument));
  }
  function syncActionButtons() {
    if (!byId('fanEditorPageSelect')) return;
    const hasUnsavedChanges = state.dirty;
    byId('fanEditorDiscard').disabled = state.saving || !hasUnsavedChanges;
    byId('fanEditorSaveDraft').disabled = state.saving || !hasUnsavedChanges;
    byId('fanEditorPublish').disabled = state.saving || (!hasUnsavedChanges && !hasDraftToPublish());
    byId('fanEditorPageSelect').disabled = state.saving;
  }
  function escapeSelectorPart(value) { return window.CSS?.escape ? CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }

  function buildSelector(element) {
    if (!isElement(element)) return 'body';
    const doc = element.ownerDocument;
    if (element.dataset.fanEditorOrigin) return element.dataset.fanEditorOrigin;
    if (element === doc.documentElement || element === doc.body) return 'body';
    if (element.id) {
      const selector = `#${escapeSelectorPart(element.id)}`;
      if (doc.querySelectorAll(selector).length === 1) return selector;
    }
    const parts = [];
    const addedRoot = element.closest('[data-fan-editor-added]');
    if (addedRoot) {
      const addedId = addedRoot.dataset.fanEditorAdded;
      let current = element;
      while (current && current !== addedRoot && parts.length < 12) {
        let part = current.tagName.toLowerCase();
        const siblings = current.parentElement
          ? [...current.parentElement.children].filter(child => child.tagName === current.tagName)
          : [];
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        parts.unshift(part);
        current = current.parentElement;
      }
      return `[data-fan-editor-added="${addedId}"]${parts.length ? ` > ${parts.join(' > ')}` : ''}`;
    }
    let current = element;
    let rootSelector = 'body';
    while (current && current !== doc.body && parts.length < 12) {
      let part = current.tagName.toLowerCase();
      if (current.id) {
        const idSelector = `#${escapeSelectorPart(current.id)}`;
        if (doc.querySelectorAll(idSelector).length === 1) {
          rootSelector = idSelector;
          break;
        }
      }
      const siblings = current.parentElement
        ? [...current.parentElement.children].filter(child => child.tagName === current.tagName)
        : [];
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      parts.unshift(part);
      current = current.parentElement;
    }
    return parts.length ? `${rootSelector} > ${parts.join(' > ')}` : rootSelector;
  }

  function preserveOriginSelectors(element) {
    if (!isElement(element)) return;
    const root = element.closest('[data-fan-editor-added]') || element;
    const candidates = [root, ...root.querySelectorAll('*')];
    if (root.parentElement) candidates.push(root.parentElement, ...root.parentElement.children);
    candidates.forEach(candidate => {
      if (isElement(candidate) && !candidate.dataset.fanEditorOrigin) {
        candidate.dataset.fanEditorOrigin = buildSelector(candidate);
      }
    });
  }

  function getElementPatch(element, create = false) {
    const addedRoot = element.closest('[data-fan-editor-added]');
    if (addedRoot) {
      return currentDocument().additions.find(item => item.id === addedRoot.dataset.fanEditorAdded) || null;
    }
    const selector = buildSelector(element);
    let patch = currentDocument().elements.find(item => item.selector === selector && item.tag === element.tagName.toLowerCase());
    if (!patch && create) {
      patch = { selector, tag: element.tagName.toLowerCase(), style: {} };
      currentDocument().elements.push(patch);
    }
    return patch;
  }

  function frameWindow() {
    try { return byId('fanEditorPreview')?.contentWindow || null; } catch { return null; }
  }
  function applyPreview() {
    const target = frameWindow();
    if (!target?.DJFanToolsDesign) return;
    try {
      target.DJFanToolsDesign.applyDocument(currentDocument());
      const element = selectedElement();
      if (element) {
        if (state.selected?.token) element.dataset.fanEditorToken = state.selected.token;
        highlightElement(element);
        refreshCodePanel(element, false);
        updateSelectionOverlay();
      }
    }
    catch (error) { setStatus(`Preview update failed: ${error.message}`, 'error'); }
  }
  function frameDocument() {
    try { return byId('fanEditorPreview')?.contentDocument || null; } catch { return null; }
  }
  function setInputValue(id, value) { const input = byId(id); if (input) input.value = value ?? ''; }
  function directText(element, index = 0) {
    const textNodes = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE);
    return textNodes[index]?.nodeValue?.trim() || '';
  }
  function conciseText(value, max = 54) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
  }
  function describeElement(element) {
    const tag = element.tagName.toLowerCase();
    const labels = {
      h1: 'Page title', h2: 'Heading', h3: 'Subheading', h4: 'Subheading', h5: 'Small heading', h6: 'Small heading',
      p: 'Paragraph', span: 'Text', img: 'Image', a: 'Link', button: 'Button', li: 'List item',
      section: 'Section', article: 'Content area', div: 'Content area', figure: 'Image block',
      figcaption: 'Image caption', header: 'Header', footer: 'Footer', label: 'Form label',
    };
    const label = labels[tag] || 'Page element';
    const detail = isImage(element)
      ? element.alt
      : directText(element) || element.querySelector('h1,h2,h3,h4,h5,h6')?.textContent || element.textContent;
    const summary = conciseText(detail);
    return summary ? `${label} · ${summary}` : label;
  }
  function colorValue(value, fallback = '#111827') {
    const match = String(value || '').match(/^#([\da-f]{6})$/i);
    if (match) return `#${match[1]}`;
    const rgb = String(value || '').match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!rgb) return fallback;
    return `#${rgb.slice(1, 4).map(item => Number(item).toString(16).padStart(2, '0')).join('')}`;
  }
  function selectedElement() {
    const doc = frameDocument();
    if (!doc || !state.selected?.selector) return null;
    if (state.selected.token) {
      const selected = [...doc.querySelectorAll('[data-fan-editor-token]')]
        .find(element => element.dataset.fanEditorToken === state.selected.token);
      if (selected) return selected;
    }
    try { return doc.querySelector(state.selected.selector); } catch { return null; }
  }
  function getComputedStyleValue(element, property) {
    const target = frameWindow();
    return target && element ? target.getComputedStyle(element)[property] : '';
  }
  function populateInspector(element) {
    preserveOriginSelectors(element);
    const patch = getElementPatch(element, false) || {};
    const style = isImage(element) && element.closest('[data-fan-editor-added]') ? (patch.imageStyle || {}) : (patch.style || {});
    const token = element.dataset.fanEditorToken || `ft${++state.resizeMark}`;
    element.dataset.fanEditorToken = token;
    state.selected = { selector: buildSelector(element), token, tag: element.tagName.toLowerCase(), label: describeElement(element) };
    byId('fanEditorSelectedLabel').textContent = state.selected.label;
    byId('fanEditorSelectedControls').hidden = false;
    byId('fanEditorSelectionHint').hidden = true;
    byId('fanEditorClearSelection').hidden = false;
    const canEditText = !['img', 'input', 'textarea', 'select', 'svg', 'path', 'canvas', 'video', 'audio'].includes(state.selected.tag);
    byId('fanEditorTextField').hidden = !canEditText;
    byId('fanEditorText').disabled = Array.isArray(patch.content);
    byId('fanEditorTextField').title = Array.isArray(patch.content) ? 'This element has safe HTML content. Edit it in the Code & files tab.' : '';
    const additionHeading = patch.type === 'section' && state.selected.tag === 'h2';
    setInputValue('fanEditorText', (additionHeading ? patch.title : patch.text) ?? directText(element, patch.textIndex || 0));
    byId('fanEditorImageFields').hidden = !isImage(element);
    setInputValue('fanEditorImageUrl', patch.src ?? (isImage(element) ? element.getAttribute('src') : ''));
    setInputValue('fanEditorImageAlt', patch.alt ?? (isImage(element) ? element.alt : ''));
    setInputValue('fanEditorFont', style.fontFamily || '');
    const computedSize = Number.parseFloat(style.fontSize || getComputedStyleValue(element, 'fontSize'));
    setInputValue('fanEditorFontSize', Number.isFinite(computedSize) ? Math.min(96, Math.max(10, Math.round(computedSize))) : '');
    setInputValue('fanEditorTextColor', colorValue(style.color || getComputedStyleValue(element, 'color')));
    setInputValue('fanEditorBackground', colorValue(style.backgroundColor || getComputedStyleValue(element, 'backgroundColor'), '#ffffff'));
    ['maxWidth', 'width', 'padding', 'marginBottom', 'borderRadius', 'gap', 'height', 'minHeight', 'borderWidth', 'fontWeight', 'lineHeight'].forEach(key => {
      const raw = style[key] || getComputedStyleValue(element, key);
      const number = Number.parseFloat(raw);
      setInputValue(STYLE_FIELDS[key], Number.isFinite(number) && number ? Math.round(number) : '');
    });
    setInputValue(STYLE_FIELDS.borderColor, colorValue(style.borderColor || getComputedStyleValue(element, 'borderColor')));
    setInputValue('fanEditorDisplay', style.display || '');
    setInputValue('fanEditorAlign', style.textAlign || getComputedStyleValue(element, 'textAlign') || 'left');
    ['flexDirection', 'justifyContent', 'alignItems', 'objectFit'].forEach(key => {
      const value = style[key] || getComputedStyleValue(element, key) || '';
      setInputValue(STYLE_FIELDS[key], value);
    });
    const columns = style.columns || '';
    setInputValue('fanEditorColumns', columns);
    const isAdded = element.closest('[data-fan-editor-added]');
    byId('fanEditorRemoveBlock').hidden = !isAdded;
    byId('fanEditorResetElement').hidden = Boolean(isAdded);
    byId('fanEditorHide').textContent = patch.hidden ? 'Show element' : 'Hide element';
    byId('fanEditorAddParentHint').textContent = describeContentParent();
    byId('fanEditorText').disabled = false;
    refreshCodePanel(element);
    updateSelectionOverlay();
  }

  function clearInspector() {
    state.selected = null;
    byId('fanEditorSelectedLabel').textContent = 'Select an element in the preview';
    byId('fanEditorSelectedControls').hidden = true;
    byId('fanEditorSelectionHint').hidden = false;
    byId('fanEditorClearSelection').hidden = true;
    byId('fanEditorTextField').hidden = true;
    byId('fanEditorImageFields').hidden = true;
    byId('fanEditorRemoveBlock').hidden = true;
    byId('fanEditorResetElement').hidden = false;
    byId('fanEditorAddParentHint').textContent = describeContentParent();
    setInspectorTab('design');
    refreshCodePanel(null);
    updateSelectionOverlay();
  }

  function highlightElement(element) {
    const doc = frameDocument();
    if (!doc) return;
    doc.querySelectorAll('.fan-editor-selected-outline').forEach(node => node.classList.remove('fan-editor-selected-outline'));
    element.classList.add('fan-editor-selected-outline');
  }

  function pageFilePath() {
    const path = currentPage().path;
    return path.endsWith('/') ? `${path}index.html` : path;
  }

  function toSitePath(value) {
    try {
      const url = new URL(value, window.location.href);
      return url.origin === window.location.origin ? `${url.pathname}${url.search}` : url.href;
    } catch { return String(value || ''); }
  }

  function safeMarkupTree(markup) {
    const doc = frameDocument();
    if (!doc) throw new Error('The page preview is not ready.');
    const template = doc.createElement('template');
    template.innerHTML = String(markup || '');
    let count = 0;
    function readNode(node, depth = 0) {
      count += 1;
      if (count > 500 || depth > 12) throw new Error('Keep the content to 500 items or fewer and 12 levels deep.');
      if (node.nodeType === 3) return { text: node.nodeValue || '' };
      if (node.nodeType !== 1) throw new Error('Comments and other special markup are not supported.');
      const tag = node.tagName.toLowerCase();
      if (!EDITABLE_CONTENT_TAGS.has(tag)) throw new Error(`<${tag}> is not supported in safe content edits.`);
      const attrs = {};
      for (const attribute of node.attributes) {
        const name = attribute.name.toLowerCase();
        if (name === 'data-fan-editor-origin' || name === 'data-fan-editor-token') continue;
        if (tag !== 'a' || !['href', 'title', 'target', 'rel'].includes(name)) {
          throw new Error(`The ${name} attribute is not supported in safe content edits.`);
        }
        if (name === 'href') {
          let parsed;
          try { parsed = new URL(attribute.value, window.location.href); } catch { parsed = null; }
          if (!parsed || !['http:', 'https:', 'mailto:'].includes(parsed.protocol) || parsed.username || parsed.password) {
            throw new Error('Links must use an https://, http://, or mailto: address.');
          }
          attrs.href = parsed.href;
        } else if (name === 'target') {
          if (!['_blank', '_self'].includes(attribute.value)) throw new Error('Links may open this tab or a new tab.');
          attrs.target = attribute.value;
        } else if (name === 'title') attrs.title = attribute.value.slice(0, 300);
        else if (name === 'rel' && !/^(noopener noreferrer|noreferrer noopener|nofollow|noopener|noreferrer)$/.test(attribute.value)) {
          throw new Error('The link relationship value is not supported.');
        }
      }
      if (tag === 'a' && !attrs.href) throw new Error('Add a safe href to each link.');
      return { tag, attrs, children: [...node.childNodes].map(child => readNode(child, depth + 1)) };
    }
    return [...template.content.childNodes].map(node => readNode(node));
  }

  function canEditMarkup(element) {
    if (!isElement(element) || !element.dataset.fanEditorOrigin || element.closest('[data-fan-editor-added]')) return false;
    if (['img', 'input', 'textarea', 'select', 'svg', 'path', 'canvas', 'video', 'audio', 'source'].includes(element.tagName.toLowerCase())) return false;
    if (element.querySelector('button,input,textarea,select,form,iframe,canvas,video,audio,[role="button"],[contenteditable="true"],[data-reactroot]')) return false;
    if ([...element.querySelectorAll('*')].some(child => child.tagName.includes('-'))) return false;
    try { safeMarkupTree(element.innerHTML); return true; } catch { return false; }
  }

  function refreshCodePanel(element, resetMarkup = true) {
    if (!byId('fanEditorCodePanel')) return;
    byId('fanEditorCodeFile').textContent = pageFilePath();
    byId('fanEditorCodeFile').href = pageFilePath();
    byId('fanEditorCodeFile').title = `Open ${pageFilePath()}`;
    byId('fanEditorCodeSelector').textContent = state.selected?.selector || 'Choose an element in the preview.';
    byId('fanEditorCodeTag').textContent = element ? `<${element.tagName.toLowerCase()}>` : 'No element selected';
    byId('fanEditorCodeSnapshot').textContent = element
      ? element.outerHTML.slice(0, 12000) + (element.outerHTML.length > 12000 ? '\n<!-- Preview limited to 12,000 characters -->' : '')
      : 'Select an item in the preview to inspect its rendered markup and file references.';
    const refs = [];
    if (isImage(element)) refs.push({ label: 'Image', url: element.currentSrc || element.src || element.getAttribute('src') });
    if (element) {
      element.querySelectorAll('img[src],source[src],video[src],audio[src],script[src],link[href]').forEach(asset => {
        const url = asset.currentSrc || asset.src || asset.href || asset.getAttribute('src') || asset.getAttribute('href');
        if (url && !refs.some(item => item.url === url)) refs.push({ label: asset.tagName.toLowerCase(), url });
      });
      const background = getComputedStyleValue(element, 'backgroundImage').match(/url\(["']?(.*?)["']?\)/);
      if (background?.[1]) refs.push({ label: 'Background image', url: background[1] });
    }
    const pageDoc = frameDocument();
    if (pageDoc) {
      [...pageDoc.querySelectorAll('script[src],link[rel="stylesheet"][href]')].slice(0, 8).forEach(asset => {
        const url = asset.src || asset.href;
        if (url && !refs.some(item => item.url === url)) refs.push({ label: asset.tagName.toLowerCase() === 'script' ? 'Page script' : 'Stylesheet', url });
      });
    }
    const list = byId('fanEditorCodeReferences');
    list.replaceChildren();
    if (!refs.length) {
      const row = document.createElement('li');
      row.textContent = 'No separate media file is referenced by this element.';
      list.append(row);
    } else {
      refs.slice(0, 12).forEach(item => {
        const row = document.createElement('li');
        const label = document.createElement('span');
        const link = document.createElement('a');
        label.textContent = item.label;
        link.href = item.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = toSitePath(item.url);
        row.append(label, link);
        list.append(row);
      });
    }
    const editor = byId('fanEditorCodeMarkup');
    const editable = canEditMarkup(element);
    byId('fanEditorCodeEditNote').textContent = editable
      ? 'Apply safe HTML inside this element. The selected tag, attributes, and page behavior stay attached.'
      : 'This element contains behavior or markup the safe editor cannot replace. Use the Design controls here; rendered code and file references remain available above.';
    editor.disabled = !editable;
    byId('fanEditorApplyMarkup').disabled = !editable;
    if (resetMarkup) editor.value = editable ? element.innerHTML : '';
  }

  function setInspectorTab(tab) {
    if (!['design', 'code'].includes(tab)) return;
    state.inspectorTab = tab;
    ['design', 'code'].forEach(name => {
      const active = name === tab;
      byId(`fanEditorTab${name === 'design' ? 'Design' : 'Code'}`).setAttribute('aria-selected', String(active));
      byId(`fanEditor${name === 'design' ? 'Design' : 'Code'}Panel`).hidden = !active;
    });
  }

  function applySelectedMarkup() {
    const element = selectedElement();
    if (!element || !canEditMarkup(element)) {
      setStatus('Choose an element with safe, editable content first.', 'warning');
      return;
    }
    let content;
    try { content = safeMarkupTree(byId('fanEditorCodeMarkup').value); }
    catch (error) { setStatus(error.message, 'error'); return; }
    const selector = buildSelector(element);
    currentDocument().elements = currentDocument().elements.filter(item => {
      if (item.selector === selector) return true;
      try {
        const descendant = frameDocument()?.querySelector(item.selector);
        return !descendant || !element.contains(descendant);
      } catch { return true; }
    });
    const patch = getElementPatch(element, true);
    patch.content = content;
    delete patch.text;
    applyPreview();
    populateInspector(selectedElement() || element);
    markDirty();
    setStatus('Applied safe HTML to the preview. Save a draft to keep the change.', 'dirty');
  }

  function ensurePreviewOverlay(doc) {
    if (state.frameOverlay?.ownerDocument === doc) return state.frameOverlay;
    const overlay = doc.createElement('div');
    overlay.className = 'fan-editor-control-layer';
    overlay.dataset.fanEditorUi = 'true';
    overlay.setAttribute('aria-hidden', 'false');
    const move = doc.createElement('button');
    move.type = 'button';
    move.className = 'fan-editor-move-handle';
    move.dataset.fanEditorAction = 'move';
    move.setAttribute('aria-label', 'Move selected element. Use arrow keys to reorder it.');
    move.title = 'Drag to another area. Arrow keys reorder it with a sibling.';
    move.textContent = '↕ Move';
    overlay.append(move);
    [['nw', 'Resize top left'], ['n', 'Resize top'], ['ne', 'Resize top right'], ['e', 'Resize right'], ['se', 'Resize bottom right'], ['s', 'Resize bottom'], ['sw', 'Resize bottom left'], ['w', 'Resize left']].forEach(([direction, label]) => {
      const handle = doc.createElement('button');
      handle.type = 'button';
      handle.className = 'fan-editor-resize-handle';
      handle.dataset.fanEditorAction = 'resize';
      handle.dataset.fanEditorDirection = direction;
      handle.setAttribute('aria-label', label);
      handle.title = label;
      overlay.append(handle);
    });
    const marker = doc.createElement('div');
    marker.className = 'fan-editor-drop-marker';
    marker.dataset.fanEditorUi = 'true';
    marker.hidden = true;
    doc.body.append(overlay, marker);
    state.frameOverlay = overlay;
    state.frameDropMarker = marker;
    return overlay;
  }

  function updateSelectionOverlay() {
    const doc = frameDocument();
    const target = frameWindow();
    if (!doc || !target?.requestAnimationFrame || !doc.body) return;
    const selected = selectedElement();
    const overlay = ensurePreviewOverlay(doc);
    const move = overlay.querySelector('[data-fan-editor-action="move"]');
    const canMove = selected && !movementBlocked(selected);
    move.hidden = !canMove;
    overlay.querySelectorAll('[data-fan-editor-action="resize"]').forEach(handle => {
      handle.hidden = !selected || !canResize(selected);
    });
    if (!selected) {
      overlay.hidden = true;
      if (state.frameDropMarker) state.frameDropMarker.hidden = true;
      state.frameResizeObserver?.disconnect();
      state.frameResizeObserver = null;
      state.frameObservedSelection = null;
      return;
    }
    const update = () => {
      if (frameDocument() !== doc || !selected.isConnected || !state.selected) { overlay.hidden = true; return; }
      const rect = selected.getBoundingClientRect();
      if (!rect.width || !rect.height || getComputedStyleValue(selected, 'display') === 'none') {
        overlay.hidden = true;
        return;
      }
      overlay.hidden = false;
      overlay.style.left = `${Math.round(rect.left)}px`;
      overlay.style.top = `${Math.round(rect.top)}px`;
      overlay.style.width = `${Math.max(24, Math.round(rect.width))}px`;
      overlay.style.height = `${Math.max(24, Math.round(rect.height))}px`;
    };
    target.requestAnimationFrame(update);
    if (state.frameObservedSelection !== selected && target.ResizeObserver) {
      state.frameResizeObserver?.disconnect();
      state.frameResizeObserver = new target.ResizeObserver(update);
      state.frameResizeObserver.observe(selected);
      state.frameObservedSelection = selected;
    }
  }

  function movementBlocked(element) {
    return !isElement(element)
      || ['html', 'body', 'script', 'style', 'nav', 'form', 'iframe', 'object', 'embed', 'canvas', 'video', 'audio', 'input', 'textarea', 'select', 'button'].includes(element.tagName.toLowerCase())
      || Boolean(element.closest('nav,form,script,style,iframe,[data-fan-editor-ui]'));
  }

  function canResize(element) {
    return isElement(element)
      && !['html', 'body', 'script', 'style', 'iframe', 'object', 'embed', 'canvas', 'video', 'audio', 'input', 'textarea', 'select'].includes(element.tagName.toLowerCase())
      && !element.closest('[data-fan-editor-ui]');
  }

  function clearDropPreview() {
    if (state.dropHighlight?.isConnected) state.dropHighlight.classList.remove('fan-editor-drop-target');
    state.dropHighlight = null;
    if (state.frameDropMarker) state.frameDropMarker.hidden = true;
  }

  function elementAtPoint(doc, x, y) {
    const overlay = state.frameOverlay;
    const marker = state.frameDropMarker;
    const hiddenOverlay = overlay?.hidden;
    if (overlay) overlay.hidden = true;
    if (marker) marker.hidden = true;
    const element = doc.elementFromPoint(x, y);
    if (overlay) overlay.hidden = hiddenOverlay;
    return isElement(element) ? element : null;
  }

  function chooseDropPlacement(source, x, y) {
    const doc = frameDocument();
    if (!doc) return null;
    let target = elementAtPoint(doc, x, y)?.closest(SELECTABLE);
    if (!target || target === source || source.contains(target)) target = source.parentElement;
    if (!isElement(target) || target === source || source.contains(target) || movementBlocked(target)) return null;
    const rect = target.getBoundingClientRect();
    const style = frameWindow().getComputedStyle(target.parentElement || target);
    const verticalRow = /^(flex|grid)$/.test(style.display) && style.flexDirection === 'row';
    const coordinate = verticalRow ? x : y;
    const start = verticalRow ? rect.left : rect.top;
    const extent = verticalRow ? rect.width : rect.height;
    const ratio = extent ? (coordinate - start) / extent : .5;
    let parent;
    let before = null;
    let mode = 'inside';
    if (ratio <= .24 || ratio >= .76 || !/^(main|section|article|div|ul|ol|li|header|footer|figure)$/i.test(target.tagName)) {
      parent = target.parentElement;
      if (!parent) return null;
      before = ratio <= .5 ? target : target.nextElementSibling;
      mode = ratio <= .5 ? 'before' : 'after';
    } else {
      parent = target;
    }
    if (parent === source || source.contains(parent)) return null;
    preserveOriginSelectors(parent);
    if (before) preserveOriginSelectors(before);
    return { target, parent, before, mode, rect };
  }

  function paintDropPlacement(placement) {
    clearDropPreview();
    if (!placement) return;
    state.dropHighlight = placement.target;
    state.dropHighlight.classList.add('fan-editor-drop-target');
    const marker = state.frameDropMarker;
    if (!marker) return;
    if (placement.mode === 'inside') {
      marker.hidden = true;
      return;
    }
    const rect = placement.rect;
    const row = frameWindow().getComputedStyle(placement.target.parentElement).display.includes('flex')
      && frameWindow().getComputedStyle(placement.target.parentElement).flexDirection === 'row';
    marker.hidden = false;
    marker.style.left = `${Math.round(row ? (placement.mode === 'before' ? rect.left : rect.right) : rect.left)}px`;
    marker.style.top = `${Math.round(row ? rect.top : (placement.mode === 'before' ? rect.top : rect.bottom))}px`;
    marker.style.width = `${Math.max(4, Math.round(row ? rect.height : rect.width))}px`;
    marker.style.height = `${row ? Math.max(4, Math.round(rect.height)) : 4}px`;
    if (row) marker.style.width = '4px';
  }

  function startDrag(source, event, handle) {
    if (!source || movementBlocked(source)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const root = source.closest('[data-fan-editor-added]') || source;
    state.dragOperation = {
      kind: 'move', pointerId: event.pointerId, source: root,
      opacity: root.style.opacity, handle, placement: null,
    };
    root.style.opacity = '.58';
    handle.setPointerCapture?.(event.pointerId);
    setStatus('Drag to a container to nest the item, or to an item edge to place it before or after.', 'info');
  }

  function selectedPatchFor(element, create = true) {
    const item = getElementPatch(element, create);
    return item || null;
  }

  function commitDrag(placement) {
    const operation = state.dragOperation;
    state.dragOperation = null;
    clearDropPreview();
    if (!operation) return;
    operation.source.style.opacity = operation.opacity;
    if (!placement) {
      updateSelectionOverlay();
      setStatus('No valid drop target was found. The element stayed in its original location.', 'warning');
      return;
    }
    const { source } = operation;
    const parent = placement.parent;
    const before = placement.before;
    if (source.parentElement === parent && (before === source || before === source.nextElementSibling || (!before && !source.nextElementSibling))) {
      updateSelectionOverlay();
      setStatus('The item is already in that position.', 'info');
      return;
    }
    const selector = buildSelector(parent);
    const beforeSelector = before ? buildSelector(before) : '';
    const addedRoot = source.closest('[data-fan-editor-added]');
    if (addedRoot) {
      const addition = currentDocument().additions.find(item => item.id === addedRoot.dataset.fanEditorAdded);
      if (!addition) return;
      addition.parentSelector = selector;
      addition.beforeSelector = beforeSelector;
    } else {
      const element = selectedElement() || source;
      const patch = selectedPatchFor(element);
      if (!patch) return;
      patch.move = { parentSelector: selector, beforeSelector };
    }
    applyPreview();
    markDirty();
    setStatus(`Moved ${state.selected?.label || 'the selected item'} in the preview. Save a draft when ready.`, 'dirty');
  }

  function applyResizeValue(element, direction, dx, dy, initial) {
    const docWindow = frameWindow();
    const style = docWindow.getComputedStyle(element);
    let width = initial.width;
    let height = initial.height;
    if (direction.includes('e')) width += dx;
    if (direction.includes('w')) width -= dx;
    if (direction.includes('s')) height += dy;
    if (direction.includes('n')) height -= dy;
    width = Math.max(40, Math.min(1800, Math.round(width)));
    height = Math.max(24, Math.min(1600, Math.round(height)));
    if (isImage(element) && direction.length === 2 && style.objectFit !== 'fill') {
      const ratio = initial.width / Math.max(initial.height, 1);
      if (Math.abs(dx) > Math.abs(dy)) height = Math.max(24, Math.min(1600, Math.round(width / ratio)));
      else width = Math.max(40, Math.min(1800, Math.round(height * ratio)));
    }
    if (direction.includes('e') || direction.includes('w')) element.style.width = `${width}px`;
    if (direction.includes('n') || direction.includes('s')) element.style.height = `${height}px`;
    if (isImage(element) && direction.length === 2 && style.objectFit !== 'fill') {
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
    }
    updateSelectionOverlay();
    return { width, height };
  }

  function handlePreviewPointerDown(event) {
    const control = event.target.closest('[data-fan-editor-action]');
    if (!control) return;
    const selected = selectedElement();
    if (!selected) return;
    if (control.dataset.fanEditorAction === 'move') {
      startDrag(selected, event, control);
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const rect = selected.getBoundingClientRect();
    const style = frameWindow().getComputedStyle(selected);
    state.dragOperation = {
      kind: 'resize', pointerId: event.pointerId, source: selected, handle: control,
      direction: control.dataset.fanEditorDirection,
      originX: event.clientX, originY: event.clientY,
      initial: { width: Number.parseFloat(style.width) || rect.width, height: Number.parseFloat(style.height) || rect.height },
      opacity: '',
    };
    control.setPointerCapture?.(event.pointerId);
  }

  function handlePreviewPointerMove(event) {
    const operation = state.dragOperation;
    if (!operation || operation.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (operation.kind === 'move') {
      operation.placement = chooseDropPlacement(operation.source, event.clientX, event.clientY);
      paintDropPlacement(operation.placement);
      return;
    }
    operation.dimensions = applyResizeValue(operation.source, operation.direction,
      event.clientX - operation.originX, event.clientY - operation.originY, operation.initial);
  }

  function finishResize(operation) {
    const selected = selectedElement();
    const patch = selected && selectedPatchFor(selected);
    if (!patch || !operation.dimensions) return;
    const styleKey = isImage(selected) && selected.closest('[data-fan-editor-added]') ? 'imageStyle' : 'style';
    patch[styleKey] = patch[styleKey] || {};
    const direction = operation.direction;
    if (direction.includes('e') || direction.includes('w') || isImage(selected) && direction.length === 2) patch[styleKey].width = operation.dimensions.width;
    if (direction.includes('n') || direction.includes('s') || isImage(selected) && direction.length === 2) patch[styleKey].height = operation.dimensions.height;
    applyPreview();
    populateInspector(selectedElement() || selected);
    markDirty();
    setStatus('Resized the selected element. Save a draft when ready.', 'dirty');
  }

  function handlePreviewPointerUp(event) {
    const operation = state.dragOperation;
    if (!operation || operation.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (operation.kind === 'move') commitDrag(operation.placement);
    else {
      state.dragOperation = null;
      finishResize(operation);
    }
  }

  function moveByKeyboard(direction) {
    const selected = selectedElement();
    if (!selected || movementBlocked(selected)) return;
    const source = selected.closest('[data-fan-editor-added]') || selected;
    const sibling = direction === 'up' || direction === 'left' ? source.previousElementSibling : source.nextElementSibling;
    if (!sibling) return;
    const parent = source.parentElement;
    preserveOriginSelectors(source);
    preserveOriginSelectors(parent);
    const before = direction === 'up' || direction === 'left' ? sibling : sibling.nextElementSibling;
    const placement = { target: sibling, parent, before, mode: direction === 'up' || direction === 'left' ? 'before' : 'after' };
    const rect = sibling.getBoundingClientRect();
    placement.rect = rect;
    const temporary = { source, placement };
    state.dragOperation = temporary;
    commitDrag(placement);
  }

  function handlePreviewKeyDown(event) {
    const control = event.target.closest('[data-fan-editor-action]');
    if (!control) return;
    if (control.dataset.fanEditorAction === 'move' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      moveByKeyboard(event.key === 'ArrowUp' ? 'up' : event.key === 'ArrowLeft' ? 'left' : event.key === 'ArrowDown' ? 'down' : 'right');
    }
  }

  function watchPreviewRoot(doc) {
    state.frameObserver?.disconnect();
    state.frameObserver = null;
    if (state.frameHealthTimer) window.clearTimeout(state.frameHealthTimer);
    state.frameHealthTimer = null;
    const root = doc?.getElementById('root');
    if (!root || root.children.length) return false;

    const observer = new MutationObserver(() => {
      if (!root.children.length) return;
      observer.disconnect();
      if (state.frameObserver === observer) state.frameObserver = null;
      if (state.frameHealthTimer) window.clearTimeout(state.frameHealthTimer);
      state.frameHealthTimer = null;
      byId('fanEditorPreviewStatus').textContent = 'Preview loaded · click a page element to select it';
      applyPreview();
    });
    observer.observe(root, { childList: true });
    state.frameObserver = observer;
    state.frameHealthTimer = window.setTimeout(() => {
      if (state.frameObserver !== observer || frameDocument() !== doc || root.children.length) return;
      state.frameHealthTimer = null;
      const pageLabel = currentPage().label;
      byId('fanEditorPreviewStatus').textContent = `${pageLabel} preview did not render`;
      setStatus(`The ${pageLabel} page app did not render in the preview. Reload the preview after fixing the page app.`, 'warning');
    }, 8000);
    return true;
  }

  function bindPreview() {
    const frame = byId('fanEditorPreview');
    frame.addEventListener('load', () => {
      const doc = frameDocument();
      if (!doc) return;
      state.frameReady = true;
      const waitingForApp = watchPreviewRoot(doc);
      doc.addEventListener('click', event => {
        if (event.target.closest?.('[data-fan-editor-ui]')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        let target = isElement(event.target) ? event.target : event.target?.parentElement;
        if (!target) return;
        target = target.closest(SELECTABLE);
        if (!target || target === doc.body) return;
        populateInspector(target);
        highlightElement(target);
        setStatus(`Selected ${state.selected.label}. Changes preview immediately; save a draft when ready.`, 'info');
      }, true);
      doc.addEventListener('submit', event => { event.preventDefault(); event.stopImmediatePropagation(); }, true);
      doc.addEventListener('keydown', event => {
        if (event.key === 'Enter' && event.target.closest('a,button')) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }, true);
      doc.addEventListener('pointerdown', handlePreviewPointerDown, true);
      doc.addEventListener('pointermove', handlePreviewPointerMove, true);
      doc.addEventListener('pointerup', handlePreviewPointerUp, true);
      doc.addEventListener('keydown', handlePreviewKeyDown, true);
      doc.defaultView.addEventListener('scroll', updateSelectionOverlay, true);
      doc.defaultView.addEventListener('resize', updateSelectionOverlay);
      const previewStyle = doc.createElement('style');
      previewStyle.textContent = `body[data-fan-tools-editor-preview] *:not([data-fan-editor-ui]):hover{outline:2px solid #86a9ff!important;outline-offset:1px!important;cursor:pointer!important}.fan-editor-selected-outline{outline:3px solid #1e56e8!important;outline-offset:2px!important;position:relative;z-index:2147483646!important}.fan-editor-control-layer{position:fixed!important;z-index:2147483647!important;box-sizing:border-box!important;border:2px solid #2463eb!important;pointer-events:none!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important}.fan-editor-control-layer[hidden],.fan-editor-control-layer [hidden],.fan-editor-drop-marker[hidden]{display:none!important}.fan-editor-move-handle,.fan-editor-resize-handle{position:absolute!important;display:block!important;box-sizing:border-box!important;margin:0!important;padding:0!important;border:2px solid #fff!important;background:#2459d8!important;color:#fff!important;box-shadow:0 1px 5px #18264266!important;pointer-events:auto!important;touch-action:none!important;font:700 11px/1 system-ui,sans-serif!important}.fan-editor-move-handle{top:-28px!important;left:50%!important;transform:translateX(-50%)!important;width:76px!important;height:24px!important;border-radius:6px!important;cursor:move!important}.fan-editor-resize-handle{width:12px!important;height:12px!important;border-radius:50%!important}.fan-editor-resize-handle[data-fan-editor-direction="nw"]{left:-7px!important;top:-7px!important;cursor:nwse-resize!important}.fan-editor-resize-handle[data-fan-editor-direction="n"]{left:calc(50% - 6px)!important;top:-7px!important;cursor:ns-resize!important}.fan-editor-resize-handle[data-fan-editor-direction="ne"]{right:-7px!important;top:-7px!important;cursor:nesw-resize!important}.fan-editor-resize-handle[data-fan-editor-direction="e"]{right:-7px!important;top:calc(50% - 6px)!important;cursor:ew-resize!important}.fan-editor-resize-handle[data-fan-editor-direction="se"]{right:-7px!important;bottom:-7px!important;cursor:nwse-resize!important}.fan-editor-resize-handle[data-fan-editor-direction="s"]{left:calc(50% - 6px)!important;bottom:-7px!important;cursor:ns-resize!important}.fan-editor-resize-handle[data-fan-editor-direction="sw"]{left:-7px!important;bottom:-7px!important;cursor:nesw-resize!important}.fan-editor-resize-handle[data-fan-editor-direction="w"]{left:-7px!important;top:calc(50% - 6px)!important;cursor:ew-resize!important}.fan-editor-drop-target{outline:2px dashed #ef8c15!important;outline-offset:3px!important}.fan-editor-drop-marker{position:fixed!important;z-index:2147483647!important;pointer-events:none!important;border-radius:4px!important;background:#e37c0c!important;box-shadow:0 0 0 2px #fff!important}`;
      doc.body.dataset.fanToolsEditorPreview = 'true';
      doc.head.append(previewStyle);
      ensurePreviewOverlay(doc);
      clearInspector();
      applyPreview();
      byId('fanEditorPreviewStatus').textContent = waitingForApp
        ? `Waiting for ${currentPage().label} to render…`
        : 'Preview loaded · click a page element to select it';
      updateSelectionOverlay();
    });
  }

  function loadPage() {
    state.frameObserver?.disconnect();
    state.frameObserver = null;
    if (state.frameHealthTimer) window.clearTimeout(state.frameHealthTimer);
    state.frameHealthTimer = null;
    const page = currentPage();
    byId('fanEditorPreviewStatus').textContent = `Loading ${page.label} preview…`;
    byId('fanEditorPreview').src = `${page.path}?fanDesigner=1&editorCache=${Date.now()}`;
    state.frameReady = false;
    clearInspector();
  }

  function setPreviewMode(mode) {
    if (!['desktop', 'tablet', 'mobile'].includes(mode)) return;
    state.previewMode = mode;
    const frame = byId('fanEditorPreview');
    frame.dataset.viewport = mode;
    frame.style.width = mode === 'desktop' ? '100%' : (mode === 'tablet' ? '768px' : '390px');
    document.querySelectorAll('[data-fan-editor-viewport]').forEach(button => {
      const active = button.dataset.fanEditorViewport === mode;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-active', active);
    });
  }

  function setPage(pageKey) {
    if (!PAGES.some(page => page.key === pageKey)) return;
    if (state.dirty && !window.confirm('Discard unsaved changes on the current page and switch pages?')) {
      byId('fanEditorPageSelect').value = state.pageKey;
      return;
    }
    state.dirty = false;
    state.pageKey = pageKey;
    syncActionButtons();
    loadPage();
    refreshPageDocument();
  }

  function applyStyleField(fieldName, value) {
    if (!state.selected) return;
    const element = selectedElement();
    if (!element) return;
    const patch = getElementPatch(element, true);
    const styleKey = isImage(element) && element.closest('[data-fan-editor-added]') ? 'imageStyle' : 'style';
    patch[styleKey] = patch[styleKey] || {};
    if (value === '' || value === null || value === undefined) delete patch[styleKey][fieldName];
    else patch[styleKey][fieldName] = value;
    applyPreview();
    markDirty();
  }

  function readStyleValue(key, input) {
    const value = input.value;
    if (value === '') return '';
    if (['fontSize', 'maxWidth', 'width', 'padding', 'marginBottom', 'borderRadius', 'gap', 'height', 'minHeight', 'borderWidth', 'fontWeight', 'lineHeight', 'columns'].includes(key)) {
      return Number(value);
    }
    return value;
  }

  function bindInspector() {
    byId('fanEditorTabDesign').addEventListener('click', () => setInspectorTab('design'));
    byId('fanEditorTabCode').addEventListener('click', () => setInspectorTab('code'));
    byId('fanEditorApplyMarkup').addEventListener('click', applySelectedMarkup);
    const textInput = byId('fanEditorText');
    textInput.addEventListener('input', () => {
      const element = selectedElement();
      if (!element) return;
      const patch = getElementPatch(element, true);
      if (patch.type === 'section' && element.tagName.toLowerCase() === 'h2') patch.title = textInput.value;
      else patch.text = textInput.value;
      if (!patch.type) patch.textIndex = Number.isInteger(patch.textIndex) ? patch.textIndex : 0;
      applyPreview();
      markDirty();
    });
    byId('fanEditorImageUrl').addEventListener('input', () => {
      const element = selectedElement(); if (!isImage(element)) return;
      const patch = getElementPatch(element, true); patch.src = byId('fanEditorImageUrl').value.trim();
      applyPreview(); markDirty();
    });
    byId('fanEditorImageAlt').addEventListener('input', () => {
      const element = selectedElement(); if (!element) return;
      const patch = getElementPatch(element, true); patch.alt = byId('fanEditorImageAlt').value;
      applyPreview(); markDirty();
    });
    Object.entries(STYLE_FIELDS).forEach(([key, id]) => {
      byId(id).addEventListener('input', event => applyStyleField(key, readStyleValue(key, event.currentTarget)));
      byId(id).addEventListener('change', event => applyStyleField(key, readStyleValue(key, event.currentTarget)));
    });
    byId('fanEditorHide').addEventListener('click', () => {
      const element = selectedElement(); if (!element) return;
      const patch = getElementPatch(element, true);
      patch.hidden = !patch.hidden;
      applyPreview(); populateInspector(element); markDirty();
    });
    byId('fanEditorRemoveBlock').addEventListener('click', () => {
      const element = selectedElement();
      const addition = element?.closest('[data-fan-editor-added]');
      if (!addition) return;
      const additionId = addition.dataset.fanEditorAdded;
      currentDocument().additions = currentDocument().additions.filter(item => item.id !== additionId);
      applyPreview(); clearInspector(); markDirty();
    });
    byId('fanEditorResetElement').addEventListener('click', () => {
      const element = selectedElement(); if (!element) return;
      const selector = buildSelector(element);
      currentDocument().elements = currentDocument().elements.filter(item => item.selector !== selector);
      applyPreview(); populateInspector(element); markDirty();
    });
    byId('fanEditorClearSelection').addEventListener('click', () => {
      clearInspector();
      document.querySelector('.fan-editor__add')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    byId('fanEditorNewType').addEventListener('change', updateNewContentFields);
    byId('fanEditorAddButton').addEventListener('click', addContentFromForm);
    document.querySelectorAll('[data-fan-editor-viewport]').forEach(button => {
      button.addEventListener('click', () => setPreviewMode(button.dataset.fanEditorViewport));
    });
    updateNewContentFields();
  }

  function chooseParent() {
    const element = selectedElement();
    if (element?.matches('main,section,article,div,ul,ol')) return element;
    return element?.closest('section,article,main,div') || frameDocument()?.querySelector('main') || frameDocument()?.body || null;
  }

  function describeContentParent() {
    const parent = chooseParent();
    if (!parent) return 'Select a page area before adding new content.';
    if (parent.id === 'mainContent' || parent.tagName === 'MAIN') {
      return 'New content will be added to the page’s main content area.';
    }
    const heading = parent.querySelector('h1,h2,h3,h4,h5,h6')?.textContent;
    const headingLabel = conciseText(heading, 48);
    const name = headingLabel ? `the “${headingLabel}” area` : 'the selected page area';
    return state.selected
      ? `New content will be added inside ${name}.`
      : `New content will be added to ${name}.`;
  }

  function updateNewContentFields() {
    const type = byId('fanEditorNewType').value;
    byId('fanEditorNewTitleField').hidden = type !== 'section';
    byId('fanEditorNewTextField').hidden = type === 'image';
    byId('fanEditorNewImageFields').hidden = type !== 'image';
    byId('fanEditorNewText').placeholder = type === 'section'
      ? 'Add a short description under the section heading.'
      : 'Write the text visitors will see.';
    byId('fanEditorNewTitle').placeholder = 'Section heading';
    byId('fanEditorAddParentHint').textContent = describeContentParent();
  }

  function selectAddedContent(item) {
    applyPreview();
    const doc = frameDocument();
    const inserted = doc?.querySelector(`[data-fan-editor-added="${item.id}"]`);
    const selection = item.type === 'image' ? inserted?.querySelector('img') : inserted;
    if (!selection) return false;
    populateInspector(selection);
    highlightElement(selection);
    return true;
  }

  function addContentFromForm() {
    const type = byId('fanEditorNewType').value;
    const parent = chooseParent();
    if (!parent) { setStatus('Select a page container before adding content.', 'error'); return; }
    if (currentDocument().additions.length >= 200) {
      setStatus('This page already has the maximum of 200 added content blocks.', 'error');
      return;
    }
    const id = `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const parentSelector = buildSelector(parent);
    const doc = frameDocument();
    let parentMatches = false;
    try { parentMatches = Boolean(doc && doc.querySelector(parentSelector) === parent); } catch { parentMatches = false; }
    if (!parentMatches) {
      setStatus('The selected page area could not be located in the preview. Choose another area and try again.', 'error');
      return;
    }
    const item = { id, type, parentSelector, style: {} };
    if (type === 'section') item.title = byId('fanEditorNewTitle').value.trim();
    if (type === 'text' || type === 'section') item.text = byId('fanEditorNewText').value.trim();
    if (type === 'image') {
      const source = byId('fanEditorNewImageUrl').value.trim();
      let parsed;
      try { parsed = source ? new URL(source, window.location.href) : null; } catch { parsed = null; }
      if (!parsed || (parsed.protocol !== 'https:' && parsed.origin !== window.location.origin) || parsed.username || parsed.password) {
        setStatus('Use an https:// image URL or a path from this site, such as /assets/image.webp.', 'error');
        return;
      }
      item.src = parsed.href;
      item.alt = byId('fanEditorNewAlt').value.trim();
      if (!item.alt) {
        setStatus('Add alternative text so visitors using screen readers know what the image shows.', 'warning');
        byId('fanEditorNewAlt').focus();
        return;
      }
    } else if (type === 'text' && !item.text) {
      setStatus('Enter the text you want visitors to see.', 'warning');
      byId('fanEditorNewText').focus();
      return;
    } else if (type === 'section' && !item.title) {
      setStatus('Enter a heading for the new section.', 'warning');
      byId('fanEditorNewTitle').focus();
      return;
    }
    currentDocument().additions.push(item);
    if (!selectAddedContent(item)) {
      currentDocument().additions = currentDocument().additions.filter(addition => addition.id !== id);
      applyPreview();
      setStatus('The new content could not be placed in the preview. Choose another page area and try again.', 'error');
      return;
    }
    byId('fanEditorNewText').value = '';
    byId('fanEditorNewTitle').value = '';
    byId('fanEditorNewImageUrl').value = '';
    byId('fanEditorNewAlt').value = '';
    markDirty();
    const contentLabel = type === 'section' ? 'section' : type === 'image' ? 'image' : 'text block';
    const article = type === 'image' ? 'an' : 'a';
    setStatus(`Added ${article} ${contentLabel} to ${currentPage().label}. It is visible in the preview and still needs saving.`, 'dirty');
  }

  function formatError(error) {
    const message = String(error?.message || error || 'Unknown error');
    if (/row-level security|permission|not authorized|42501/i.test(message)) {
      return 'Your current account cannot edit Fan Tools designs. Sign in with a site admin account above.';
    }
    if (/cPanel editor request failed \(404\)|fan-tools-editor-api\.php|cPanel editor endpoint|failed to fetch|networkerror/i.test(message)) {
      return 'The cPanel editor endpoint is unavailable. Deploy the editor API to the site before saving or publishing.';
    }
    if (/session expired/i.test(message)) {
      return 'Your admin session expired. Sign in with the admin panel above, then retry.';
    }
    if (/sign in/i.test(message)) {
      return /above|again/i.test(message)
        ? message
        : `${message} Sign in with the site admin account above, then retry.`;
    }
    return message;
  }

  async function existingAdminClient() {
    const api = window.DJ?.remoteCatalog;
    if (!api) throw new Error('The existing admin sign-in is unavailable. Reload the page and try again.');
    await api.prepare();
    return api;
  }

  async function cpanelRequest(action, options = {}) {
    const api = await existingAdminClient();
    const session = await api.getSession();
    if (!session?.access_token) throw new Error('Sign in with the site admin account above to edit Fan Tools.');

    const headers = {
      Accept: 'application/json',
      Authorization: 'Bearer ' + session.access_token,
    };
    let body;
    if (options.file) {
      const form = new FormData();
      form.append('pageKey', options.pageKey || state.pageKey);
      form.append('file', options.file);
      body = form;
    } else if (options.data) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.data);
    }

    const response = await fetch('/fan-tools-editor-api.php?action=' + encodeURIComponent(action), {
      method: options.method || 'GET',
      headers,
      body,
      cache: 'no-store',
      credentials: 'same-origin',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'cPanel editor request failed (' + response.status + ').');
    }
    return payload;
  }

  async function backend() {
    const api = await existingAdminClient();
    return {
      getSession: () => api.getSession(),
      listFanToolDesigns: async () => {
        const result = await cpanelRequest('list');
        if (!Array.isArray(result.designs)) throw new Error('The cPanel editor returned an invalid page list.');
        return result.designs;
      },
      saveFanToolDesignDraft: async (pageKey, documentValue) => {
        const result = await cpanelRequest('save-draft', {
          method: 'POST',
          data: { pageKey, document: documentValue },
        });
        if (result.design?.pageKey !== pageKey || !result.design?.draftDocument) {
          throw new Error('cPanel did not confirm that the design draft was saved.');
        }
        return result.design;
      },
      publishFanToolDesign: async (pageKey, documentValue) => {
        const result = await cpanelRequest('publish', {
          method: 'POST',
          data: { pageKey, document: documentValue },
        });
        if (result.design?.pageKey !== pageKey || !result.design?.publishedDocument) {
          throw new Error('cPanel did not confirm that the design was published.');
        }
        return result.design;
      },
      uploadFanToolImage: async (file, options = {}) => {
        const result = await cpanelRequest('upload', {
          method: 'POST',
          file,
          pageKey: options.pageKey || state.pageKey,
        });
        if (typeof result.publicUrl !== 'string' || !result.publicUrl.startsWith('/assets/fan-tools-editor/')) {
          throw new Error('cPanel did not confirm that the image was uploaded.');
        }
        return result;
      },
    };
  }
  async function refreshPageDocument(pageKey = state.pageKey) {
    try {
      const api = await backend();
      const session = await api.getSession();
      if (!session) {
        setStatus('Sign in with the admin panel above to load and save Fan Tools drafts.', 'warning');
        return;
      }
      const rows = await api.listFanToolDesigns();
      state.rows = new Map(rows.map(row => [row.pageKey, row]));
      const row = state.rows.get(pageKey);
      if (pageKey !== state.pageKey) return;
      if (state.dirty) {
        syncActionButtons();
        setStatus(`Admin sign-in is ready. Your local edits to ${currentPage().label} are still here; save them when ready.`, 'warning');
        return;
      }
      state.documents.set(pageKey, normalizeDocument(row?.draftDocument));
      state.dirty = false;
      syncActionButtons();
      applyPreview();
      const publishedAt = row?.publishedAt ? ` Published ${new Date(row.publishedAt).toLocaleString()}.` : ' No version is published yet.';
      setStatus(`Loaded saved draft for ${currentPage().label}.${publishedAt}`, 'success');
    } catch (error) {
      setStatus(formatError(error), 'warning');
    }
  }

  async function saveDraft() {
    if (state.saving) return;
    const pageKey = state.pageKey;
    const revision = state.changeRevision;
    const snapshot = cloneDocument(currentDocument());
    state.saving = true;
    syncActionButtons();
    setStatus(`Saving a draft for ${currentPage().label} to cPanel…`, 'info');
    try {
      const api = await backend();
      const saved = await api.saveFanToolDesignDraft(pageKey, snapshot);
      const previous = state.rows.get(pageKey) || {};
      state.rows.set(pageKey, {
        ...previous,
        ...saved,
        publishedDocument: previous.publishedDocument ?? saved.publishedDocument,
        publishedAt: previous.publishedAt || saved.publishedAt,
      });
      if (pageKey === state.pageKey) {
        state.dirty = state.changeRevision !== revision || !sameDocument(currentDocument(), snapshot);
        setStatus(state.dirty
          ? `Draft saved for ${currentPage().label}. Newer edits are still unsaved.`
          : `Draft saved for ${currentPage().label}. It is not visible to visitors until published.`, state.dirty ? 'dirty' : 'success');
      }
    } catch (error) { setStatus(formatError(error), 'error'); }
    finally { state.saving = false; syncActionButtons(); }
  }

  async function publish() {
    if (state.saving) return;
    if (!window.confirm(`Publish the current ${currentPage().label} design to visitors?`)) return;
    const pageKey = state.pageKey;
    const revision = state.changeRevision;
    const snapshot = cloneDocument(currentDocument());
    state.saving = true;
    syncActionButtons();
    setStatus(`Publishing ${currentPage().label} to the live site…`, 'info');
    try {
      const api = await backend();
      const published = await api.publishFanToolDesign(pageKey, snapshot);
      state.rows.set(pageKey, { ...(state.rows.get(pageKey) || {}), ...published });
      if (pageKey === state.pageKey) {
        state.dirty = state.changeRevision !== revision || !sameDocument(currentDocument(), snapshot);
        setStatus(state.dirty
          ? `Published the saved version of ${currentPage().label}. Newer edits are still unsaved.`
          : `Published the ${currentPage().label} design.`, state.dirty ? 'dirty' : 'success');
      }
    } catch (error) { setStatus(formatError(error), 'error'); }
    finally { state.saving = false; syncActionButtons(); }
  }

  async function uploadImage() {
    const file = byId('fanEditorUpload').files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setStatus('Choose a JPG, PNG, WebP, or GIF image that is no larger than 10 MB.', 'error');
      return;
    }
    if (!isImage(selectedElement()) && currentDocument().additions.length >= 200) {
      setStatus('This page already has the maximum of 200 added content blocks.', 'error');
      return;
    }
    const button = byId('fanEditorUploadButton');
    button.disabled = true;
    setStatus('Uploading image to cPanel…', 'info');
    try {
      const api = await backend();
      const result = await api.uploadFanToolImage(file, { pageKey: state.pageKey });
      byId('fanEditorImageUrl').value = result.publicUrl;
      const element = selectedElement();
      if (isImage(element)) {
        const patch = getElementPatch(element, true);
        patch.src = result.publicUrl;
        patch.alt = byId('fanEditorImageAlt').value || file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
        byId('fanEditorImageAlt').value = patch.alt;
        applyPreview();
        markDirty();
      } else {
        addUploadedImage(result.publicUrl, file.name);
      }
      setStatus('Image uploaded. Save a draft to keep this image change.', 'success');
      byId('fanEditorUpload').value = '';
    } catch (error) { setStatus(formatError(error), 'error'); }
    finally { button.disabled = false; }
  }

  function addUploadedImage(src, fileName) {
    const parent = chooseParent();
    if (!parent) return;
    const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    currentDocument().additions.push({
      id, type: 'image', src,
      alt: fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '),
      text: '', parentSelector: buildSelector(parent), style: {},
    });
    applyPreview();
    const image = frameDocument()?.querySelector(`[data-fan-editor-added="${id}"] img`);
    if (image) { populateInspector(image); highlightElement(image); }
    markDirty();
  }

  function discardDraft() {
    if (!window.confirm('Discard this page’s local changes and reload the saved draft?')) return;
    const row = state.rows.get(state.pageKey);
    state.documents.set(state.pageKey, normalizeDocument(row?.draftDocument));
    state.dirty = false;
    syncActionButtons();
    applyPreview();
    setStatus(`Discarded local edits. Reloaded the saved draft for ${currentPage().label}.`, 'info');
  }

  function clearPageDesign() {
    if (!window.confirm(`Reset all visual overrides for ${currentPage().label}? Save the empty draft to keep the reset; publish it to restore the original page for visitors.`)) return;
    state.documents.set(state.pageKey, EMPTY_DOCUMENT());
    clearInspector();
    applyPreview();
    markDirty();
  }

  function buildUI() {
    const mount = byId('fanToolsEditorMount');
    if (!mount) return;
    mount.innerHTML = `
      <section class="fan-editor" aria-labelledby="fanEditorHeading">
        <div class="fan-editor__heading">
          <div class="fan-editor__intro"><span class="fan-editor__eyebrow">Page design workspace</span><h2 id="fanEditorHeading">Fan Tools Visual Studio</h2>
            <p>Select an item, drag its Move handle to rearrange it, or pull a blue edge handle to resize. Save a draft to continue later, or publish to make changes live.</p></div>
          <div class="fan-editor__actions" aria-label="Page design actions"><button type="button" class="button-secondary" id="fanEditorDiscard" disabled>Discard edits</button>
            <button type="button" class="button-secondary" id="fanEditorClearPage">Reset page</button>
            <button type="button" class="button-secondary" id="fanEditorSaveDraft" disabled>Save draft</button>
            <button type="button" class="button" id="fanEditorPublish" disabled>Publish</button></div>
        </div>
        <div class="fan-editor__status" id="fanEditorStatus" role="status" aria-live="polite" data-kind="info"><span class="fan-editor__status-dot" aria-hidden="true"></span><span id="fanEditorStatusText">Preparing the visual editor…</span></div>
        <div class="fan-editor__workspace">
          <section class="fan-editor__preview-panel" aria-label="Page preview">
            <div class="fan-editor__preview-toolbar"><label class="fan-editor__page-picker" for="fanEditorPageSelect"><span>Page</span>
              <select id="fanEditorPageSelect">${PAGE_GROUPS.map(group => `<optgroup label="${group.label}">${group.pages.map(page => `<option value="${page.key}">${page.label}</option>`).join('')}</optgroup>`).join('')}</select></label>
              <div class="fan-editor__viewport-switch" role="group" aria-label="Preview size"><button type="button" data-fan-editor-viewport="desktop" aria-pressed="true" class="is-active">Desktop</button>
                <button type="button" data-fan-editor-viewport="tablet" aria-pressed="false">Tablet</button><button type="button" data-fan-editor-viewport="mobile" aria-pressed="false">Mobile</button></div>
              <span class="fan-editor__tip" id="fanEditorPreviewStatus">Select an item · drag Move · pull a blue handle to resize</span></div>
            <div class="fan-editor__canvas"><iframe id="fanEditorPreview" title="Fan Tools page live preview" loading="eager"></iframe></div>
          </section>
          <aside class="fan-editor__inspector" aria-label="Page and element settings">
            <div class="fan-editor__inspector-heading"><div><span class="fan-editor__eyebrow">Inspector</span><strong id="fanEditorSelectedLabel">No element selected</strong></div>
              <button type="button" class="fan-editor__icon-button" id="fanEditorClearSelection" aria-label="Clear selected element" title="Clear selection" hidden>×</button></div>
            <p class="fan-editor__selection-hint" id="fanEditorSelectionHint">Click an item in the preview to edit its text, image, or style. New content can be added below.</p>
            <div class="fan-editor__inspector-tabs" role="tablist" aria-label="Element editing view">
              <button type="button" role="tab" id="fanEditorTabDesign" aria-controls="fanEditorDesignPanel" aria-selected="true">Design</button>
              <button type="button" role="tab" id="fanEditorTabCode" aria-controls="fanEditorCodePanel" aria-selected="false">Code &amp; files</button>
            </div>
            <div class="fan-editor__tab-panel" id="fanEditorDesignPanel" role="tabpanel" aria-labelledby="fanEditorTabDesign">
            <div class="fan-editor__selected-controls" id="fanEditorSelectedControls" hidden>
            <label id="fanEditorTextField" class="fan-editor__field" hidden>Text content<textarea id="fanEditorText" rows="3" maxlength="12000"></textarea></label>
            <div id="fanEditorImageFields" hidden><label class="fan-editor__field">Image URL<input id="fanEditorImageUrl" type="url" maxlength="2048" placeholder="https://…"></label>
              <label class="fan-editor__field">Alternative text<input id="fanEditorImageAlt" type="text" maxlength="1000"></label></div>
            <div class="fan-editor__field"><span>Typography</span><div class="fan-editor__split"><select id="fanEditorFont" aria-label="Font family"><option value="">Current font</option>${FONT_OPTIONS.map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select>
              <label class="fan-editor__inline">Size <input id="fanEditorFontSize" type="number" min="10" max="96" step="1" aria-label="Font size in pixels"></label></div></div>
            <div class="fan-editor__split"><label class="fan-editor__field">Text color<input id="fanEditorTextColor" type="color"></label>
              <label class="fan-editor__field">Background<input id="fanEditorBackground" type="color"></label></div>
            <details class="fan-editor__details"><summary>Size and spacing</summary>
              <div class="fan-editor__grid">
                <label class="fan-editor__field">Max width (px)<input id="fanEditorMaxWidth" type="number" min="160" max="1800"></label>
                <label class="fan-editor__field">Width (px)<input id="fanEditorWidth" type="number" min="40" max="1800"></label>
                <label class="fan-editor__field">Padding (px)<input id="fanEditorPadding" type="number" min="0" max="160"></label>
                <label class="fan-editor__field">Space below (px)<input id="fanEditorMargin" type="number" min="0" max="160"></label>
                <label class="fan-editor__field">Corner radius (px)<input id="fanEditorRadius" type="number" min="0" max="100"></label>
                <label class="fan-editor__field">Gap (px)<input id="fanEditorGap" type="number" min="0" max="100"></label>
                <label class="fan-editor__field">Height (px)<input id="fanEditorHeight" type="number" min="24" max="1600"></label>
                <label class="fan-editor__field">Minimum height (px)<input id="fanEditorMinHeight" type="number" min="80" max="1200"></label>
                <label class="fan-editor__field">Border width (px)<input id="fanEditorBorderWidth" type="number" min="0" max="20"></label>
                <label class="fan-editor__field">Border color<input id="fanEditorBorderColor" type="color"></label>
              </div>
            </details>
            <details class="fan-editor__details"><summary>Advanced alignment</summary><div class="fan-editor__grid">
                <label class="fan-editor__field">Font weight<select id="fanEditorFontWeight"><option value="">Current weight</option><option value="300">Light</option><option value="400">Regular</option><option value="500">Medium</option><option value="600">Semibold</option><option value="700">Bold</option><option value="800">Extra bold</option><option value="900">Black</option></select></label>
                <label class="fan-editor__field">Line height<input id="fanEditorLineHeight" type="number" min="1" max="3" step="0.1"></label>
                <label class="fan-editor__field">Display<select id="fanEditorDisplay"><option value="">Current display</option><option value="block">Block</option><option value="flex">Flex</option><option value="grid">Grid</option><option value="inline-block">Inline block</option><option value="none">Hidden</option></select></label>
                <label class="fan-editor__field">Text alignment<select id="fanEditorAlign"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option><option value="justify">Justify</option></select></label>
                <label class="fan-editor__field">Flex direction<select id="fanEditorFlexDirection"><option value="">Current direction</option><option value="row">Row</option><option value="column">Column</option><option value="row-reverse">Row reversed</option><option value="column-reverse">Column reversed</option></select></label>
                <label class="fan-editor__field">Justify content<select id="fanEditorJustify"><option value="">Current spacing</option><option value="flex-start">Start</option><option value="center">Center</option><option value="flex-end">End</option><option value="space-between">Space between</option><option value="space-around">Space around</option></select></label>
                <label class="fan-editor__field">Align items<select id="fanEditorAlignItems"><option value="">Current alignment</option><option value="stretch">Stretch</option><option value="center">Center</option><option value="flex-start">Start</option><option value="flex-end">End</option><option value="baseline">Baseline</option></select></label>
                <label class="fan-editor__field">Image fit<select id="fanEditorObjectFit"><option value="">Current fit</option><option value="cover">Cover</option><option value="contain">Contain</option><option value="fill">Fill</option><option value="none">Natural</option></select></label>
                <label class="fan-editor__field">Grid columns<select id="fanEditorColumns"><option value="">Current columns</option><option value="1">1 column</option><option value="2">2 columns</option><option value="3">3 columns</option><option value="4">4 columns</option></select></label>
              </div></details>
            <div class="fan-editor__element-actions"><button type="button" class="button-secondary" id="fanEditorResetElement">Reset selected element</button>
              <button type="button" class="button-secondary" id="fanEditorHide">Hide element</button>
              <button type="button" class="button-secondary" id="fanEditorRemoveBlock" hidden>Remove added block</button></div>
            </div>
            <section class="fan-editor__add" aria-labelledby="fanEditorAddHeading"><div class="fan-editor__section-heading"><strong id="fanEditorAddHeading">Add content</strong><span>Text, sections, and images</span></div>
              <p id="fanEditorAddParentHint">Choose a page area where the new content should appear.</p>
              <label class="fan-editor__field">Content type<select id="fanEditorNewType"><option value="text">Text block</option><option value="section">Section</option><option value="image">Image</option></select></label>
              <label class="fan-editor__field" id="fanEditorNewTitleField" hidden>Section heading<input id="fanEditorNewTitle" type="text" maxlength="300" placeholder="Section heading"></label>
              <label class="fan-editor__field" id="fanEditorNewTextField">Text<textarea id="fanEditorNewText" rows="3" maxlength="12000" placeholder="Write the text visitors will see."></textarea></label>
              <div class="fan-editor__stack" id="fanEditorNewImageFields" hidden><label class="fan-editor__field">Image URL<input id="fanEditorNewImageUrl" type="text" inputmode="url" autocomplete="off" maxlength="2048" placeholder="https://… or /assets/image.webp"></label>
                <label class="fan-editor__field">Alternative text<input id="fanEditorNewAlt" type="text" maxlength="1000" placeholder="Describe the image"></label></div>
              <button type="button" class="button-secondary" id="fanEditorAddButton">Add to preview</button>
            </section>
            <div class="fan-editor__upload"><label for="fanEditorUpload">Upload image</label><input id="fanEditorUpload" type="file" accept="image/jpeg,image/png,image/webp,image/gif">
              <button type="button" class="button-secondary" id="fanEditorUploadButton">Upload image to cPanel</button><small>JPG, PNG, WebP, or GIF · 10 MB maximum. Replaces the selected image or adds an image block.</small></div>
            <p class="fan-editor__scope-note">This editor changes page content and visual styles. Tool behavior and app logic stay in the site code.</p>
            </div>
            <section class="fan-editor__code-panel" id="fanEditorCodePanel" role="tabpanel" aria-labelledby="fanEditorTabCode" hidden>
              <div class="fan-editor__reference-card"><span class="fan-editor__eyebrow">Page file</span><a id="fanEditorCodeFile" target="_blank" rel="noopener noreferrer"></a>
                <div class="fan-editor__code-meta"><span id="fanEditorCodeTag">No element selected</span><code id="fanEditorCodeSelector">Choose an element in the preview.</code></div></div>
              <div class="fan-editor__reference-card"><strong>Referenced files</strong><ul class="fan-editor__references" id="fanEditorCodeReferences"></ul></div>
              <details class="fan-editor__details"><summary>Rendered element markup</summary><pre class="fan-editor__code-readout"><code id="fanEditorCodeSnapshot">Select an item in the preview to inspect its rendered markup and file references.</code></pre></details>
              <label class="fan-editor__field" for="fanEditorCodeMarkup">Edit safe content HTML<textarea id="fanEditorCodeMarkup" rows="10" spellcheck="false" disabled></textarea></label>
              <p class="fan-editor__code-note" id="fanEditorCodeEditNote">Select an editable text or content element in the preview.</p>
              <button type="button" class="button-secondary" id="fanEditorApplyMarkup" disabled>Apply HTML to preview</button>
              <p class="fan-editor__code-footnote">Markup edits replace only the selected element’s inner content. Scripts, event attributes, inline CSS, and tool behavior stay protected.</p>
            </section>
          </aside>
        </div>
      </section>`;
    buildUI = () => {};
  }

  function init() {
    buildUI();
    if (!byId('fanEditorPreview')) return;
    bindPreview();
    bindInspector();
    byId('fanEditorPageSelect').addEventListener('change', event => setPage(event.currentTarget.value));
    byId('fanEditorSaveDraft').addEventListener('click', saveDraft);
    byId('fanEditorPublish').addEventListener('click', publish);
    byId('fanEditorDiscard').addEventListener('click', discardDraft);
    byId('fanEditorClearPage').addEventListener('click', clearPageDesign);
    byId('fanEditorUploadButton').addEventListener('click', uploadImage);
    byId('fanEditorUpload').addEventListener('change', () => {
      const file = byId('fanEditorUpload').files?.[0];
      if (file) setStatus(`Ready to upload ${file.name}. The image will be stored in the site’s cPanel assets.`, 'info');
    });
    loadPage();
    setPreviewMode('desktop');
    syncActionButtons();
    refreshPageDocument();
    if (window.DJ?.remoteCatalog) {
      state.authSubscription = window.DJ.remoteCatalog.onAuthStateChange((_event, session) => {
      if (!session) {
          state.rows.clear();
          state.documents.clear();
          state.dirty = false;
        byId('fanEditorDiscard').disabled = true;
          byId('fanEditorSaveDraft').disabled = true;
          byId('fanEditorPublish').disabled = true;
          loadPage();
          setStatus('Signed out. Sign in with the admin panel above to load and save Fan Tools drafts.', 'warning');
          return;
        }
        refreshPageDocument(state.pageKey);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init, { once: true });
})();
