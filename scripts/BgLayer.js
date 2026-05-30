// Generic enza-style image change layer.
// Enza uses one persistent main sprite and one temporary buffer sprite.
class EnzaChangeLayer {
    constructor(label = 'EnzaChangeLayer') {
        this._label = label;
        this._container = new PIXI.Container();
        this._loader = PIXI.Loader.shared;
        this._main = new PIXI.Sprite(PIXI.Texture.EMPTY);
        this._buffer = new PIXI.Sprite(PIXI.Texture.EMPTY);
        this._speed = 1;
        this._activeTweens = [];
        this._finishEffect = null;
        this._container.addChild(this._main);
    }

    get stageObj() { return this._container; }
    set speed(v) { this._speed = v || 1; }

    control(imageName, effect, effectTime, effectSpeed) {
        if (!imageName) return Promise.resolve();
        this.endEffect();
        if (effectSpeed) this._speed = effectSpeed;

        let texture = PIXI.Texture.EMPTY;
        let effectKey = effect || 'normal';

        if (imageName === 'on') {
            this._container.visible = true;
            return Promise.resolve();
        }
        if (imageName === 'off') {
            this._container.visible = false;
            this._main.texture = PIXI.Texture.EMPTY;
            return Promise.resolve();
        }
        if (imageName === 'fade_out') {
            effectKey = 'fade_out';
        } else {
            texture = this._getTexture(imageName);
            if (!texture) return Promise.resolve();
            this._container.visible = true;
        }

        const duration = effectTime === undefined ? this._defaultEffectTime(effectKey) : effectTime;
        return this._runEffect(effectKey, texture, duration).then(() => {
            this._activeTweens.length = 0;
            this._finishEffect = null;
        });
    }

    reset() {
        this.endEffect();
        this._main.texture = PIXI.Texture.EMPTY;
        this._main.alpha = 1;
        this._main.filters = null;
        this._buffer.texture = PIXI.Texture.EMPTY;
        this._buffer.alpha = 1;
        this._buffer.filters = null;
        this._buffer.removeChildren && this._buffer.removeChildren();
        if (this._buffer.parent) this._buffer.parent.removeChild(this._buffer);
        this._container.visible = true;
    }

    endEffect() {
        if (!this._finishEffect) return;
        const finish = this._finishEffect;
        this._finishEffect = null;
        this._activeTweens.forEach(t => t && typeof t.kill === 'function' && t.kill());
        this._activeTweens.length = 0;
        finish();
    }

    _defaultEffectTime(effect) {
        return {
            normal: 1600,
            fade: 1600,
            switch_fade: 1600,
            fade_out: 1600,
            mask: 1600,
            white_add: 1600,
            white_fade: 2400,
            blur: 1600,
        }[effect] || 1600;
    }

    _duration(ms) {
        return (ms || 0) / 1000 / (this._speed || 1);
    }

    _getTexture(url) {
        const res = this._loader.resources[url];
        if (!res || !res.texture) {
            console.warn(`[${this._label}] missing:`, url);
            return null;
        }
        return res.texture;
    }

    _trackTween(tween) {
        this._activeTweens.push(tween);
        return tween;
    }

    _runEffect(effect, texture, effectTime) {
        switch (effect) {
            case 'fade': return this._fade(texture, effectTime);
            case 'switch_fade': return this._switchFade(texture, effectTime);
            case 'fade_out': return this._fadeOut(effectTime);
            case 'mask': return this._mask(texture, effectTime);
            case 'white_add': return this._whiteAdd(texture, effectTime);
            case 'white_fade': return this._whiteFade(texture, effectTime);
            case 'blur': return this._blur(texture, effectTime);
            case 'normal':
            default:
                this._main.texture = texture;
                this._main.alpha = 1;
                this._container.visible = true;
                return Promise.resolve();
        }
    }

