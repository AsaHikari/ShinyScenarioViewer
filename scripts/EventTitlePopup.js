// EventTitlePopup.js
// 1:1 enza chunk 56496 modules 18892 + 20729
//
// Structure (enza outer→inner):
//   t = outer container (fixed, fades on "end")                          ← this class
//   ├─ c() sparkle bg (circle1/2/3 + sparkle1/2/3) — static, no move    ← this._bgLayer
//   └─ g  plate container   — slides in from left                       ← this._plate
//        ├─ eventPlateBase: 9-slice pop_stretch_white.png 452×116
//        ├─ DOT_BLACK separator y:64
//        ├─ idolIcon (9,8), eventType (274,39), eventName (115,89)
//        └─ _eventPlateLayer (masked, for sweep fx)
//
// Animation:
//   g: from({x:-width},260) → sweeps → by({x:50},2200) → emit end → by({x:25},240)
//   t: on "end": to({alpha:0},240) → destroy

class EventTitlePopup extends PIXI.Container {
    constructor(params = {}) {
        super();
        const { app, cardIconUrl, eventName, eventType } = params;

        this._app          = app;
        this._baseWidth    = 452;
        this._baseHeight   = 116;

        // ── Outer container (t) — at screen origin, fades on "end" ──
        this.x = 0;
        this.y = 0;

        // ── Sparkle background (c()) — always visible, never moves ──
        this._bgLayer = new PIXI.Container();
        this.addChild(this._bgLayer);
        this._addSparkles();

        // ── Plate (g) — slides in from left ──
        this._plate = new PIXI.Container();
        this.addChild(this._plate);

        // enza: plate layout `r` has x:16 y:16 offset from container
        const content = new PIXI.Container();
        content.x = 16;
        content.y = 16;
        this._plate.addChild(content);

        // eventPlateBase
        const nsTex = this._getTexture('pop_stretch_white.png', 'uiInitPop');
        if (nsTex) {
            const ns = new PIXI.NineSlicePlane(nsTex, 12, 12, 12, 12);
            ns.width  = this._baseWidth;
            ns.height = this._baseHeight;
            content.addChild(ns);
        } else {
            const bg = new PIXI.Graphics();
            bg.beginFill(0xffffff, 1);
            bg.drawRoundedRect(0, 0, this._baseWidth, this._baseHeight, 10);
            bg.endFill();
            content.addChild(bg);
        }

        // DOT_BLACK separator (enza: TilingSprite.fromFrame("dot_black.png", 432, 2) at y:64 x:10)
        const dotTex = this._getTexture('dot_black.png', 'uiCommonParts');
        if (dotTex) {
            const ts = new PIXI.TilingSprite(dotTex, this._baseWidth - 20, 2);
            ts.position.set(10, 64);
            content.addChild(ts);
        }

        // idolIcon (9, 8)
        if (cardIconUrl) this._addCardIcon(content, cardIconUrl);

        // eventType (274, 39) center-anchored
        const typeKey = { idol:'event_type_idol.png', support:'event_type_support.png', produce:'event_type_produce.png', after:'event_type_true_end.png' }[eventType || 'produce'] || 'event_type_produce.png';
        const typeTex = this._getTexture(typeKey, 'uiParts');
        if (typeTex) {
            const ti = new PIXI.Sprite(typeTex);
            ti.anchor.set(0.5, 0.5);
            ti.position.set(274, 39);
            content.addChild(ti);
        }

        // eventName (115, 89)
        if (eventName) {
            const txt = new PIXI.Text(eventName, {
                fontFamily: USED_FONT || 'HummingStd-E-1',
                fontSize: 22, fill: 0x615365,
            });
            txt.anchor.set(0, 0.5);
            txt.position.set(115, 89);
            content.addChild(txt);
        }

        // ── Masked sweep layer (in content, at 0,0) ──
        this._sweepLayer = new PIXI.Container();
        content.addChild(this._sweepLayer);
        const sm = new PIXI.Graphics();
        sm.beginFill(0xffffff);
        sm.drawRoundedRect(0, 0, this._baseWidth, this._baseHeight - 5, 10);
        sm.endFill();
        this._sweepLayer.addChild(sm);
        this._sweepLayer.mask = sm;
    }

    get stageObj() { return this; }

    show() {
        const self = this;
        return new Promise(function (resolve) {
            // enza: t (outer) fades on "end"
            self.once('end', function () {
                if (typeof gsap !== 'undefined') {
                    gsap.to(self, { pixi: { alpha: 0 }, duration: 0.24,
                        onComplete: function () { resolve(); }
                    });
                } else { self.alpha = 0; setTimeout(resolve, 240); }
            });

            // enza: g (plate) slides in — from({x:-width}, 260)
            const W = self._baseWidth;
            self._plate.x = -W;

            if (typeof gsap !== 'undefined') {
                gsap.to(self._plate, { pixi: { x: 0 }, duration: 0.26, ease: 'power2.out',
                    onComplete: function () { self._playSweeps(); }
                });
                gsap.to(self._plate, { pixi: { x: 50 }, duration: 2.2, delay: 0.26, ease: 'none' });
                gsap.to(self._plate, { pixi: { x: 75 }, duration: 0.24, delay: 2.46, ease: 'power2.in',
                    onComplete: function () { self.emit('end'); }
                });
            } else {
                self._plate.x = 0;
                setTimeout(function () { self._playSweeps(); }, 260);
                setTimeout(function () { self.emit('end'); }, 2460);
            }

            self.emit('show');
        });
    }

