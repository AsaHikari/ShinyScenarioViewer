class TapEffectLayer {
    constructor() {
        this._container = new PIXI.Container();
        this._loader = PIXI.Loader.shared;
        this._emitters = [];
    }

    get stageObj() { return this._container; }

    play(x, y) {
        const textures = this._getTextures();
        if (!textures) return;
        this._playEffect(textures['tap_effect_particle.png'], this._getConfig(TAP_EFFECT_PARTICLE_CONFIG_KEY), x, y);
        this._playEffect(textures['tap_effect_feather.png'], this._getConfig(TAP_EFFECT_FEATHER_CONFIG_KEY), x, y);
    }

    update(delta) {
        if (!this._emitters.length) return;
        const dt = delta / 60;
        this._emitters = this._emitters.filter(emitter => emitter.update(dt));
    }

    _getTextures() {
        const res = this._loader.resources[TAP_EFFECT_PARTICLES_KEY];
        return res && res.spritesheet ? res.spritesheet.textures : null;
    }

    _getConfig(key) {
        const res = this._loader.resources[key];
        return res && res.data ? res.data : null;
    }

    _playEffect(texture, config, x, y) {
        if (!texture || !config) return;
        const emitter = new TapEffectEmitter(this._container, texture, config, x, y);
        this._emitters.push(emitter);
        emitter.play();
    }
}

class TapEffectEmitter {
    constructor(parent, texture, config, x, y) {
        this._parent = parent;
        this._texture = texture;
        this._config = config;
        this._x = x;
        this._y = y;
        this._particles = [];
        this._elapsed = 0;
        this._emitElapsed = 0;
        this._destroyed = false;
        this._emitDuration = Math.max(0, config.emitterLifetime || 0);
        this._frequency = Math.max(0.001, config.frequency || 0.001);
    }

    play() {
        if (this._config.spawnType === 'burst') {
            this._spawn(this._config.particlesPerWave || this._config.maxParticles || 1);
            this._emitElapsed = this._emitDuration;
        } else {
            this._spawn(1);
        }
    }

    update(dt) {
        if (this._destroyed) return false;
        this._elapsed += dt;
        this._emitElapsed += dt;

        if (this._config.spawnType !== 'burst') {
            while (this._elapsed < this._emitDuration && this._emitElapsed >= this._frequency) {
                this._emitElapsed -= this._frequency;
                this._spawn(1);
            }
        }

        this._particles = this._particles.filter(p => this._updateParticle(p, dt));
        if (this._elapsed >= this._emitDuration && !this._particles.length) {
            this._destroyed = true;
            return false;
        }
        return true;
    }

    _spawn(count) {
        const max = this._config.maxParticles || count;
        for (let i = 0; i < count && this._particles.length < max; i += 1) {
            const p = this._createParticle(i, count);
            this._particles.push(p);
            this._parent.addChild(p.sprite);
        }
    }

    _createParticle(index, count) {
        const cfg = this._config;
        const sprite = new PIXI.Sprite(this._texture);
        const spawn = this._spawnPosition();
        const angle = this._spawnAngle(index, count, spawn);
        const speedMultiplier = this._multiplier(cfg.speed && cfg.speed.minimumSpeedMultiplier);
        const scaleMultiplier = this._multiplier(cfg.scale && cfg.scale.minimumScaleMultiplier);
        const speedStart = (cfg.speed ? cfg.speed.start || 0 : 0) * speedMultiplier;
        const speedEnd = (cfg.speed ? cfg.speed.end || 0 : 0) * speedMultiplier;
        const scaleStart = (cfg.scale ? cfg.scale.start || 0 : 1) * scaleMultiplier;
        const scaleEnd = (cfg.scale ? cfg.scale.end || scaleStart : scaleStart) * scaleMultiplier;
        const life = this._life();

        sprite.anchor.set(0.5);
        sprite.position.set(this._x + spawn.x, this._y + spawn.y);
        sprite.alpha = cfg.alpha ? cfg.alpha.start : 1;
        sprite.scale.set(scaleStart);
        sprite.rotation = angle;
        sprite.tint = this._hex(cfg.color && cfg.color.start, 0xffffff);
        sprite.blendMode = this._blend(cfg.blendMode);

        return {
            sprite,
            age: 0,
            life,
            vx: Math.cos(angle) * speedStart,
            vy: Math.sin(angle) * speedStart,
            speedStart,
            speedEnd,
            scaleStart,
            scaleEnd,
            alphaStart: cfg.alpha ? cfg.alpha.start : 1,
            alphaEnd: cfg.alpha ? cfg.alpha.end : 0,
            colorStart: this._hex(cfg.color && cfg.color.start, 0xffffff),
            colorEnd: this._hex(cfg.color && cfg.color.end, 0xffffff),
            rotationSpeed: this._random(cfg.rotationSpeed && cfg.rotationSpeed.min, cfg.rotationSpeed && cfg.rotationSpeed.max) * Math.PI / 180,
            noRotation: !!cfg.noRotation,
        };
    }

