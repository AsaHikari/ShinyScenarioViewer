// Still-image layer — mirrors original stillLayer / charStill handling.
class StillLayer {
    constructor() {
        this._container  = new PIXI.Container();
        this._loader     = PIXI.Loader.shared;
        this._current    = null;
    }

    get stageObj() { return this._container; }

    // Switch to still image or clear.  ctrl controls the transition style.
    control(name, ctrl) {
        if (!name || name === 'off') {
            this._fadeOut();
            return;
        }
        const res = this._loader.resources[name];
        if (!res || !res.texture) { console.warn(`[StillLayer] missing: ${name}`); return; }

        const sprite  = new PIXI.Sprite(res.texture);
        sprite.width  = 1136;
        sprite.height = 640;
        sprite.alpha  = 0;
        this._container.addChild(sprite);

        const fadeDur = (ctrl === 'instant') ? 0 : 0.5;
        if (fadeDur === 0) {
            sprite.alpha = 1;
            this._replaceSprite(sprite);
        } else {
            TweenMax.to(sprite, fadeDur, {
                alpha: 1,
                ease: Power1.easeIn,
                onComplete: () => this._replaceSprite(sprite),
            });
        }
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

    _fadeOut() {
        if (!this._current) return;
        const old = this._current;
        this._current = null;
        TweenMax.to(old, 0.5, {
            alpha: 0,
            ease: Power1.easeOut,
            onComplete: () => {
                this._container.removeChild(old);
                old.destroy();
            },
        });
    }
}