    destroy() { this.removeAllListeners(); super.destroy({ children: true }); }

    // ── Sweeps ───────────────────────────────────────────────────────────
    _playSweeps() {
        const efTex = this._getTexture('plate_effect.png', 'uiParts');
        if (!efTex) return;
        const makeSweep = function (delay, onDone) {
            const s = new PIXI.Sprite(efTex);
            s.rotation = 45 * (Math.PI / 180); s.alpha = 0.5;
            s.position.set(0, -45);
            this._sweepLayer.addChild(s);
            if (typeof gsap !== 'undefined') {
                gsap.to(s, { pixi: { x: 550 }, duration: 0.36, delay: delay / 1000, ease: 'power2.inOut',
                    onComplete: function () { s.destroy(); if (onDone) onDone(); }
                });
            } else { setTimeout(function () { s.destroy(); if (onDone) onDone(); }, delay + 360); }
        };
        makeSweep.call(this, 120, null);
        makeSweep.call(this, 180, function () {
            if (this._sweepLayer && this._sweepLayer.mask) {
                this._sweepLayer.mask.destroy(); this._sweepLayer.mask = null;
            }
            // end sparkle
            const spTex = this._getTexture('sparkle2.png', 'uiParts');
            if (spTex) {
                const sp = new PIXI.Sprite(spTex);
                sp.anchor.set(0.5); sp.position.set(this._baseWidth, this._baseHeight - 6);
                this._plate.addChild(sp);
                if (typeof gsap !== 'undefined') {
                    gsap.to(sp, { pixi: { alpha: 0, scaleX: 2.4, scaleY: 2.4 }, duration: 0.4,
                        onComplete: function () { sp.destroy(); }
                    });
                } else { setTimeout(function () { sp.destroy(); }, 400); }
            }
        }.bind(this));
    }

    // ── Sparkle bg (module 18892) — static container, never moves ────────
    _addSparkles() {
        ['circle1.png','circle2.png','circle3.png'].forEach(function (name, i) {
            const tex = this._getTexture(name, 'uiParts');
            if (!tex) return;
            const sp = new PIXI.Sprite(tex);
            this._bgLayer.addChild(sp);
            // enza: to({scaleX:[.97,1.04,1.03][i], scaleY:same}, 3000) — single slow tween
            const s = [0.97, 1.04, 1.03][i];
            if (typeof gsap !== 'undefined') {
                gsap.to(sp, { pixi: { scaleX: s, scaleY: s }, duration: 3, ease: 'none' });
            }
        }, this);

        [{ n:'sparkle1.png', x:138, y:13,  s:1.4 },
         { n:'sparkle2.png', x:19,  y:136, s:0.8 },
         { n:'sparkle3.png', x:79,  y:128, s:1.2 }].forEach(function (c) {
            const tex = this._getTexture(c.n, 'uiParts');
            if (!tex) return;
            const sp = new PIXI.Sprite(tex);
            sp.anchor.set(0.5, 0.5);
            sp.position.set(c.x, c.y);
            this._bgLayer.addChild(sp);
            // enza: to({s:peak},480).to({s:1},480).loop() — pulse
            if (typeof gsap !== 'undefined') {
                gsap.to(sp.scale, { x: c.s, y: c.s, duration: 0.48, ease: 'none', yoyo: true, repeat: -1 });
            }
        }, this);
    }

    // ── Helpers ──────────────────────────────────────────────────────────
    _addCardIcon(plate, url) {
        const res = PIXI.Loader.shared.resources[url];
        if (!res || !res.texture) return;
        const icon = new PIXI.Sprite(res.texture);
        // enza: sprite at (9,8), native texture size, no forced width/height
        const iw = icon.texture.width, ih = icon.texture.height;
        icon.position.set(9, 8);
        const m = new PIXI.Graphics();
        m.beginFill(0xffffff);
        m.drawRoundedRect(9, 8, iw, ih, 8);
        m.endFill();
        icon.mask = m;
        plate.addChild(m); plate.addChild(icon);
    }

    _getTexture(name, atlasKey) {
        for (const k of [atlasKey, 'uiParts', 'uiCommonAtlas', 'uiCommonParts', 'uiInitPop']) {
            const a = PIXI.Loader.shared.resources[k];
            if (a && a.textures && a.textures[name]) return a.textures[name];
        }
        const g = PIXI.utils.TextureCache[name];
        if (!g) console.warn('[EventTitlePopup] texture missing:', name);
        return g || null;
    }
}
