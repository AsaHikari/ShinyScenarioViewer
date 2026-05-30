// DebugController — debug overlay + hotkeys for ScenarioViewer
//
// Hotkeys:
//   ` (backtick) — toggle debug info overlay
//   F1 — Normal mode (reset all visual toggles)
//   F2 — Green screen overlay (chroma-key)
//   F3 — Hide all Spine characters
//   F4 — Hide UI (dialogue box + control buttons)
//   ← / → — speed down / up (while overlay visible)
//   ↑ / ↓ — waitTime up / down
//   Space — skip current track
//   S — toggle speed mode (Manual / Auto / Fast)
class DebugController {
    constructor(advPlayer, app) {
        this._adv = advPlayer;
        this._app = app;

        this._greenScreen = false;
        this._hideSpine   = false;
        this._hideUI      = false;
        this._overlayVisible = false;

        // ── Green overlay (chroma-key) ──
        this._greenOverlay = new PIXI.Graphics();
        this._greenOverlay.beginFill(0x00FF00, 1);
        this._greenOverlay.drawRect(0, 0, 1136, 640);
        this._greenOverlay.endFill();
        this._greenOverlay.visible = false;
        const container = advPlayer._container;
        const charIdx = container.getChildIndex(advPlayer._characterStage.stageObj);
        container.addChildAt(this._greenOverlay, charIdx);

        // ── Debug info overlay ──
        this._overlay = this._buildOverlay();
        container.addChild(this._overlay);

        // Auto-refresh overlay every frame
        this._refreshCounter = 0;
        if (app && app.ticker) {
            this._boundTick = () => {
                this._refreshCounter++;
                if (this._refreshCounter % 6 === 0) this._refreshOverlay();  // 10fps
            };
            app.ticker.add(this._boundTick);
        }

        this._onKeyDown = this._onKeyDown.bind(this);
        document.addEventListener('keydown', this._onKeyDown);
    }

    // ── Info panel ──────────────────────────────────────────────────────────
    _buildOverlay() {
        const panel = new PIXI.Container();
        panel.visible = false;
        panel.x = 12;
        panel.y = 12;

        // Background — wide enough for monospace text
        const W = 310, H = 170;
        const bg = new PIXI.Graphics();
        bg.beginFill(0x000000, 0.78);
        bg.drawRoundedRect(0, 0, W, H, 8);
        bg.endFill();
        panel.addChild(bg);

        // Text
        const style = { fontFamily: 'monospace', fontSize: 13, fill: 0x88ff88, lineHeight: 18 };
        this._dbText = new PIXI.Text('', style);
        this._dbText.x = 8;
        this._dbText.y = 8;
        panel.addChild(this._dbText);

        return panel;
    }

    _refreshOverlay() {
        if (!this._overlayVisible) return;
        const a = this._adv;
        const tm = a._trackManager;
        const cur = tm ? tm.currentTrack : null;
        const idx = tm ? tm._current : 0;
        const total = tm ? tm._tracks.length : 0;
        const sp = a._scenarioPlayer;
        const tp = sp ? sp._textPlayer : null;

        const modeName = { 1: 'MANUAL', 2: 'AUTO' };
        let mode = modeName[a._mode] || '?';
        if (a._isFast4Mode) mode = 'FAST4';

        this._dbText.text = [
            `State: ${this._stateName()}  Mode: ${mode}`,
            `Track: ${idx + 1} / ${total}`,
            `Speed: ${tp ? tp.speed : '?'}  Wait: ${a._waitTime}ms  Eff: ${a._effectSpeed}x`,
            `ID:    ${cur && cur.id ? cur.id : '-'}`,
            `Voice: ${a._currentVoice ? 'playing' : 'none'}  AutoWait: ${a._autoWaitTime}`,
            `Fast4: ${a._isFast4Mode ? 'ON' : 'off'}  Green: ${this._greenScreen ? 'ON' : 'off'}`,
            `Spine: ${this._hideSpine ? 'HIDE' : 'show'}  UI: ${this._hideUI ? 'HIDE' : 'show'}`,
            '',
            '←→ spd  ↑↓ wait  Space skip  S mode',
        ].join('\n');
    }

