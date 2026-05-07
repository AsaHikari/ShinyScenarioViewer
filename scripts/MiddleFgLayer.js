// Middle foreground layer — sits between the background and character sprites.
// This layer is absent from EventViewer but present in the original game engine.
// control() returns a Promise that resolves when the animation finishes.
class MiddleFgLayer {
    constructor() {
        this._container = new PIXI.Container();
        this._loader    = PIXI.Loader.shared;
        this._fgMap     = new Map();
        this._current   = null;
        this._activeTweens = [];
        this._finishEffect = null;
    }

    get stageObj() { return this._container; }

    control(fgName, effect, effectTime, effectSpeed) {
        if (!fgName) return Promise.resolve();
        this.endEffect();
        effectTime = (effectTime || 1000) / (effectSpeed || 1);

        if (fgName === 'off') {
            this._container.removeChildren();
            this._current = null;
            return Promise.resolve();
        }
        if (fgName === 'fade_out') {
            return this._fadeOut(effectTime);
        }
        if (effect === 'fade') {
            return this._fadeTo(fgName, effectTime);
        }
        this._set(fgName);
        return Promise.resolve();
    }

    reset() {
        this.endEffect();
        this._container.removeChildren();
        this._fgMap.clear();
        this._current = null;
    }

    endEffect() {
        if (!this._finishEffect) return;
        const finish = this._finishEffect;
        this._finishEffect = null;
        this._activeTweens.forEach(t => t && typeof t.kill === 'function' && t.kill());
        this._activeTweens.length = 0;
        finish();
    }

    // ─── Private helpers ───────────────────────────────────────────────────

    _getOrCreate(url) {
        if (!this._fgMap.has(url)) {
            const res = this._loader.resources[url];
            if (!res || !res.texture) { console.warn('[MiddleFgLayer] missing:', url); return null; }
            this._fgMap.set(url, new PIXI.Sprite(res.texture));
        }
        return this._fgMap.get(url);
    }

    _set(name) {
        const sprite = this._getOrCreate(name);
        if (!sprite) return;
        this._container.removeChildren();
        sprite.alpha = 1;
        this._container.addChild(sprite);
        this._current = sprite;
    }

    _fadeTo(newName, effectTime) {
        const duration = (effectTime || 1000) / 1000;
        const newSprite = this._getOrCreate(newName);
        if (!newSprite) return Promise.resolve();
        newSprite.alpha = 0;
        this._container.addChild(newSprite);

        return new Promise(resolve => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                this._finishEffect = null;
                this._activeTweens.length = 0;
                this._container.removeChildren();
                newSprite.alpha = 1;
                this._container.addChild(newSprite);
                this._current = newSprite;
                resolve();
            };
            this._finishEffect = finish;
            if (this._current && this._current !== newSprite) {
                this._activeTweens.push(TweenMax.to(this._current, duration, { alpha: 0 }));
            }
            this._activeTweens.push(TweenMax.to(newSprite, duration, {
                alpha: 1,
                ease: Power0.easeNone,
                onComplete: finish,
            }));
        });
    }

    _fadeOut(effectTime) {
        if (!this._current) return Promise.resolve();
        const duration = (effectTime || 1000) / 1000;
        return new Promise(resolve => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                this._finishEffect = null;
                this._activeTweens.length = 0;
                this._container.removeChildren();
                this._current = null;
                resolve();
            };
            this._finishEffect = finish;
            this._activeTweens.push(TweenMax.to(this._current, duration, {
                alpha: 0,
                onComplete: finish,
            }));
        });
    }
}
