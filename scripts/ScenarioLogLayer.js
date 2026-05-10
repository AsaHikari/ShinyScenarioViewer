// History dialog overlay — 1:1 replica of enza ScenarioLogLayer / LogPop.
//
// Authoritative layout specs (extracted from enza minified bundle):
//   Panel: WHITE rounded panel, 912 × 610, centred on 1136 × 640 canvas
//   ScrollRect: 840 × 476 at panel-local (26, 26)
//   ScrollBarBase: width 8, height 472 at panel-local (883, 29)
//   CloseButton: at panel-local (459, 555)
//
// Per-entry layout (Je template = normal, Qe template = producer):
//   Normal: icon centred at (45, 46) scale 0.5; txtFrame container at (96, 29);
//           text at (149, 44); speaker at (119, 12); soundButton at (813, 60).
//   Producer: addTo at x=96; txtFrame at (0, 0); text at (32, 16).
//   StretchSprite (NineSlicePlane equiv): top=28, bottom=12, h = 30 + text.height
//
// Propagation rules (applied at render time, mirrors enza _createLogList):
//   1. selectedFrame = '001' (default) — overwritten by any producer track that
//      carries an explicit logTextFrame.
//   2. If track has no speaker AND is not a select item → inherit speaker +
//      speakerIcon from previous track.
//   3. If track has no logTextFrame → inherit from previous track.
//   4. If track is a select item → speaker = producer name, frame = selectedFrame.
//
// Vertical entry spacing: previous_height + 32.
class ScenarioLogLayer extends PIXI.utils.EventEmitter {
    constructor() {
        super();
        this._container = new PIXI.Container();
        this._container.visible = false;
        this._tracks = [];

        this._W = 1136;
        this._H = 640;
        // Panel
        this._PW = 912;
        this._PH = 610;
        this._PX = (this._W - this._PW) / 2;   // 112
        this._PY = (this._H - this._PH) / 2;   // 15
        // ScrollRect (panel-local 26,26 — 840×476)
        this._SR_X = this._PX + 26;
        this._SR_Y = this._PY + 26;
        this._SR_W = 840;
        this._SR_H = 476;
        // ScrollBar (panel-local 883,29 — 8×472)
        this._SB_X = this._PX + 883;
        this._SB_Y = this._PY + 29;
        this._SB_W = 8;
        this._SB_H = 472;
        // CloseButton (panel-local 459,555)
        this._CB_X = this._PX + 459;
        this._CB_Y = this._PY + 555;

        this._scroll    = 0;
        this._maxScroll = 0;
        this._build();
    }

    get stageObj() { return this._container; }
    get isOpen()   { return this._container.visible; }

    stackTrack(track) {
        if (!track) return;
        const text = this._normalizeLineBreaks(track.text || '');
        if (!text && !track.select) return;
        if (track.textFrame === 'off') return;
        const prev = this._tracks[this._tracks.length - 1];
        if (prev && text && !track.isSelectedItem) {
            if (prev.textCtrl === 'r' || prev.textCtrl === 'l') {
                prev.text = `${prev.text || ''}\n${text}`;
                prev.textCtrl = track.textCtrl;
                if (track.logTextFrame) prev.logTextFrame = track.logTextFrame;
                if (track.voice) prev.voice = track.voice;
                return;
            }
            if (prev.textCtrl === 'n') {
                prev.text = `${prev.text || ''}${text}`;
                prev.textCtrl = track.textCtrl;
                if (track.logTextFrame) prev.logTextFrame = track.logTextFrame;
                if (track.voice) prev.voice = track.voice;
                return;
            }
        }
        // Snapshot only the fields the log layer needs (avoids holding refs)
        this._tracks.push({
            speaker:       track.speaker,
            text,
            speakerIcon:   track.speakerIcon,
            logTextFrame:  track.logTextFrame,
            voice:         track.voice,
            isSelectedItem: !!track.isSelectedItem,
            textCtrl:      track.textCtrl,
        });
    }

    _normalizeLineBreaks(text) {
        return String(text).replace(/\r\n|\r/g, '\n');
    }

    open() {
        this._render();
        this._container.visible = true;
        // Animate overlay and panel like enza (180ms = ~11 frames at 60fps)
        this._backdropGfx.alpha = 0;
        this._panelBase.scale.set(0);
        this._tween(this._backdropGfx, 0.18, { alpha: 1 });
        this._tween(this._panelBase.scale, 0.18, { x: 1, y: 1, ease: 'back.out(1.7)' });
    }

    close() {
        this._tween(this._backdropGfx, 0.18, { alpha: 0 });
        this._tween(this._panelBase.scale, 0.18, {
            x: 0, y: 0,
            ease: 'back.in(1.7)',
            onComplete: () => {
                this._container.visible = false;
                this.emit('closeLog');
            }
        });
    }