    _updateParticle(p, dt) {
        p.age += dt;
        const t = Math.min(1, p.age / p.life);
        const speed = this._lerp(p.speedStart, p.speedEnd, t);
        const currentSpeed = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
        p.vx = p.vx / currentSpeed * speed;
        p.vy = p.vy / currentSpeed * speed;
        p.sprite.x += p.vx * dt;
        p.sprite.y += p.vy * dt;
        p.sprite.alpha = this._lerp(p.alphaStart, p.alphaEnd, t);
        const scale = this._lerp(p.scaleStart, p.scaleEnd, t);
        p.sprite.scale.set(scale);
        p.sprite.tint = this._mixColor(p.colorStart, p.colorEnd, t);
        if (!p.noRotation) p.sprite.rotation += p.rotationSpeed * dt;

        if (p.age < p.life) return true;
        if (p.sprite.parent) p.sprite.parent.removeChild(p.sprite);
        p.sprite.destroy();
        return false;
    }

    _spawnPosition() {
        if (this._config.spawnType !== 'ring') return { x: 0, y: 0, rotation: 0 };
        const circle = this._config.spawnCircle || {};
        const minR = circle.minR || 0;
        const maxR = circle.r || minR;
        const rotation = Math.random() * Math.PI * 2;
        const r = minR === maxR ? minR + Math.random() * (maxR - minR) : maxR;
        return {
            x: (circle.x || 0) + Math.cos(rotation) * r,
            y: (circle.y || 0) + Math.sin(rotation) * r,
            rotation,
        };
    }

    _spawnAngle(index, count, spawn) {
        const rot = this._config.startRotation || {};
        if (this._config.spawnType === 'burst') {
            if (this._config.particleSpacing === 0) return Math.random() * Math.PI * 2;
            return ((this._config.angleStart || 0) + (this._config.particleSpacing || 0) * index) * Math.PI / 180;
        }
        return this._random(rot.min || 0, rot.max || 0) * Math.PI / 180 + ((spawn && spawn.rotation) || 0);
    }

    _life() {
        const cfg = this._config.lifetime || {};
        const min = Math.min(cfg.min || 0.1, cfg.max || cfg.min || 0.1);
        const max = Math.max(cfg.min || 0.1, cfg.max || cfg.min || 0.1);
        return this._random(min, max);
    }

    _multiplier(minimum) {
        if (minimum === undefined || minimum === 1) return 1;
        return minimum + Math.random() * (1 - minimum);
    }

    _random(min, max) {
        if (min === undefined) min = 0;
        if (max === undefined) max = min;
        return min + Math.random() * (max - min);
    }

    _lerp(a, b, t) { return a + (b - a) * t; }

    _hex(value, fallback) {
        if (!value) return fallback;
        if (typeof value === 'number') return value;
        return parseInt(String(value).replace('#', ''), 16);
    }

    _mixColor(a, b, t) {
        const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
        const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
        return ((this._lerp(ar, br, t) & 255) << 16)
            | ((this._lerp(ag, bg, t) & 255) << 8)
            | (this._lerp(ab, bb, t) & 255);
    }

    _blend(mode) {
        if (mode === 'add') return PIXI.BLEND_MODES.ADD;
        if (mode === 'screen') return PIXI.BLEND_MODES.SCREEN;
        return PIXI.BLEND_MODES.NORMAL;
    }
}
