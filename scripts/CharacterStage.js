// Manages Spine character sprites on stage.
// control() returns a Promise (resolves immediately unless there is a charEffect tween).
// Mirrors the original _characterStage component logic.
class CharacterStage {
    constructor(app = null) {
        this._app        = app;
        this._container  = new PIXI.Container();
        this._loader     = PIXI.Loader.shared;
        this._spineMap   = new Map();   // uid → PIXI.spine.Spine
        this._layerMap   = new Map();   // uid → character wrapper container
        this._currSpine  = {};          // label → { currCharId, currCharCategory }
        this._instanceSeq = 0;
        this._activeEffects = new Set();
        this._lipAnim = null;

        this.LOOP_EVENT_NAME  = 'loop_start';
        this.RELAY_EVENT_NAME = 'relay';
        this.LIP_EVENT_NAME   = 'lip';

        this.ANIMATION_MIX    = 0.3;
    }

    get stageObj() { return this._container; }

    // ─── Public API ────────────────────────────────────────────────────────

    /**
     * @param {object} p - destructured from a track object
     *   asset, label, position, scale,
     *   anim1–anim5, anim1Loop–anim5Loop,
     *   lipAnim, lipAnimDuration, lipMarks, keepsLipAnimation, voiceObj,
     *   effect, effectSpeed
     * @returns {Promise}
     */
    control(p) {
        const {
            asset, label, position, scale,
            anim1, anim2, anim3, anim4, anim5,
            anim1Loop, anim2Loop, anim3Loop, anim4Loop, anim5Loop,
            lipAnim, lipAnimDuration, lipMarks, voiceObj, effect, effectSpeed = 1,
        } = p;

        if (!label) return Promise.resolve();

        if (asset) {
            this._currSpine[label] = {
                uid: `${label}:${asset}:${++this._instanceSeq}`,
                asset,
            };
        }

        const uid = this._getUid(label);
        if (!uid) return Promise.resolve();
        const assetUid = this._currSpine[label]?.asset || uid;

        const spine = this._getOrCreateSpine(uid, assetUid);
        if (!spine) return Promise.resolve();
        const layer = this._getCharacterLayer(uid);
        if (!layer) return Promise.resolve();

        // Bring onto stage
        this._container.addChild(layer);

        // Position & scale live on the character wrapper, matching enza's _spineLayer.
        if (position) {
            layer.position.set(position.x, position.y);
            const targetIdx = Math.min(position.order ?? 0, this._container.children.length - 1);
            this._container.setChildIndex(layer, targetIdx);
        }
        if (scale) layer.scale.set(scale);

        // Animations (tracks 0–4)
        if (anim1) this._setAnim(anim1, anim1Loop ?? true, 0, spine);
        if (anim2) this._setOverlayAnim(anim2, anim2Loop ?? true, 1, spine);
        if (anim3) this._setOverlayAnim(anim3, anim3Loop ?? true, 2, spine);
        if (anim4) this._setOverlayAnim(anim4, anim4Loop ?? true, 3, spine);
        if (anim5) this._setOverlayAnim(anim5, anim5Loop ?? true, 4, spine);

        // Lip animation (track 5) is stopped by the voice instance's own end
        // event. Duration metadata can be shorter than actual playback on some
        // decoded files, so don't use it as a fallback while a voice object exists.
        if (lipAnim) {
            this._setOverlayAnim(lipAnim, true, 5, spine);
            const stop = () => this.stopLipAnimation(label);
            if (voiceObj && typeof voiceObj.once === 'function') {
                let stopped = false;
                const safeStop = () => { if (stopped) return; stopped = true; stop(); };
                voiceObj.once('end', safeStop);
                voiceObj.once('ended', safeStop);
            } else if (lipAnimDuration) {
                // No voice object available (e.g. lipAnimDuration explicitly given) —
                // fall back to a buffered timer (+200ms slack to avoid early close).
                setTimeout(() => this.stopLipAnimation(label), lipAnimDuration * 1000 + 200);
            }
        }

        spine.update(0);
        spine.autoUpdate = true;

        // charEffect tween — returns Promise if there is one
        if (effect) {
            return this._applyEffect(layer, effect, effectSpeed);
        }
        return Promise.resolve();
    }

