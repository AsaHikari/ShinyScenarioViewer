// Screen-effect layer — mirrors original _effectLayer component.
// Uses GSAP v3 (`gsap.to` / `gsap.from`). control() returns a Promise that
// resolves when the tween finishes (so AdvPlayer's waitType:effect can wait).
class EffectLayer {
    constructor() {
        this._container = new PIXI.Container();
        this._effectMap = new Map();
    }

    get stageObj() { return this._container; }

    // effectValue shape: { type: 'to'|'from', alpha?, x?, y?, time, ease, ... }
    // Returns Promise resolving on tween complete.
    control(label, target, value, effectSpeed = 1) {
        if (!label || !value) return Promise.resolve();

        if (!this._effectMap.has(label)) {
            if (!target) return Promise.resolve();
            const effect = this._createTarget(target);
            if (!effect) return Promise.resolve();
            this._effectMap.set(label, effect);
        }

        const effect = this._effectMap.get(label);
        if (!this._container.children.includes(effect)) {
            this._container.addChild(effect);
        }

        return this._playEffect(effect, value, effectSpeed);
    }

    reset() {
        this._container.removeChildren();
        this._effectMap.clear();
    }

    _createTarget(target) {
        switch (target.type) {
            case 'rect': {
                const graphic = new PIXI.Graphics();
                graphic.beginFill(this._parseColor(target.color));
                graphic.drawRect(0, 0, target.width ?? 1136, target.height ?? 640);
                graphic.endFill();
                graphic.alpha = target.alpha ?? graphic.alpha;
                return graphic;
            }
            case 'circle': {
                const graphic = new PIXI.Graphics();
                graphic.beginFill(this._parseColor(target.color));
                graphic.drawCircle(0, 0, target.radius ?? 320);
                graphic.endFill();
                graphic.alpha = target.alpha ?? graphic.alpha;
                return graphic;
            }
            case 'image': {
                const key = target.image || target.key || target.url || target.path || target.name;
                const res = key && PIXI.Loader.shared.resources[key];
                const texture = res && res.texture ? res.texture : null;
                if (!texture) return null;
                const sprite = new PIXI.Sprite(texture);
                sprite.alpha = target.alpha ?? sprite.alpha;
                return sprite;
            }
            default:
                return null;
        }
    }

    _playEffect(effect, value, effectSpeed = 1) {
        const duration = ((value.time ?? 1000) / 1000) / (effectSpeed || 1);
        const tweener = (typeof gsap !== 'undefined') ? gsap
                      : (typeof TweenMax !== 'undefined') ? TweenMax
                      : null;
        if (!tweener) {
            console.warn('[EffectLayer] no tween library available');
            return Promise.resolve();
        }

        const useGsap = typeof gsap !== 'undefined' && tweener === gsap;
        const ease = this._resolveEase(value.easing ?? value.ease, useGsap);
        const tweenJobs = [];
        const props = this._buildTweenProps(effect, value, ease);
        if (Object.keys(props).length) tweenJobs.push({ target: effect, props });
        const scaleProps = this._buildScaleProps(effect, value, ease);
        if (Object.keys(scaleProps).length) tweenJobs.push({ target: effect.scale, props: scaleProps });
        if (!tweenJobs.length) return Promise.resolve();

        return new Promise(resolve => {
            tweenJobs[tweenJobs.length - 1].props.onComplete = () => resolve();
            tweenJobs.forEach(job => this._startTween(tweener, job.target, duration, job.props));
        });
    }

    _buildTweenProps(effect, value, ease) {
        const props = {};
        if (value.x !== undefined) props.x = effect.x + value.x;
        if (value.y !== undefined) props.y = effect.y + value.y;
        if (value.alpha !== undefined) props.alpha = value.alpha;

        if (value.type === 'from') {
            if (props.x !== undefined) [effect.x, props.x] = [props.x, effect.x];
            if (props.y !== undefined) [effect.y, props.y] = [props.y, effect.y];
            if (props.alpha !== undefined) [effect.alpha, props.alpha] = [props.alpha, effect.alpha];
        }

        if (Object.keys(props).length) props.ease = ease;
        return props;
    }

    _buildScaleProps(effect, value, ease) {
        if (value.scale === undefined) return {};
        const props = { x: value.scale, y: value.scale, ease };
        if (value.type === 'from') {
            [effect.scale.x, props.x] = [props.x, effect.scale.x];
            [effect.scale.y, props.y] = [props.y, effect.scale.y];
        }
        return props;
    }

    _startTween(tweener, target, duration, props) {
        if (typeof gsap !== 'undefined' && tweener === gsap) {
            return tweener.to(target, { ...props, duration });
        }
        return tweener.to(target, duration, props);
    }

    _parseColor(color) {
        return color != null ? parseInt(String(color), 16) : 0x000000;
    }

    // GSAP v3 takes ease as a string. TweenMax accepts the global Ease objects.
    _resolveEase(easing, useGsap = true) {
        if (!useGsap) {
            switch (easing) {
                case 'easeInOutQuad': return Power1.easeInOut;
                case 'easeInQuad':    return Power1.easeIn;
                case 'easeOutQuad':   return Power1.easeOut;
                case 'easeInOutCubic':return Power2.easeInOut;
                case 'easeInCubic':   return Power2.easeIn;
                case 'easeOutCubic':  return Power2.easeOut;
                case 'easeInOutSine': return typeof Sine !== 'undefined' ? Sine.easeInOut : Power1.easeInOut;
                case 'none':          return typeof Power0 !== 'undefined' ? Power0.easeNone : Power1.easeInOut;
                default:              return Power1.easeInOut;
            }
        }
        switch (easing) {
            case 'easeInOutQuad': return 'power1.inOut';
            case 'easeInQuad':    return 'power1.in';
            case 'easeOutQuad':   return 'power1.out';
            case 'easeInOutCubic':return 'power2.inOut';
            case 'easeInCubic':   return 'power2.in';
            case 'easeOutCubic':  return 'power2.out';
            case 'easeInOutSine': return 'sine.inOut';
            case 'none':          return 'none';
            default:              return 'power1.inOut';
        }
    }
}
