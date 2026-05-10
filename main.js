'use strict';

const DEFAULT_ENTRY_COLOR = '#bfe9ff';
const THUMBNAIL_CACHE_BUSTER = 'thumb-v1';
const SCENARIO_INDEX_CACHE_KEY = 'shinymaster.scenario.index.v2';
const SCENARIO_INDEX_CACHE_TTL = 10 * 60 * 1000;
const IDOL_COLORS = {
    '001': '#ffbad6',
    '002': '#144384',
    '003': '#ffe012',
    '004': '#f84cad',
    '005': '#a846fb',
    '006': '#006047',
    '007': '#3b91c4',
    '008': '#d9f2ff',
    '009': '#e5461c',
    '010': '#f93b90',
    '011': '#ffc602',
    '012': '#89c3eb',
    '013': '#90e667',
    '014': '#f54275',
    '015': '#e75bec',
    '016': '#fbfafa',
    '017': '#f30100',
    '018': '#5ce626',
    '019': '#ff00ff',
    '020': '#50d0d0',
    '021': '#be1e3e',
    '022': '#7967c3',
    '023': '#ffc639',
    '024': '#ccf3dc',
    '025': '#ffdbdb',
    '026': '#e9e3e1',
    '027': '#e0b5d3',
    '028': '#dcc571',
};

// ─── Entry point ─────────────────────────────────────────────────────────────
async function init() {
    const params  = new URLSearchParams(window.location.search);
    let eventType = params.get('eventType') || 'produce_events';
    let eventId   = params.get('eventId');
    const language = normalizeScenarioLanguage(params.get('language'));

    if (!eventId) {
        await showScenarioEntryPage(eventType, language);
        return;
    }

    await startScenarioPlayer(eventType, eventId, language);
}