    // ─── Static scaffolding ─────────────────────────────────────────────────
    _build() {
        // Dimmed backdrop — eats clicks below the panel
        const backdrop = new PIXI.Graphics();
        backdrop.beginFill(0x000000, 0.55);
        backdrop.drawRect(0, 0, this._W, this._H);
        backdrop.endFill();
        backdrop.interactive = true;
        this._container.addChild(backdrop);
        this._backdropGfx = backdrop;

        // Panel base container — scaled for open/close animation
        const panelBase = new PIXI.Container();
        panelBase.pivot.set(this._W / 2, this._H / 2);
        panelBase.position.set(this._W / 2, this._H / 2);
        this._container.addChild(panelBase);
        this._panelBase = panelBase;

        const panel = this._createEnzaPanelBase();
        panel.position.set(this._PX, this._PY);
        panel.interactive = true;
        panelBase.addChild(panel);

        // Scrollbar layers (redrawn on scroll)
        this._sbTrack = new PIXI.Graphics();
        this._sbThumb = new PIXI.Graphics();
        panelBase.addChild(this._sbTrack);
        panelBase.addChild(this._sbThumb);

        // Clip mask for the scroll viewport
        const maskGfx = new PIXI.Graphics();
        maskGfx.beginFill(0xFFFFFF);
        maskGfx.drawRect(this._SR_X, this._SR_Y, this._SR_W, this._SR_H);
        maskGfx.endFill();
        panelBase.addChild(maskGfx);

        // Scrollable list host
        this._listHost = new PIXI.Container();
        this._listHost.position.set(this._SR_X, this._SR_Y);
        this._listHost.mask = maskGfx;
        panelBase.addChild(this._listHost);

        this._buildCloseBtn(panelBase);
        this._setupScroll(backdrop, panel);
    }

    _createEnzaPanelBase() {
        const res = PIXI.Loader.shared.resources['uiCommonAtlas'];
        const tex = (res && res.textures && res.textures['stretch_white_round_10.png'])
            || PIXI.utils.TextureCache['stretch_white_round_10.png'];
        if (tex) {
            const panel = new PIXI.NineSlicePlane(tex, 10, 10, 10, 10);
            panel.width = this._PW;
            panel.height = this._PH;
            panel.alpha = 0.96;
            return panel;
        }
        const fallback = new PIXI.Graphics();
        fallback.beginFill(0xFFFFFF, 0.96);
        fallback.drawRoundedRect(0, 0, this._PW, this._PH, 10);
        fallback.endFill();
        return fallback;
    }

    _buildCloseBtn(parent) {
        const btn = new PIXI.Container();
        btn.position.set(this._CB_X, this._CB_Y);
        btn.interactive = true;
        btn.buttonMode  = true;

        const commonParts = PIXI.Loader.shared.resources['uiCommonParts'];
        const closeTex = (commonParts && commonParts.textures && commonParts.textures['close_button.png'])
            || PIXI.utils.TextureCache['close_button.png'];
        if (closeTex) {
            const sp = new PIXI.Sprite(closeTex);
            sp.anchor.set(0.5);
            btn.addChild(sp);
        } else {
            const bg = new PIXI.Graphics();
            bg.beginFill(0xFFC0CB, 0.95);
            bg.lineStyle(2, 0xFF7799, 1);
            bg.drawRoundedRect(-72, -22, 144, 44, 22);
            bg.endFill();
            btn.addChild(bg);

            const lbl = new PIXI.Text('閉じる', {
                fontFamily: USED_FONT_UI, fontSize: 20, fill: 0xFFFFFF, fontWeight: 'bold',
            });
            lbl.anchor.set(0.5);
            btn.addChild(lbl);
        }
        btn.on('pointertap', () => {
            this._playCloseSe();
            this.close();
        });
        parent.addChild(btn);
    }

    _playCloseSe() {
        const res = PIXI.Loader.shared.resources[UI_CANCEL_SE_KEY];
        if (!res || !res.sound) return;
        try { res.sound.play({ loop: false }); } catch(_) {}
    }

    _setupScroll(backdrop, panel) {
        window.addEventListener('wheel', (ev) => {
            if (!this.isOpen) return;
            this._setScroll(this._scroll + ev.deltaY);
        }, { passive: true });

        let dragY = null, dragScroll0 = 0;
        const onDown = (ev) => { dragY = ev.data.global.y; dragScroll0 = this._scroll; };
        const onMove = (ev) => {
            if (dragY == null) return;
            this._setScroll(dragScroll0 - (ev.data.global.y - dragY));
        };
        const onUp = () => { dragY = null; };

        for (const obj of [backdrop, panel]) {
            obj.on('pointerdown',     onDown);
            obj.on('pointermove',     onMove);
            obj.on('pointerup',       onUp);
            obj.on('pointerupoutside', onUp);
        }
    }