    _stateName() {
        const s = this._adv._state;
        if (s === 'FREE') return 'FREE';
        if (s === 'PLAYING') return 'PLAY';
        if (s === 'WAITING') return 'WAIT';
        if (s === 'LOCKED') return 'LOCK';
        return s || '?';
    }

    // ── Hotkeys ──────────────────────────────────────────────────────────────
    _onKeyDown(e) {
        // Don't intercept when typing in inputs
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

        switch (e.code) {
            case 'Backquote': this._toggleOverlay(); break;
            case 'F1': this._normal(); break;
            case 'F2': this._toggleGreenScreen(); break;
            case 'F3': this._toggleHideSpine(); break;
            case 'F4': this._toggleHideUI(); break;
            case 'Space':
                if (this._overlayVisible) { e.preventDefault(); this._skipTrack(); }
                break;
            case 'ArrowLeft':  if (this._overlayVisible) this._adjSpeed(-50); break;
            case 'ArrowRight': if (this._overlayVisible) this._adjSpeed(50); break;
            case 'ArrowUp':    if (this._overlayVisible) this._adjWait(50); break;
            case 'ArrowDown':  if (this._overlayVisible) this._adjWait(-50); break;
            case 'KeyS':
                if (this._overlayVisible) this._cycleMode();
                break;
        }
    }

    _toggleOverlay() {
        this._overlayVisible = !this._overlayVisible;
        this._overlay.visible = this._overlayVisible;
        if (this._overlayVisible) this._refreshOverlay();
    }

    _normal() {
        this._setGreenScreen(false);
        this._setHideSpine(false);
        this._setHideUI(false);
        this._refreshOverlay();
    }
    _toggleGreenScreen() { this._setGreenScreen(!this._greenScreen); this._refreshOverlay(); }
    _toggleHideSpine()   { this._setHideSpine(!this._hideSpine); this._refreshOverlay(); }
    _toggleHideUI()      { this._setHideUI(!this._hideUI); this._refreshOverlay(); }

    _setGreenScreen(on) {
        this._greenScreen = on;
        this._greenOverlay.visible = on;
        this._adv._fgLayer.stageObj.visible = !on;
    }
    _setHideSpine(on) {
        this._hideSpine = on;
        this._adv._characterStage.stageObj.visible = !on;
    }
    _setHideUI(on) {
        this._hideUI = on;
        this._adv._mainController.stageObj.visible = !on;
        this._adv._scenarioPlayer.stageObj.visible = !on;
    }

    _skipTrack() {
        if (this._adv._state === 'PLAYING') { this._adv._endTrack(); }
        else if (this._adv._state === 'WAITING') { this._adv._forward(); }
        this._refreshOverlay();
    }

    _adjSpeed(delta) {
        const tp = this._adv._scenarioPlayer._textPlayer;
        if (tp) tp.speed = Math.max(1, Math.min(8000, (tp.speed || 100) + delta));
        this._refreshOverlay();
    }

    _adjWait(delta) {
        this._adv._waitTime = Math.max(0, Math.min(5000, this._adv._waitTime + delta));
        this._refreshOverlay();
    }

    _cycleMode() {
        let next;
        if (this._adv._isFast4Mode) next = { mode: 1, speed: 100, effectSpeed: 1, waitTime: 180, soundDisabled: false };
        else if (this._adv._mode === 2) next = { mode: 2, speed: 8000, effectSpeed: 8, waitTime: 20, soundDisabled: true };
        else next = { mode: 2, speed: 100, effectSpeed: 1, waitTime: 800, soundDisabled: false };
        this._adv._onControl(next);
        this._refreshOverlay();
    }
}