async function startScenarioPlayer(eventType, eventId, language) {
    applyScenarioLanguage(language);
    PIXI.utils.skipHello();
    gsap.registerPlugin(PixiPlugin);
    PixiPlugin.registerPIXI(PIXI);

    const app = new PIXI.Application({
        width: 1136, height: 640, backgroundColor: 0x000000,
    });
    app.view.id = 'ShinyColors';
    document.body.appendChild(app.view);
    resizeCanvas(app);
    window.addEventListener('resize', () => resizeCanvas(app));

    try {
        await loadScenarioFonts(language);
    } catch (_) { console.warn('[main] font load timed out'); }

    // Load scenario JSON
    const jsonUrl = `${ASSET_PATH}/json/${eventType}/${eventId}.json`;
    PIXI.Loader.shared.add('scenarioJson', jsonUrl);
    await new Promise(r => PIXI.Loader.shared.load(r));

    const jsonRes = PIXI.Loader.shared.resources['scenarioJson'];
    if (!jsonRes || jsonRes.error) { alert(`Failed to load: ${jsonUrl}`); return; }

    const rawTracks = applyTrackLanguage(jsonRes.data, language);
    if (!Array.isArray(rawTracks) || rawTracks.length === 0) {
        alert('Scenario JSON empty or invalid.'); return;
    }

    // ── Convert raw → URL tracks (matches enza pre-load step) ──────────────
    const converter = new AdvResourceConverter();
    const tracks    = converter.convertResourcePaths(rawTracks);
    const urls      = converter.extractResourceList(tracks);

    // ── Pre-load resources ─────────────────────────────────────────────────
    const loader = PIXI.Loader.shared;

    // UI spritesheet (named key for MainController)
    if (!loader.resources['uiParts']) {
        loader.add('uiParts', UI_PARTS_URL);
    }
    if (!loader.resources['uiCommonParts']) {
        loader.add('uiCommonParts', UI_COMMON_PARTS_URL);
    }
    if (!loader.resources['uiCommonAtlas']) {
        loader.add('uiCommonAtlas', UI_COMMON_ATLAS_URL);
    }

    // UI tap SE (named key)
    if (!loader.resources[UI_TAP_SE_KEY]) {
        loader.add(UI_TAP_SE_KEY, UI_TAP_SE_URL);
    }
    if (!loader.resources[UI_CANCEL_SE_KEY]) {
        loader.add(UI_CANCEL_SE_KEY, UI_CANCEL_SE_URL);
    }
    if (!loader.resources[SELECT_ANSWER_SE_KEY]) {
        loader.add(SELECT_ANSWER_SE_KEY, SELECT_ANSWER_SE_URL);
    }
    if (!loader.resources[TAP_EFFECT_PARTICLES_KEY]) {
        loader.add(TAP_EFFECT_PARTICLES_KEY, TAP_EFFECT_PARTICLES_URL);
    }
    if (!loader.resources[TAP_EFFECT_PARTICLE_CONFIG_KEY]) {
        loader.add(TAP_EFFECT_PARTICLE_CONFIG_KEY, TAP_EFFECT_PARTICLE_CONFIG_URL);
    }
    if (!loader.resources[TAP_EFFECT_FEATHER_CONFIG_KEY]) {
        loader.add(TAP_EFFECT_FEATHER_CONFIG_KEY, TAP_EFFECT_FEATHER_CONFIG_URL);
    }

    // Producer bubble (looping beep for producer dialogue)
    if (!loader.resources[PRODUCER_BUBBLE_KEY]) {
        loader.add(PRODUCER_BUBBLE_KEY, PRODUCER_BUBBLE_URL);
    }

    // Select-frame textures (1..max-selects)
    let maxSelects = 0;
    let currentSelects = 0;
    tracks.forEach(t => {
        if (t.select) {
            currentSelects += Array.isArray(t.select) ? t.select.length : 1;
            maxSelects = Math.max(maxSelects, currentSelects);
        } else {
            currentSelects = 0;
        }
    });
    for (let i = 1; i <= Math.min(maxSelects, 5); i++) {
        const key = `selectFrame${i}`;
        if (!loader.resources[key]) loader.add(key, SELECT_FRAME_URL(i));
    }

    // Track URLs — URL itself is the loader key
    urls.forEach(u => {
        if (!loader.resources[u]) loader.add(u, u);
    });

    await new Promise(r => loader.load(r));

    // ── Touch overlay → start ──────────────────────────────────────────────
    const overlay = buildTouchOverlay(app);
    app.stage.addChild(overlay);

    const startGame = () => {
        app.stage.removeChild(overlay);
        overlay.destroy({ children: true });

        const advPlayer = new AdvPlayer(app);
        app.stage.addChild(advPlayer.stageObj);

        advPlayer.once('end', () => {
            console.log('[main] scenario ended');
            showEndOverlay(app, advPlayer);
        });

        // Drive update loop
        app.ticker.add((delta) => advPlayer.update(delta));

        advPlayer.start(tracks);
    };

    overlay.once('click',      startGame);
    overlay.once('touchstart', startGame);
}

function normalizeScenarioLanguage(value) {
    const lang = String(value || '').toLowerCase();
    if (['cn', 'zh', 'zh-cn', 'zh_cn'].includes(lang)) return 'cn';
    if (lang === 'en') return 'en';
    return '';
}

function applyScenarioLanguage(language) {
    if (language !== 'cn') return;
    USED_FONT.length = 0;
    USED_FONT.push('Yuanti', 'HummingStd-E-1', 'HummingStd-E-2');
}

function loadScenarioFonts(language) {
    if (language === 'cn') {
        return Promise.all([
            new FontFaceObserver('Yuanti').load('中文测试真乃約束', FONT_TIMEOUT),
            new FontFaceObserver(USED_FONT_SECONDARY).load('あいう真乃約束', FONT_TIMEOUT),
        ]);
    }
    return Promise.all([
        new FontFaceObserver(USED_FONT_PRIMARY).load('あいう真乃約束', FONT_TIMEOUT),
        new FontFaceObserver(USED_FONT_SECONDARY).load('あいう真乃約束', FONT_TIMEOUT),
    ]);
}