    _fade(texture, effectTime) {
        this._buffer.texture = texture;
        this._buffer.alpha = 0;
        this._addBuffer();
        return new Promise(resolve => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                this._main.texture = this._buffer.texture;
                this._main.alpha = 1;
                this._removeBuffer();
                resolve();
            };
            this._finishEffect = finish;
            this._trackTween(TweenMax.to(this._buffer, this._duration(effectTime), {
                alpha: 1,
                ease: Power0.easeNone,
                onComplete: finish,
            }));
        });
    }

    _switchFade(texture, effectTime) {
        this._buffer.texture = texture;
        this._buffer.alpha = 0;
        this._addBuffer();
        const duration = this._duration(effectTime);
        return new Promise(resolve => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                this._main.texture = this._buffer.texture;
                this._main.alpha = 1;
                this._removeBuffer();
                resolve();
            };
            this._finishEffect = finish;
            this._trackTween(TweenMax.to(this._buffer, duration, { alpha: 1, ease: Power0.easeNone }));
            this._trackTween(TweenMax.to(this._main, duration, {
                alpha: 0,
                ease: Power0.easeNone,
                onComplete: finish,
            }));
        });
    }

    _fadeOut(effectTime) {
        this._main.alpha = 1;
        return new Promise(resolve => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                this._container.visible = false;
                this._main.alpha = 1;
                this._main.texture = PIXI.Texture.EMPTY;
                resolve();
            };
            this._finishEffect = finish;
            this._trackTween(TweenMax.to(this._main, this._duration(effectTime), {
                alpha: 0,
                ease: Power0.easeNone,
                onComplete: finish,
            }));
        });
    }

    _mask(texture, effectTime) {
        this._buffer.texture = texture;
        this._buffer.alpha = 1;
        this._addBuffer();
        const mask = new PIXI.Graphics();
        mask.beginFill(0).drawRect(0, 0, texture.width, texture.height).endFill();
        mask.x = -texture.width;
        this._container.addChild(mask);
        this._buffer.mask = mask;

        return new Promise(resolve => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                this._main.texture = this._buffer.texture;
                this._buffer.mask = null;
                this._removeBuffer();
                if (mask.parent) mask.parent.removeChild(mask);
                mask.destroy();
                resolve();
            };
            this._finishEffect = finish;
            this._trackTween(TweenMax.to(mask, this._duration(effectTime), {
                x: 0,
                ease: Power0.easeNone,
                onComplete: finish,
            }));
        });
    }

    _whiteAdd(texture, effectTime) {
        const flash = this._createWhiteSprite();
        flash.alpha = 0;
        flash.blendMode = PIXI.BLEND_MODES.ADD;
        this._container.addChild(flash);
        const duration = this._duration(effectTime);

        return new Promise(resolve => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                if (flash.parent) flash.parent.removeChild(flash);
                flash.destroy({ children: true, texture: true, baseTexture: true });
                resolve();
            };
            this._finishEffect = finish;
            this._trackTween(TweenMax.to(flash, duration, {
                alpha: 1,
                ease: Power0.easeNone,
                onComplete: () => {
                    this._main.texture = texture;
                    this._trackTween(TweenMax.to(flash, duration, {
                        alpha: 0,
                        ease: Power0.easeNone,
                        onComplete: finish,
                    }));
                },
            }));
        });
    }

    _whiteFade(texture, effectTime) {
        const width = 1136;
        const height = 640;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height * 2;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createLinearGradient(0, height * 2, 0, 0);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        grad.addColorStop(0.2, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(0.8, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height * 2);
        const tex = PIXI.Texture.from(canvas);
        const wipe = new PIXI.Sprite(tex);
        wipe.y = height;
        this._container.addChild(wipe);

        return new Promise(resolve => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                if (wipe.parent) wipe.parent.removeChild(wipe);
                wipe.destroy({ children: true, texture: true, baseTexture: true });
                resolve();
            };
            this._finishEffect = finish;
            this._trackTween(TweenMax.to(wipe, this._duration(0.45 * effectTime), {
                y: -height / 2,
                ease: Sine.easeInOut,
                onComplete: () => {
                    this._main.texture = texture;
                    this._trackTween(TweenMax.delayedCall(0.1 * effectTime / 1000, () => {
                        this._trackTween(TweenMax.to(wipe, this._duration(0.45 * effectTime), {
                            y: -2 * height,
                            ease: Sine.easeInOut,
                            onComplete: finish,
                        }));
                    }));
                },
            }));
        });
    }

    _blur(texture, effectTime) {
        if (!PIXI.filters || !PIXI.filters.BlurFilter) return this._fade(texture, effectTime);
        this._buffer.texture = texture;
        this._buffer.alpha = 0;
        this._addBuffer();
        const white = new PIXI.Graphics();
        white.beginFill(0xffffff).drawRect(0, 0, 1136, 640).endFill();
        this._container.addChildAt(white, 0);
        const blur = new PIXI.filters.BlurFilter();
        blur.blur = 0;
        this._main.filters = [blur];
        this._buffer.filters = [blur];
        const duration = this._duration(effectTime);

        return new Promise(resolve => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                if (white.parent) white.parent.removeChild(white);
                white.destroy();
                this._main.filters = null;
                this._buffer.filters = null;
                this._main.texture = this._buffer.texture;
                this._main.alpha = 1;
                this._removeBuffer();
                resolve();
            };
            this._finishEffect = finish;
            this._trackTween(TweenMax.to(this._buffer, duration, { alpha: 1, ease: Power0.easeNone }));
            this._trackTween(TweenMax.to(blur, duration / 2, {
                blur: 24,
                ease: Power0.easeNone,
                onComplete: () => {
                    this._trackTween(TweenMax.to(blur, duration / 2, {
                        blur: 0,
                        ease: Power0.easeNone,
                        onComplete: finish,
                    }));
                },
            }));
        });
    }

    _addBuffer() {
        if (!this._buffer.parent) this._container.addChild(this._buffer);
    }

    _removeBuffer() {
        if (this._buffer.parent) this._buffer.parent.removeChild(this._buffer);
        this._buffer.alpha = 1;
        this._buffer.filters = null;
        this._buffer.mask = null;
    }

    _createWhiteSprite() {
        const g = new PIXI.Graphics();
        g.beginFill(0xffffff).drawRect(0, 0, 1136, 640).endFill();
        return g;
    }
}

// Background layer — mirrors enza's image change layer used for _bgLayer.
class BgLayer extends EnzaChangeLayer {
    constructor() {
        super('BgLayer');
    }
}
