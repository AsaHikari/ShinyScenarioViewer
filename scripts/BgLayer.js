// Background layer — mirrors original _bgLayer component.
// control() returns a Promise that resolves when the animation finishes.
class BgLayer {
    constructor() {
        this._container = new PIXI.Container();
        this._loader    = PIXI.Loader.shared;
        this._bgMap     = new Map();
        this._speed     = 1;
        this._activeTweens = [];
        this._finishEffect = null;
    }

    get stageObj() { return this._container; }
    set speed(v)   { this._speed = v || 1; }

    // Main entry — called by AdvPlayer._playTrack. bgName is a full URL after
    // AdvResourceConverter, or one of the preserved keywords (e.g. 'fade_out').
    control(bgName, effect, effectTime, effectSpeed) {
        if (!bgName) return Promise.resolve();
        this.endEffect();
        const spd = effectSpeed || this._speed || 1;
        const t = (effectTime || 1000) / spd;

        if (bgName === 'fade_out') {
            return this._fadeAllOut(t);
        }
        if (effect === 'fade') {
            return this._fadeTo(bgName, t);
        }
        // Instant switch
        this._insertBg(bgName, true);
        return Promise.resolve();
    }

    reset() {
        this.endEffect();
        this._container.removeChildren();
        this._bgMap.clear();
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
        if (!this._bgMap.has(url)) {
            const res = this._loader.resources[url];
            if (!res || !res.texture) { console.warn('[BgLayer] missing:', url); return null; }
            this._bgMap.set(url, new PIXI.Sprite(res.texture));
        }
        return this._bgMap.get(url);
    }

    _insertBg(name, clearOld = false) {
        const sprite = this._getOrCreate(name);
        if (!sprite) return;
        if (clearOld) this._container.removeChildren();
        sprite.alpha = 1;
        this._container.addChild(sprite);
    }

    _fadeTo(newName, effectTime) {
        const duration = (effectTime || 1000) / 1000;

        // Keep only the current bg as the base
        while (this._container.children.length > 1) this._container.removeChildAt(0);
        if (this._container.children[0]) this._container.children[0].alpha = 1;

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
                while (this._container.children.length > 1) this._container.removeChildAt(0);
                newSprite.alpha = 1;
                resolve();
            };
            this._finishEffect = finish;
            this._activeTweens.push(TweenMax.to(newSprite, duration, {
                alpha: 1,
                ease: Power0.easeNone,
                onComplete: finish,
            }));
        });
    }

    _fadeAllOut(effectTime) {
        const duration = (effectTime || 1000) / 1000;
        return new Promise(resolve => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                this._finishEffect = null;
                this._activeTweens.length = 0;
                this._container.removeChildren();
                resolve();
            };
            this._finishEffect = finish;
            const children = [...this._container.children];
            if (children.length === 0) return finish();
            let left = children.length;
            children.forEach(child => {
                this._activeTweens.push(TweenMax.to(child, duration, {
                    alpha: 0,
                    onComplete: () => { if (--left === 0) finish(); },
                }));
            });
        });
    }
}