function applyTrackLanguage(rawTracks, language) {
    if (!['cn', 'en'].includes(language) || !Array.isArray(rawTracks)) return rawTracks;
    return rawTracks.map((track) => {
        if (!track || typeof track !== 'object' || Array.isArray(track)) return track;
        const next = Object.assign({}, track);
        ['text', 'select'].forEach((field) => {
            const localizedKey = `${field}_${language}`;
            const originalKey = `${field}_ja`;
            if (typeof next[localizedKey] === 'string' && next[localizedKey].trim()) {
                if (typeof next[field] === 'string' && !next[originalKey]) {
                    next[originalKey] = next[field];
                }
                next[field] = next[localizedKey];
            }
        });
        return next;
    });
}

async function showScenarioEntryPage(initialType, initialLanguage) {
    const currentLanguage = normalizeScenarioLanguage(initialLanguage) || 'ja';
    document.body.classList.add('entry-mode');
    document.body.innerHTML = `
        <main class="entry-page">
            <section class="entry-hero">
                <div>
                    <div class="entry-kicker">ShinyScenarioViewer</div>
                    <h1>Scenario Library</h1>
                    <p>Choose a scenario JSON to play. The list is refreshed from the JSON folders every time this page opens.</p>
                    <div class="entry-chips" aria-label="features">
                        <span>Live JSON index</span>
                        <span>Search by ID</span>
                        <span>One-click play</span>
                    </div>
                </div>
                <form class="manual-form">
                    <label>Manual path</label>
                    <div class="manual-row">
                        <input class="manual-input" value="${escapeHtml(initialType || 'produce_events')}/202100711" />
                        <button type="submit">Open</button>
                    </div>
                </form>
            </section>
            <section class="entry-panel">
                <div class="entry-controls">
                    <input class="scenario-search" type="search" placeholder="Search event id or category..." />
                    <select class="category-select"></select>
                    <select class="language-select" aria-label="Language">
                        <option value="ja">日本語</option>
                        <option value="cn">中文</option>
                        <option value="en">English</option>
                    </select>
                    <button class="refresh-index" type="button">Refresh</button>
                    <span class="entry-status">Scanning JSON folders...</span>
                </div>
                <div class="scenario-grid"></div>
                <div class="entry-pager">
                    <button class="prev-page" disabled>Prev</button>
                    <span class="page-status"></span>
                    <button class="next-page" disabled>Next</button>
                </div>
            </section>
        </main>
    `;

    const state = {
        all: [],
        filtered: [],
        category: initialType || 'all',
        query: '',
        page: 1,
        perPage: 80,
    };

    const status = document.querySelector('.entry-status');
    const categorySelect = document.querySelector('.category-select');
    const languageSelect = document.querySelector('.language-select');
    const refreshIndex = document.querySelector('.refresh-index');
    const search = document.querySelector('.scenario-search');
    const grid = document.querySelector('.scenario-grid');
    const pageStatus = document.querySelector('.page-status');
    const prev = document.querySelector('.prev-page');
    const next = document.querySelector('.next-page');
    languageSelect.value = currentLanguage;

    document.querySelector('.manual-form').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const value = document.querySelector('.manual-input').value.trim();
        const parts = value.replace(/\\/g, '/').replace(/^json\//, '').split('/');
        if (parts.length < 2) {
            status.textContent = 'Use a path like produce_events/202100711';
            return;
        }
        openScenario(parts[0], parts[1].replace(/\.json$/i, ''), languageSelect.value);
    });

    let renderTimer = null;
    const scheduleRender = () => {
        if (renderTimer) clearTimeout(renderTimer);
        renderTimer = setTimeout(() => {
            renderTimer = null;
            renderScenarioList();
        }, 80);
    };

    search.addEventListener('input', () => {
        state.query = search.value.trim().toLowerCase();
        state.page = 1;
        scheduleRender();
    });

    categorySelect.addEventListener('change', () => {
        state.category = categorySelect.value;
        state.page = 1;
        renderScenarioList();
    });

    prev.addEventListener('click', () => {
        state.page = Math.max(1, state.page - 1);
        renderScenarioList();
    });

    next.addEventListener('click', () => {
        state.page += 1;
        renderScenarioList();
    });

    refreshIndex.addEventListener('click', () => loadIndex({ force: true }));

    await loadIndex({ force: false });

    async function loadIndex({ force }) {
        refreshIndex.disabled = true;
        try {
            const cached = !force ? readScenarioIndexCache() : null;
            if (cached) {
                applyScenarioIndex(cached.items, `cached ${Math.round((Date.now() - cached.savedAt) / 1000)}s ago`);
                return;
            }
            status.textContent = 'Scanning JSON folders...';
            const items = await scanScenarioIndex((done, total) => {
                status.textContent = `Scanning JSON folders... ${done}/${total}`;
            });
            writeScenarioIndexCache(items);
            applyScenarioIndex(items, 'fresh');
        } catch (err) {
            console.error('[entry] scan failed', err);
            status.textContent = 'Failed to scan folders. Use manual path instead.';
            categorySelect.innerHTML = `<option value="all">all</option>`;
            renderScenarioList();
        } finally {
            refreshIndex.disabled = false;
        }
    }

    function applyScenarioIndex(items, sourceLabel) {
        state.all = items;
        const counts = new Map();
        state.all.forEach(item => counts.set(item.eventType, (counts.get(item.eventType) || 0) + 1));
        const categories = ['all', ...Array.from(counts.keys()).sort()];
        categorySelect.innerHTML = categories.map(category =>
            `<option value="${escapeHtml(category)}">${escapeHtml(category)}${category === 'all' ? '' : ` (${counts.get(category) || 0})`}</option>`
        ).join('');
        categorySelect.value = categories.includes(state.category) ? state.category : 'all';
        state.category = categorySelect.value;
        status.textContent = `${state.all.length} scenario JSON files found (${sourceLabel})`;
        renderScenarioList();
    }

    function renderScenarioList() {
        const query = state.query;
        state.filtered = state.all.filter((item) => {
            const categoryMatch = state.category === 'all' || item.eventType === state.category;
            const queryMatch = !query || item.eventId.toLowerCase().includes(query) || item.eventType.toLowerCase().includes(query);
            return categoryMatch && queryMatch;
        });

        const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.perPage));
        state.page = Math.min(state.page, totalPages);
        const start = (state.page - 1) * state.perPage;
        const pageItems = state.filtered.slice(start, start + state.perPage);

        grid.innerHTML = pageItems.length
            ? pageItems.map((item, index) => {
                const style = getScenarioCardStyle(item);
                return `
                <button class="scenario-card${style.charId ? ' has-idol-color' : ''}" style="--card-delay: ${Math.min(index, 18) * 24}ms; --idol-color: ${style.color}; --idol-color-soft: ${hexToRgba(style.color, 0.16)}; --idol-color-fill: ${hexToRgba(style.color, 0.28)}; --idol-text: ${style.textColor};" data-event-type="${escapeHtml(item.eventType)}" data-event-id="${escapeHtml(item.eventId)}" data-char-id="${escapeHtml(style.charId || '')}">
                    ${style.charId ? `
                    <span class="scenario-thumb-frame" aria-hidden="true">
                        <img class="scenario-thumb scenario-thumb-classic" src="./assets/thumbnail/classic/${style.charId}.jpg?v=${THUMBNAIL_CACHE_BUSTER}" data-thumb-kind="classic" data-char-id="${style.charId}" data-ext-index="0" loading="lazy" decoding="async" alt="" />
                        <img class="scenario-thumb scenario-thumb-fes" src="./assets/thumbnail/fes/${style.charId}.jpg?v=${THUMBNAIL_CACHE_BUSTER}" data-thumb-kind="fes" data-char-id="${style.charId}" data-ext-index="0" loading="lazy" decoding="async" alt="" />
                    </span>` : ''}
                    <span class="scenario-category">${escapeHtml(item.eventType)}</span>
                    <strong>${escapeHtml(item.eventId)}</strong>
                    <span class="scenario-path">${escapeHtml(item.path)}</span>
                </button>
            `; }).join('')
            : `<div class="entry-empty">No scenarios match the current filters.</div>`;

        grid.querySelectorAll('.scenario-card').forEach((card) => {
            card.addEventListener('click', () => openScenario(card.dataset.eventType, card.dataset.eventId, languageSelect.value));
            card.querySelectorAll('.scenario-thumb').forEach((thumb) => bindThumbnailFallback(card, thumb));
        });

        pageStatus.textContent = `${state.filtered.length} items · page ${state.page} / ${totalPages}`;
        prev.disabled = state.page <= 1;
        next.disabled = state.page >= totalPages;
    }
}