    // Stop the lip animation track (track 5) for a specific character label
    stopLipAnimation(label) {
        const uid = this._getUid(label);
        if (!uid) return;
        const spine = this._spineMap.get(uid);
        if (!spine || !spine.state.tracks[5]) return;
        const track = spine.state.tracks[5];
        track.time = 0;
        track.timeScale = 0;
    }

    // Stop lip animations for all characters currently on stage
    stopLipAnimations() {
        this._spineMap.forEach(spine => {
            const track = spine.state?.tracks?.[5];
            if (track) { track.time = 0; track.timeScale = 0; }
        });
    }

    // Called when the user taps to advance (before next track plays)
    onEndTrack() {
        this.stopLipAnimations();
    }

    endEffects() {
        Array.from(this._activeEffects).forEach(record => {
            record.tweens.forEach(tween => {
                try {
                    if (tween && typeof tween.progress === 'function') tween.progress(1);
                    else if (tween && typeof tween.seek === 'function') tween.seek(tween.duration());
                } catch (_) {}
            });
            record.finish();
        });
    }

    reset() {
        this._container.removeChildren();
        this._spineMap.clear();
        this._layerMap.clear();
        this._currSpine = {};
        this._instanceSeq = 0;
        this._activeEffects.clear();
    }

    // ─── Private helpers ───────────────────────────────────────────────────

    _getUid(label) {
        return this._currSpine[label]?.uid ?? null;
    }

    _getOrCreateSpine(uid, assetUid = uid) {
        if (!this._spineMap.has(uid)) {
            const res = this._loader.resources[assetUid];
            if (!res || !res.spineData) {
                console.warn(`[CharacterStage] spine resource not found: ${assetUid}`);
                return null;
            }
            const spine = new PIXI.spine.Spine(res.spineData);
            const layer = new PIXI.Container();
            layer.addChild(spine);
            try { spine.skeleton.setSkinByName('normal'); }
            catch { spine.skeleton.setSkinByName('default'); }
            this._spineMap.set(uid, spine);
            this._layerMap.set(uid, layer);
        }
        return this._spineMap.get(uid);
    }

    _getCharacterLayer(uid) {
        return this._layerMap.get(uid) ?? null;
    }

    _setOverlayAnim(animName, loop, trackNo, spine) {
        const trackEntry = this._setAnim(animName, loop, trackNo, spine);
        if (trackEntry) trackEntry.alpha = 0.99;
        return trackEntry;
    }

    _setAnim(animName, loop, trackNo, spine) {
        if (!animName) return null;

        const animation = spine.spineData.animations.find(a => a.name === animName);
        if (!animation) {
            console.warn(`[CharacterStage] animation "${animName}" not found`);
            return null;
        }

        // Detect loop_start event for partial looping
        let loopStartTime = null;
        const eventTimeline = animation.timelines.find(tl => tl.events);
        if (eventTimeline) {
            eventTimeline.events.forEach(ev => {
                if (ev.data.name === this.LOOP_EVENT_NAME) loopStartTime = ev.time;
                if (ev.data.name === this.LIP_EVENT_NAME) this._lipAnim = ev.stringValue;
            });
        }
        if (loopStartTime) loop = false;

        // Detect relay anim from current animation
        let relayAnim = null;
        const before = spine.state.getCurrent(trackNo);
        const beforeAnim = before?.animation?.name ?? null;
        const beforeTime = before?.trackTime ?? 0;
        const beforeAnimation = beforeAnim
            ? spine.spineData.animations.find(a => a.name === beforeAnim)
            : null;

        if (beforeAnimation) {
            const beforeEventTl = beforeAnimation?.timelines?.find(tl => tl.events);
            if (beforeEventTl) {
                const relayEv = beforeEventTl.events.find(ev => ev.data.name === this.RELAY_EVENT_NAME);
                if (relayEv) relayAnim = relayEv.stringValue;
            }
        }

        const hasRelay = relayAnim && spine.spineData.animations.find(a => a.name === relayAnim);
        let trackEntry = null;
        if (hasRelay) {
            if (beforeAnimation) spine.stateData.setMix(beforeAnim, relayAnim, this.ANIMATION_MIX);
            spine.stateData.setMix(relayAnim, animName, this.ANIMATION_MIX);
            spine.state.setAnimation(trackNo, relayAnim, false);
            trackEntry = spine.state.addAnimation(trackNo, animName, loop, 0);
        } else {
            if (beforeAnimation) spine.stateData.setMix(beforeAnim, animName, this.ANIMATION_MIX);
            trackEntry = spine.state.setAnimation(trackNo, animName, loop);
        }

        // Partial-loop listener
        if (loopStartTime) {
            const listener = {
                complete: () => {
                    const cur = spine.state.getCurrent(trackNo);
                    if (cur?.animation?.name !== animName) return;
                    const entry = spine.state.setAnimation(trackNo, animName, false);
                    entry.listener = listener;
                    entry.trackTime = loopStartTime;
                },
            };
            trackEntry.listener = listener;
        }

        return trackEntry;
    }

