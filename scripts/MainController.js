// UI control panel. Layout mirrors enza scenario player.
// All button sprites come from the 'uiParts' spritesheet (parts_event.json).
//
// Enza absolute positions (1136×640 canvas):
//   fast4Button   (989, 589)   — inside dialog box area
//   menuButton   (1078, 589)   — opens / closes the popout panel
//   scenarioMenuBase (1078, 633) anchor (0.5, 1) — panel background
//   autoButton   (1078, 331)
//   logButton    (1078, 411)
//   hideButton   (1078, 491)
//   skipButton   (1083,  51)  — hidden by default; host calls showSkipButton()
class MainController extends PIXI.utils.EventEmitter {
    constructor(soundController) {
        super();
        this._container = new PIXI.Container();
        this._loader    = PIXI.Loader.shared;
        this._sound     = soundController;

        this._isAutoOn   = false;
        this._isFastOn   = false;
        this._isMenuOpen = false;
        this._isHidden   = false;

        this._ui       = {};
        this._textHost = null;
    }

    get stageObj() { return this._container; }

    init(textHost) {
        this._textHost = textHost;
        this._build();
        this.emit('control', CONTROL_PRESETS.NORMAL);
    }

    // ─── Build ──────────────────────────────────────────────────────────
    _build() {
        const W = 1136, H = 640;
        const res = this._loader.resources['uiParts'];
        const tx  = (res && res.spritesheet) ? res.spritesheet.textures : null;

        // Full-screen recover layer (only interactive when UI is hidden)
        const recover = new PIXI.Container();
        recover.interactive = false;
        recover.hitArea = new PIXI.Rectangle(0, 0, W, H);
        recover.on('pointertap', () => this._showUI());
        this._container.addChild(recover);
        this._ui.recover = recover;

        // Menu background plate — anchor (0.5, 1)
        this._ui.menuBase = this._mkSprite(tx, 'scenario_menu_base.png', 1078, 633, (0.5), 1);

        // Skip button (hidden by default)
        this._ui.btnSkip = this._mkBtn(tx, 'skip_to_select_track_button.png',
            1083, 51, () => this.emit('skip'));
        this._ui.btnSkip.visible = false;

        // Always-visible buttons (outside menu)
        this._ui.btnFast = this._mkBtn(tx, 'fast_button_4_off.png',
            989, 589, () => this._onTapFast());
        this._ui.btnMenu = this._mkBtn(tx, 'scenario_menu_close_button.png',
            1078, 589, () => this._toggleMenu());

        // Menu cluster buttons
        this._ui.btnAuto = this._mkBtn(tx, 'auto_button_off.png',
            1078, 331, () => this._onTapAuto());
        this._ui.btnLog  = this._mkBtn(tx, 'log_button.png',
            1078, 411, () => this._onTapLog());
        this._ui.btnHide = this._mkBtn(tx, 'hide_button.png',
            1078, 491, () => this._hideUI());

        this._applyMenuVisibility();
    }

    // Build a button sprite. anchorX/Y default to 0.5.
    _mkBtn(tx, key, x, y, onTap, ax = 0.5, ay = 0.5) {
        const sp = tx && tx[key]
            ? new PIXI.Sprite(tx[key])
            : this._mkFallbackBtn(key);

        sp.anchor.set(ax, ay);
        sp.position.set(x, y);
        sp.interactive = true;
        sp.buttonMode  = true;
        sp.on('pointerover',     () => sp.scale.set(1.05));
        sp.on('pointerout',      () => sp.scale.set(1.00));
        sp.on('pointerdown',     () => { sp.scale.set(0.95); this._playUiSe(); });
        sp.on('pointerup',       () => { sp.scale.set(1.05); try { onTap(); } catch(e){ console.error(e); } });
        sp.on('pointerupoutside',() => sp.scale.set(1.00));
        this._container.addChild(sp);
        return sp;
    }