function bindThumbnailFallback(card, thumb) {
    const markLoaded = () => {
        if (thumb.dataset.thumbKind === 'classic') card.classList.add('thumb-ready');
        if (thumb.dataset.thumbKind === 'fes') card.classList.add('fes-ready');
    };
    thumb.addEventListener('load', () => {
        markLoaded();
    }, { once: true });
    thumb.addEventListener('error', () => {
        const candidates = getThumbnailCandidates(thumb.dataset.thumbKind, thumb.dataset.charId);
        const nextIndex = Number(thumb.dataset.srcIndex || thumb.dataset.extIndex || '0') + 1;
        if (nextIndex < candidates.length) {
            thumb.dataset.srcIndex = String(nextIndex);
            thumb.src = candidates[nextIndex];
        }
    });
    if (thumb.complete && thumb.naturalWidth > 0) markLoaded();
}

function getThumbnailCandidates(kind, charId) {
    const extensions = ['jpg', 'png', 'webp'];
    if (kind === 'classic') {
        return [
            ...extensions.map(ext => `./assets/thumbnail/classic/${charId}.${ext}`),
            ...extensions.map(ext => `./assets/thumbnail/${charId}.${ext}`),
        ].map(withThumbnailCacheBuster);
    }
    return extensions.map(ext => `./assets/thumbnail/fes/${charId}.${ext}`).map(withThumbnailCacheBuster);
}