    _setScroll(v) {
        this._scroll = Math.max(0, Math.min(this._maxScroll, v));
        this._listHost.y = this._SR_Y - this._scroll;
        this._updateScrollbar();
    }

    _updateScrollbar() {
        this._sbTrack.clear();
        this._sbTrack.beginFill(0x837987, 1);
        this._sbTrack.drawRoundedRect(this._SB_X, this._SB_Y, this._SB_W, this._SB_H, 4);
        this._sbTrack.endFill();

        this._sbThumb.clear();
        if (this._maxScroll > 0) {
            const totalH = this._SB_H + this._maxScroll;
            const thumbH = Math.max(28, this._SB_H * this._SB_H / totalH);
            const thumbY = this._SB_Y + (this._SB_H - thumbH) * (this._scroll / this._maxScroll);
            const thumbW = 18;
            this._sbThumb.lineStyle(2, 0x837987, 1);
            this._sbThumb.beginFill(0xFFFFFF, 1);
            this._sbThumb.drawRoundedRect(this._SB_X + (this._SB_W - thumbW) / 2, thumbY, thumbW, thumbH, 9);
            this._sbThumb.endFill();
        }
    }

    // ─── Render entries (mirrors enza _createLogList) ───────────────────────
    _render() {
        this._listHost.removeChildren();
        if (this._tracks.length === 0) { this._maxScroll = 0; this._setScroll(0); return; }

        const isProducer = (sp) => !!sp && PRODUCER_SPEAKERS.has(sp);
        const PRODUCER_NAME = 'プロデューサー';

        // Default selected-track frame — fall back to logTextFrame template id '001'
        const defaultSelectedFrame = (typeof CHARACTER_ASSET_FORMAT !== 'undefined')
            ? CHARACTER_ASSET_FORMAT.logTextFrame.replace('${id}', '001')
            : null;
        let selectedFrame = defaultSelectedFrame;


        // Build resolved entry list applying enza's propagation rules
        let prev = this._tracks[0];
        const resolved = this._tracks.map((raw) => {
            const e = Object.assign({}, raw);
            if (isProducer(e.speaker) && e.logTextFrame) selectedFrame = e.logTextFrame;
            if (!e.speaker && !e.isSelectedItem) {
                e.speaker     = prev.speaker;
                e.speakerIcon = prev.speakerIcon;
            }
            if (!e.logTextFrame) e.logTextFrame = prev.logTextFrame;
            if (e.isSelectedItem) {
                e.speaker      = PRODUCER_NAME;
                e.logTextFrame = selectedFrame;
            }
            prev = e;
            return e;
        });

        let y = 0;
        for (const e of resolved) {
            const producer = isProducer(e.speaker);
            const entry = producer ? this._buildProducerEntry(e) : this._buildNormalEntry(e);
            entry.position.set(producer ? 96 : 0, y);
            this._listHost.addChild(entry);
            y += entry._entryHeight + 32;
        }

        this._maxScroll = Math.max(0, y - this._SR_H);
        this._setScroll(this._maxScroll);   // open at bottom (newest)
    }

    // Normal (Je): icon @ (45,46) scale 0.5; txtFrame @ (96,29);
    // text @ (149,44); speaker @ (119,12); soundButton @ (813,60).
    _buildNormalEntry(e) {
        const entry = new PIXI.Container();

        const tex = this._getTex(e.logTextFrame);
        const frame = this._makeFrame(tex);     // NineSlicePlane or Graphics fallback
        frame.position.set(96, 29);
        entry.addChild(frame);

        // Speaker name (entry-local 119, 12 baseline at vertical centre)
        const speakerStyle = {
            fontFamily: USED_FONT, fontSize: LOG_TEXT_FONTSIZE, fill: LOG_TEXT_FILL,
        };
        if (e.speaker) {
            const sp = new PIXI.Text(e.speaker, speakerStyle);
            sp.anchor.set(0, 0.5);
            sp.position.set(119, 12);
            entry.addChild(sp);
        }

        // Body text (entry-local 149, 44). wordWrap width = soundButton x − text x − padding.
        const bodyW = e.voice ? (813 - 24) - 149 : (96 + 744 - 24) - 149;
        const body = new PIXI.Text(e.text || '', {
            fontFamily: USED_FONT,
            fontSize:   LOG_TEXT_FONTSIZE,
            fill:       LOG_TEXT_FILL,
            wordWrap:   true,
            wordWrapWidth: bodyW,
            breakWords: true,
        });
        body.position.set(149, 44);
        entry.addChild(body);

        // Resize frame to text height: enza formula = 30 + text.height
        this._setFrameHeight(frame, 30 + body.height);

        // Speaker icon (anchor centre at 45, 46; src 180×180 at scale 0.5 → 90×90)
        const iconTex = e.speakerIcon ? this._getTex(e.speakerIcon) : null;
        if (iconTex) {
            const ic = new PIXI.Sprite(iconTex);
            ic.anchor.set(0.5);
            ic.scale.set(0.5);
            ic.position.set(45, 46);
            const m = new PIXI.Graphics();
            m.beginFill(0xFFFFFF);
            m.drawCircle(45, 46, 45);
            m.endFill();
            ic.mask = m;
            entry.addChild(m);
            entry.addChild(ic);
        }

        // Sound button (only when voice present): anchor centre @ (813, 60)
        if (e.voice) {
            entry.addChild(this._makeSoundButton(813, 60, e.voice));
        }

        // Total entry height = frame y + frame height
        entry._entryHeight = 29 + (30 + body.height);
        return entry;
    }