    _applyEffect(layer, effect, effectSpeed) {
        const duration = (effect.time ?? 1000) / 1000 / effectSpeed;
        const tweener = (typeof gsap !== 'undefined') ? gsap
                      : (typeof TweenMax !== 'undefined') ? TweenMax
                      : null;
        if (!tweener) {
            console.error('[CharacterStage] no tween library available for charEffect', effect);
            return Promise.resolve();
        }

        return new Promise(resolve => {
            const record = {
                tweens: [],
                done: false,
                fadeState: null,
                layer,
                finish: () => {
                    if (record.done) return;
                    record.done = true;
                    if (record.fadeState) {
                        this._endFade(record.fadeState);
                        record.fadeState = null;
                    } else if (record.layer._characterFadeRecord === record) {
                        record.layer._characterFadeRecord = null;
                    }
                    this._activeEffects.delete(record);
                    resolve();
                },
            };
            this._activeEffects.add(record);
            const trackTween = tween => {
                if (tween) record.tweens.push(tween);
                return tween;
            };
            const replaceLayerFade = () => {
                if (layer._characterFadeRecord && layer._characterFadeRecord !== record) {
                    layer._characterFadeRecord.tweens.forEach(tween => {
                        if (tween && typeof tween.kill === 'function') tween.kill();
                    });
                    layer._characterFadeRecord.finish();
                }
                layer._characterFadeRecord = record;
            };
            const useGsap = typeof gsap !== 'undefined' && tweener === gsap;
            const ease = this._resolveEase(effect.easing ?? effect.ease, useGsap);
            const tweenJobs = [];

            if (effect.alpha !== undefined) replaceLayerFade();
            record.fadeState = effect.alpha !== undefined ? this._beginFade(layer) : null;
            if (record.fadeState) {
                record.fadeState.layer = layer;
                record.fadeState.record = record;
            }
            if (effect.alpha !== undefined) {
                const alphaProps = this._buildScalarProps(layer, 'alpha', effect.alpha, effect.type, ease);
                tweenJobs.push({ target: layer, props: alphaProps });
            }

            const transformProps = this._buildTransformProps(layer, effect, ease);
            if (Object.keys(transformProps).length) {
                tweenJobs.push({ target: layer, props: transformProps });
            }

            const scaleProps = this._buildScaleProps(layer, effect, ease);
            if (Object.keys(scaleProps).length) {
                tweenJobs.push({ target: layer.scale, props: scaleProps });
            }

            if (!tweenJobs.length) {
                record.finish();
                return;
            }
            tweenJobs[tweenJobs.length - 1].props.onComplete = record.finish;
            tweenJobs.forEach(job => trackTween(this._startTween(tweener, job.target, duration, job.props)));
        });
    }