    // Non-interactive sprite (e.g. menuBase)
    _mkSprite(tx, key, x, y, ax = 0.5, ay = 0.5) {
        const sp = tx && tx[key]
            ? new PIXI.Sprite(tx[key])
            : (() => {
                const g = new PIXI.Graphics();
                g.beginFill(0xFFFFFF, 0.92);
                g.lineStyle(2, 0x615365, 0.7);
                g.drawRoundedRect(-90, -160, 180, 160, 14);
                g.endFill();
                return g;
            })();
        sp.anchor && sp.anchor.set(ax, ay);
        sp.position.set(x, y);
        this._container.addChild(sp);
        return sp;
    }

    // Graphics fallback button for when spritesheet is missing
    _mkFallbackBtn(label) {
        const c = new PIXI.Container();
        const g = new PIXI.Graphics();
        g.beginFill(0x615365, 0.9);
        g.drawRoundedRect(-38, -20, 76, 40, 8);
        g.endFill();
        c.addChild(g);
        const t = new PIXI.Text(label.replace('.png',''), {
            fontFamily: USED_FONT_UI, fontSize: 14, fill: 0xFFFFFF,
        });
        t.anchor.set(0.5);
        c.addChild(t);
        c.anchor = { set: () => {} };  // stub
        return c;
    }

    _playUiSe() { if (this._sound) this._sound.playSeUrl(UI_TAP_SE_URL); }

    // ─── Menu open / close ──────────────────────────────────────────────
    _toggleMenu() {
        this._isMenuOpen = !this._isMenuOpen;
        this._applyMenuVisibility();
    }
    _applyMenuVisibility() {
        const open = this._isMenuOpen;
        ['btnAuto', 'btnLog', 'btnHide', 'menuBase'].forEach(k => {
            if (this._ui[k]) this._ui[k].visible = open;
        });
        if (this._ui.btnMenu) {
            const res = this._loader.resources['uiParts'];
            const tx  = (res && res.spritesheet) ? res.spritesheet.textures : null;
            const key = open ? 'scenario_menu_close_button.png' : 'scenario_menu_open_button.png';
            if (tx && tx[key]) this._ui.btnMenu.texture = tx[key];
        }
    }

    // ─── AUTO / FAST / LOG ──────────────────────────────────────────────
    _onTapAuto() {
        this._isAutoOn = !this._isAutoOn;
        if (this._isAutoOn) this._isFastOn = false;
        this._refreshToggleTextures();
        this._dispatchCurrent();
    }
    _onTapFast() {
        this._isFastOn = !this._isFastOn;
        if (this._isFastOn) this._isAutoOn = false;
        this._refreshToggleTextures();
        this._dispatchCurrent();
    }
    _onTapLog() {
        this.emit('control', CONTROL_PRESETS.LOG);
    }
    _refreshToggleTextures() {
        const res = this._loader.resources['uiParts'];
        if (!res || !res.spritesheet) return;
        const tx = res.spritesheet.textures;
        if (this._ui.btnAuto && tx)
            this._ui.btnAuto.texture = tx[this._isAutoOn ? 'auto_button_on.png' : 'auto_button_off.png'];
        if (this._ui.btnFast && tx)
            this._ui.btnFast.texture = tx[this._isFastOn ? 'fast_button_4_on.png' : 'fast_button_4_off.png'];
    }
    _dispatchCurrent() {
        if (this._isFastOn)      this.emit('control', CONTROL_PRESETS.FAST);
        else if (this._isAutoOn) this.emit('control', CONTROL_PRESETS.AUTO);
        else                     this.emit('control', CONTROL_PRESETS.NORMAL);
    }

    // ─── Hide / show ────────────────────────────────────────────────────
    _hideUI() {
        if (this._isHidden) return;
        this._isHidden = true;
        Object.entries(this._ui).forEach(([k, el]) => {
            if (!el || k === 'recover') return;
            el.visible = false;
        });
        if (this._textHost) this._textHost.visible = false;
        this._ui.recover.interactive = true;
    }
    _showUI() {
        if (!this._isHidden) return;
        this._isHidden = false;
        if (this._textHost) this._textHost.visible = true;
        if (this._ui.btnMenu) this._ui.btnMenu.visible = true;
        if (this._ui.btnFast) this._ui.btnFast.visible = true;
        this._applyMenuVisibility();
        this._ui.recover.interactive = false;
    }

    setLogOpen(open) { /* reserved */ }
}
