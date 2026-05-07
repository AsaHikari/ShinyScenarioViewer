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
            const color = target.color != null
                ? parseInt(String(target.color), 16)
                : 0x000000;
            const graphic = new PIXI.Graphics();
            graphic.beginFill(color);
            switch (target.type) {
                case 'rect':
                    graphic.drawRect(0, 0, target.width ?? 1136, target.height ?? 640);
                    break;
                case 'circle':
                    graphic.drawCircle(target.x ?? 568, target.y ?? 320, target.radius ?? 320);
                    break;
                default:
                    graphic.endFill();
                    return Promise.resolve();
            }
            graphic.endFill();
            this._effectMap.set(label, graphic);
        }

        const effect = this._effectMap.get(label);
        if (!this._container.children.includes(effect)) {
            this._container.addChild(effect);
        }

        const duration = ((value.time ?? 1000) / 1000) / (effectSpeed || 1);
        const ease     = this._resolveEase(value.ease);

        // Clean tween props (strip our control fields)
        const props = { ...value, ease, duration };
        delete props.type;
        delete props.time;

        return new Promise(resolve => {
            props.onComplete = () => resolve();
            const tweener = (typeof gsap !== 'undefined') ? gsap
                          : (typeof TweenMax !== 'undefined') ? TweenMax
                          : null;
            if (!tweener) {
                console.warn('[EffectLayer] no tween library available');
                resolve();
                return;
            }
            if (value.type === 'from') tweener.from(effect, props);
            else                       tweener.to  (effect, props);
        });
    }

    reset() {
        this._container.removeChildren();
        this._effectMap.clear();
    }

    // GSAP v3 takes ease as a string. Map legacy names → v3 strings.
    _resolveEase(easing) {
        switch (easing) {
            case 'easeInOutQuad': return 'power1.inOut';
            case 'easeInQuad':    return 'power1.in';
            case 'easeOutQuad':   return 'power1.out';
            case 'easeInOutCubic':return 'power2.inOut';
            case 'easeInCubic':   return 'power2.in';
            case 'easeOutCubic':  return 'power2.out';
            case 'none':          return 'none';
            default:              return 'power1.inOut';
        }
    }
}