    _beginFade(layer) {
        const spine = layer.children.find(child => child instanceof PIXI.spine.Spine);
        const renderer = this._app?.renderer;
        if (!spine || !renderer || typeof renderer.generateTexture !== 'function') return null;
        try {
            const wasAutoUpdate = spine.autoUpdate;
            if (wasAutoUpdate) spine.autoUpdate = false;
            spine.update(0);
            const texture = renderer.generateTexture(spine);
            const sprite = new PIXI.Sprite(texture);
            const bounds = spine.getLocalBounds();
            sprite.anchor.set(0, 0);
            sprite.position.copyFrom(spine.position);
            sprite.x += bounds.x;
            sprite.y += bounds.y;
            sprite.scale.copyFrom(spine.scale);
            sprite.rotation = spine.rotation;
            sprite.alpha = spine.alpha;
            layer.addChild(sprite);
            const state = {
                spine,
                sprite,
                texture,
                visible: spine.visible,
                autoUpdate: wasAutoUpdate,
            };
            spine.visible = false;
            spine.autoUpdate = false;
            return state;
        } catch (err) {
            console.warn('[CharacterStage] failed to create fade snapshot', err);
            return null;
        }
    }

    _endFade(state) {
        if (!state || state.ended) return;
        state.ended = true;
        state.spine.visible = state.visible;
        state.spine.autoUpdate = state.autoUpdate;
        if (state.layer && state.layer._characterFadeRecord === state.record) {
            state.layer._characterFadeRecord = null;
        }
        state.sprite.destroy({ children: true });
        if (state.texture && typeof state.texture.destroy === 'function') state.texture.destroy(true);
    }

    _buildScalarProps(target, key, value, type, ease) {
        const props = { [key]: value, ease };
        if (type === 'from') [target[key], props[key]] = [props[key], target[key]];
        return props;
    }

    _buildTransformProps(layer, effect, ease) {
        const props = {};
        if (effect.x !== undefined) props.x = layer.x + effect.x;
        if (effect.y !== undefined) props.y = layer.y + effect.y;
        if (effect.type === 'from') {
            if (props.x !== undefined) [layer.x, props.x] = [props.x, layer.x];
            if (props.y !== undefined) [layer.y, props.y] = [props.y, layer.y];
        }
        if (Object.keys(props).length) props.ease = ease;
        return props;
    }

    _buildScaleProps(layer, effect, ease) {
        if (effect.scale === undefined) return {};
        const props = { x: effect.scale, y: effect.scale, ease };
        if (effect.type === 'from') {
            [layer.scale.x, props.x] = [props.x, layer.scale.x];
            [layer.scale.y, props.y] = [props.y, layer.scale.y];
        }
        return props;
    }

    _startTween(tweener, target, duration, props) {
        const cleanProps = { ...props };
        delete cleanProps.type;
        delete cleanProps.time;
        if (typeof gsap !== 'undefined' && tweener === gsap) {
            return tweener.to(target, { ...cleanProps, duration });
        }
        return tweener.to(target, duration, cleanProps);
    }

    _resolveEase(easing, useGsap = true) {
        if (!useGsap) {
            switch (easing) {
                case 'easeInOutQuad': return Power1.easeInOut;
                case 'easeInQuad': return Power1.easeIn;
                case 'easeOutQuad': return Power1.easeOut;
                case 'easeInOutCubic': return Power2.easeInOut;
                case 'easeInCubic': return Power2.easeIn;
                case 'easeOutCubic': return Power2.easeOut;
                case 'easeInOutSine': return typeof Sine !== 'undefined' ? Sine.easeInOut : Power1.easeInOut;
                case 'none': return typeof Power0 !== 'undefined' ? Power0.easeNone : Power1.easeInOut;
                default: return Power1.easeInOut;
            }
        }
        switch (easing) {
            case 'easeInOutQuad': return 'power1.inOut';
            case 'easeInQuad': return 'power1.in';
            case 'easeOutQuad': return 'power1.out';
            case 'easeInOutCubic': return 'power2.inOut';
            case 'easeInCubic': return 'power2.in';
            case 'easeOutCubic': return 'power2.out';
            case 'easeInOutSine': return 'sine.inOut';
            case 'none': return 'none';
            default: return 'power1.inOut';
        }
    }
}
