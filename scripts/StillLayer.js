// Still-image layer — mirrors original stillLayer / charStill handling.
class StillLayer {
    constructor() {
        this._container  = new PIXI.Container();
        this._loader     = PIXI.Loader.shared;
        this._current    = null;
    }

    get stageObj() { return this._container; }

    // Switch to still image or apply still-layer command.
    control(name, opts = {}) {
        if (name === 'on') {
            if (this._current) this._current.visible = true;
            return;
        }
        if (!name || name === 'off') {
            this._fadeOut();
            return;
        }
        if (name === 'fade_out') {
            this._fadeOut();
            return;
        }
        if (/^\d+$/.test(String(name))) {
            this._fadeOut(Number(name));
            return;
        }
        const res = this._loader.resources[name];
        if (!res || !res.texture) { console.warn(`[StillLayer] missing: ${name}`); return; }

        const sprite  = new PIXI.Sprite(res.texture);
        sprite.width  = 1136;
        sprite.height = 640;
        sprite.alpha  = opts.instant ? 1 : 0;
        this._container.addChild(sprite);

        if (opts.instant) {
            this._replaceSprite(sprite);
            return;
        }

        TweenMax.to(sprite, 0.5, {
            alpha: 1,
            ease: Power1.easeIn,
            onComplete: () => this._replaceSprite(sprite),
        });
    }

    // controlState handles textFrame visibility on top of still
    controlState(state) { /* reserved for future use */ }

    reset() {
        this._container.removeChildren();
        this._current = null;
    }

    _replaceSprite(next) {
        if (this._current && this._current !== next) {
            this._container.removeChild(this._current);
            this._current.destroy();
        }
        this._current = next;
    }

    _fadeOut(durationMs = 500) {
        if (!this._current) return;
        const old = this._current;
        this._current = null;
        TweenMax.to(old, (durationMs || 500) / 1000, {
            alpha: 0,
            ease: Power1.easeOut,
            onComplete: () => {
                this._container.removeChild(old);
                old.destroy();
            },
        });
    }
}