function withThumbnailCacheBuster(src) {
    return `${src}?v=${THUMBNAIL_CACHE_BUSTER}`;
}

function getScenarioCardStyle(item) {
    const charId = getProduceEventCharId(item);
    const color = charId ? (IDOL_COLORS[charId] || DEFAULT_ENTRY_COLOR) : DEFAULT_ENTRY_COLOR;
    return {
        charId,
        color,
        textColor: readableTextColor(color),
    };
}

function getProduceEventCharId(item) {
    if (!item || item.eventType !== 'produce_events') return '';
    const id = String(item.eventId || '');
    if (!/^\d{4}/.test(id)) return '';
    const charId = id.slice(1, 4);
    return IDOL_COLORS[charId] ? charId : '';
}

function hexToRgba(hex, alpha) {
    const normalized = String(hex || DEFAULT_ENTRY_COLOR).replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return `rgba(191, 233, 255, ${alpha})`;
    const value = parseInt(normalized, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function readableTextColor(hex) {
    const normalized = String(hex || DEFAULT_ENTRY_COLOR).replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return '#25465a';
    const value = parseInt(normalized, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.68 ? '#33485a' : '#ffffff';
}

async function scanScenarioIndex(onProgress) {
    const categories = await listDirectory(`${ASSET_PATH}/json/`, 'directories');
    const items = [];
    let done = 0;
    await runWithConcurrency(categories, 4, async (category) => {
        const files = await listDirectory(`${ASSET_PATH}/json/${encodeURIComponent(category)}/`, 'json');
        files.forEach((file) => {
            const eventId = file.replace(/\.json$/i, '');
            items.push({
                eventType: category,
                eventId,
                path: `${category}/${file}`,
            });
        });
        done++;
        if (onProgress) onProgress(done, categories.length);
        await yieldToBrowser();
    });
    return items.sort((a, b) => a.eventType.localeCompare(b.eventType) || a.eventId.localeCompare(b.eventId));
}

async function runWithConcurrency(items, limit, worker) {
    let next = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const item = items[next++];
            await worker(item);
        }
    });
    await Promise.all(runners);
}

function yieldToBrowser() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function readScenarioIndexCache() {
    try {
        const raw = sessionStorage.getItem(SCENARIO_INDEX_CACHE_KEY) || localStorage.getItem(SCENARIO_INDEX_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.items) || !parsed.savedAt) return null;
        if (Date.now() - parsed.savedAt > SCENARIO_INDEX_CACHE_TTL) return null;
        return parsed;
    } catch (_) {
        return null;
    }
}