    // Producer (Qe): txtFrame @ (0,0); text @ (32,16); no icon, no speaker label.
    _buildProducerEntry(e) {
        const entry = new PIXI.Container();
        const tex = this._getTex(e.logTextFrame);
        const frame = this._makeFrame(tex);
        frame.position.set(0, 0);
        entry.addChild(frame);

        const body = new PIXI.Text(e.text || '', {
            fontFamily: USED_FONT,
            fontSize:   LOG_TEXT_FONTSIZE,
            fill:       LOG_TEXT_FILL,
            wordWrap:   true,
            wordWrapWidth: e.voice ? 744 - 32 - 32 - 52 : 744 - 32 - 32,
            breakWords: true,
        });
        body.position.set(32, 16);
        entry.addChild(body);

        this._setFrameHeight(frame, 30 + body.height);

        if (e.voice) {
            entry.addChild(this._makeSoundButton(708, 31, e.voice));
        }

        entry._entryHeight = 30 + body.height;
        return entry;
    }

    // ─── helpers ────────────────────────────────────────────────────────────
    _makeSoundButton(x, y, voice) {
        const sndTex = PIXI.utils.TextureCache['btn_sound.png'];
        let sb;
        if (sndTex) {
            sb = new PIXI.Sprite(sndTex);
            sb.anchor.set(0.5);
        } else {
            sb = new PIXI.Graphics();
            sb.beginFill(0xCCCCCC, 0.85);
            sb.drawCircle(0, 0, 16);
            sb.endFill();
            sb.beginFill(0x615365);
            sb.drawPolygon([-6, -7, -6, 7, 8, 0]);
            sb.endFill();
        }
        sb.position.set(x, y);
        sb.interactive = true;
        sb.buttonMode  = true;
        sb.on('pointertap', (ev) => {
            if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
            this.emit('replayVoice', voice);
        });
        return sb;
    }

    _getTex(url) {
        if (!url) return null;
        const r = PIXI.Loader.shared.resources[url];
        if (r && r.texture) return r.texture;
        return PIXI.utils.TextureCache[url] || null;
    }

    // StretchSprite analogue: NineSlicePlane top=28, bottom=12 on log_text_frame
    // (744×82 source). Falls back to a pale rounded Graphics if texture missing.
    _makeFrame(tex) {
        if (tex) {
            const np = new PIXI.NineSlicePlane(tex, 40, 28, 40, 12);
            np.width = 744;
            return np;
        }
        const g = new PIXI.Graphics();
        g.beginFill(0xF5E0E8, 0.85);
        g.drawRoundedRect(0, 0, 744, 63, 12);
        g.endFill();
        g._fallback = true;
        return g;
    }

    _setFrameHeight(frame, h) {
        if (frame instanceof PIXI.NineSlicePlane) {
            frame.height = h;
        } else if (frame._fallback) {
            frame.clear();
            frame.beginFill(0xF5E0E8, 0.85);
            frame.drawRoundedRect(0, 0, 744, h, 12);
            frame.endFill();
        }
    }

    _tween(target, duration, vars) {
        if (typeof gsap !== 'undefined') {
            return gsap.to(target, Object.assign({ duration }, vars));
        }
        if (typeof TweenMax !== 'undefined') {
            return TweenMax.to(target, duration, vars);
        }
        Object.assign(target, vars);
        if (typeof vars.onComplete === 'function') vars.onComplete();
        return null;
    }
}