function writeScenarioIndexCache(items) {
    const payload = JSON.stringify({ savedAt: Date.now(), items });
    try { sessionStorage.setItem(SCENARIO_INDEX_CACHE_KEY, payload); } catch (_) {}
    try { localStorage.setItem(SCENARIO_INDEX_CACHE_KEY, payload); } catch (_) {}
}

async function listDirectory(url, mode) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to list ${url}: ${res.status}`);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const links = Array.from(doc.querySelectorAll('a[href]'));
    return links.map((a) => decodeURIComponent(a.getAttribute('href').split(/[?#]/, 1)[0]))
        .filter((href) => href && href !== '../' && href !== '/')
        .map((href) => href.replace(/\/$/, '').split('/').pop())
        .filter((name) => {
            if (!name) return false;
            if (mode === 'directories') return !name.includes('.');
            return /\.json$/i.test(name);
        });
}

function openScenario(eventType, eventId, language) {
    const params = new URLSearchParams(window.location.search);
    params.set('eventType', eventType);
    params.set('eventId', eventId);
    const lang = normalizeScenarioLanguage(language);
    if (lang) {
        params.set('language', lang);
    } else {
        params.delete('language');
    }
    window.location.search = params.toString();
}

function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

function buildTouchOverlay(app) {
    const overlay = new PIXI.Container();
    overlay.interactive = true;
    overlay.buttonMode  = true;

    const bg = new PIXI.Graphics();
    bg.beginFill(0x000000, 0.5);
    bg.drawRect(0, 0, 1136, 640);
    bg.endFill();
    overlay.addChild(bg);

    const label = new PIXI.Text('Tap to Start', {
        fontFamily: USED_FONT, fontSize: 36, fill: 0xffffff, align: 'center',
    });
    label.anchor.set(0.5);
    label.position.set(568, 320);
    overlay.addChild(label);
    return overlay;
}

function showEndOverlay(app, advPlayer) {
    const overlay = buildEndOverlay(app);
    app.stage.addChild(overlay);
    if (advPlayer.soundController && typeof advPlayer.soundController.fadeOutAll === 'function') {
        advPlayer.soundController.fadeOutAll(1200);
    }
    const revealText = () => {
        advPlayer.stageObj.visible = false;
        if (typeof TweenMax !== 'undefined') TweenMax.to(overlay.content, 0.35, { alpha: 1 });
        else overlay.content.alpha = 1;
    };
    if (typeof TweenMax !== 'undefined') {
        TweenMax.to(overlay.bg, 1.2, { alpha: 1, onComplete: revealText });
    } else {
        overlay.bg.alpha = 1;
        revealText();
    }
}

function buildEndOverlay(app) {
    const overlay = new PIXI.Container();
    overlay.interactive = true;
    overlay.hitArea = new PIXI.Rectangle(0, 0, 1136, 640);

    const bg = new PIXI.Graphics();
    bg.beginFill(0x000000, 1);
    bg.drawRect(0, 0, 1136, 640);
    bg.endFill();
    bg.alpha = 0;
    overlay.addChild(bg);
    overlay.bg = bg;

    const content = new PIXI.Container();
    content.alpha = 0;
    overlay.addChild(content);
    overlay.content = content;

    const title = new PIXI.Text('End', {
        fontFamily: USED_FONT, fontSize: 52, fill: 0xffffff, align: 'center',
    });
    title.anchor.set(0.5);
    title.position.set(568, 290);
    content.addChild(title);

    const label = new PIXI.Text('Scenario Finished', {
        fontFamily: USED_FONT, fontSize: 24, fill: 0xd9f2ff, align: 'center',
    });
    label.anchor.set(0.5);
    label.position.set(568, 348);
    content.addChild(label);

    return overlay;
}

function resizeCanvas(app) {
    const w = document.documentElement.clientWidth;
    const h = document.documentElement.clientHeight;
    const ratio = Math.min(w / 1136, h / 640);
    app.view.style.width  = `${1136 * ratio}px`;
    app.view.style.height = `${640  * ratio}px`;
}
