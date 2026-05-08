// Manages Spine character sprites on stage.
// control() returns a Promise (resolves immediately unless there is a charEffect tween).
// Mirrors the original _characterStage component logic.
class CharacterStage {
    constructor() {
        this._container  = new PIXI.Container();
        this._loader     = PIXI.Loader.shared;
        this._spineMap   = new Map();   // uid → PIXI.spine.Spine
        this._currSpine  = {};          // label → { currCharId, currCharCategory }
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
            // EventViewer-format fields
            charId, charType, charCategory,
            anim1, anim2, anim3, anim4, anim5,
            anim1Loop, anim2Loop, anim3Loop, anim4Loop, anim5Loop,
            lipAnim, lipAnimDuration, lipMarks, voiceObj, effect, effectSpeed = 1,
        } = p;

        if (!label) return Promise.resolve();

        // Resolve the spine UID — supports both formats:
        //   enza native: asset = charSpine path fragment
        //   EventViewer:  charId + charType + charCategory
        if (asset) {
            this._currSpine[label] = { uid: asset };
        } else if (charId) {
            const cat = SPINE_ALIAS[charCategory] ?? charCategory ?? 'stand';
            const uid = `${label}_${charId}_${cat}`;
            this._currSpine[label] = { uid };
        }

        const uid = this._getUid(label);
        if (!uid) return Promise.resolve();

        const spine = this._getOrCreateSpine(uid);
        if (!spine) return Promise.resolve();

        // Bring onto stage
        this._container.addChild(spine);

        // When fading OUT (alpha tween to 0), keep current state visible until fully hidden.
        // Position + animation changes are deferred to AFTER the tween completes (enza behavior).
        const isFadingOut = !!(effect && effect.alpha === 0 && effect.type !== 'from');

        if (!isFadingOut) {
            // Position & scale
            if (position) {
                spine.position.set(position.x, position.y);
                const targetIdx = Math.min(position.order ?? 0, this._container.children.length - 1);
                this._container.setChildIndex(spine, targetIdx);
            }
            if (scale) spine.scale = scale;

            // Animations (tracks 0–4)
            if (anim1) this._setAnim(anim1, anim1Loop ?? true, 0, spine);
            if (anim2) this._setAnim(anim2, anim2Loop ?? true, 1, spine);
            if (anim3) this._setAnim(anim3, anim3Loop ?? true, 2, spine);
            if (anim4) this._setAnim(anim4, anim4Loop ?? true, 3, spine);
            if (anim5) this._setAnim(anim5, anim5Loop ?? true, 4, spine);

            // Lip animation (track 5) is stopped by the voice instance's own end
            // event. Duration metadata can be shorter than actual playback on some
            // decoded files, so don't use it as a fallback while a voice object exists.
            if (lipAnim) {
                this._setAnim(lipAnim, true, 5, spine);
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
        }

        spine.update(0);
        spine.autoUpdate = true;

        // charEffect tween — returns Promise if there is one
        if (effect) {
            const effectPromise = this._applyEffect(spine, effect, effectSpeed);
            if (isFadingOut) {
                // Defer position/animation updates until AFTER fade-out (character now invisible)
                effectPromise.then(() => {
                    if (position) {
                        spine.position.set(position.x, position.y);
                        const targetIdx = Math.min(position.order ?? 0, this._container.children.length - 1);
                        this._container.setChildIndex(spine, targetIdx);
                    }
                    if (scale) spine.scale = scale;
                    if (anim1) this._setAnim(anim1, anim1Loop ?? true, 0, spine);
                    if (anim2) this._setAnim(anim2, anim2Loop ?? true, 1, spine);
                    if (anim3) this._setAnim(anim3, anim3Loop ?? true, 2, spine);
                    if (anim4) this._setAnim(anim4, anim4Loop ?? true, 3, spine);
                    if (anim5) this._setAnim(anim5, anim5Loop ?? true, 4, spine);
                });
            }
            return effectPromise;
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

    reset() {
        this._container.removeChildren();
        this._spineMap.clear();
        this._currSpine = {};
        this._activeEffects.clear();
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

    // ─── Private helpers ───────────────────────────────────────────────────

    _getUid(label) {
        return this._currSpine[label]?.uid ?? null;
    }

    _getOrCreateSpine(uid) {
        if (!this._spineMap.has(uid)) {
            const res = this._loader.resources[uid];
            if (!res || !res.spineData) {
                console.warn(`[CharacterStage] spine resource not found: ${uid}`);
                return null;
            }
            const spine = new PIXI.spine.Spine(res.spineData);
            const alphaFilter = new PIXI.filters.AlphaFilter();
            alphaFilter.alpha = 1;
            alphaFilter.padding = 200;
            spine.filters = [alphaFilter];
            spine.alphaFilter = alphaFilter;
            try { spine.skeleton.setSkinByName('normal'); }
            catch { spine.skeleton.setSkinByName('default'); }
            this._spineMap.set(uid, spine);
        }
        return this._spineMap.get(uid);
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

        let trackEntry;
        const hasRelay = relayAnim && spine.spineData.animations.find(a => a.name === relayAnim);
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

    _applyEffect(spine, effect, effectSpeed) {
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
                finish: () => {
                    if (record.done) return;
                    record.done = true;
                    this._activeEffects.delete(record);
                    resolve();
                },
            };
            this._activeEffects.add(record);
            const trackTween = tween => {
                if (tween) record.tweens.push(tween);
                return tween;
            };
            if (effect.alpha !== undefined) {
                if (!effect.x && !effect.y && !effect.scale) {
                    if (effect.type === 'from') {
                        trackTween(this._startTween(tweener, spine.alphaFilter, 'from', duration, {
                            alpha: effect.alpha,
                            onComplete: record.finish,
                        }));
                    } else {
                        trackTween(this._startTween(tweener, spine.alphaFilter, 'to', duration, {
                            alpha: effect.alpha,
                            onComplete: record.finish,
                        }));
                    }
                    return;
                }
                // Mixed: alpha separately, transform separately
                trackTween(this._startTween(tweener, spine.alphaFilter, 'to', duration, { alpha: effect.alpha }));
                const transformEffect = { ...effect };
                delete transformEffect.alpha;
                trackTween(this._startTween(tweener, spine, 'to', duration, {
                    ...transformEffect,
                    onComplete: record.finish,
                }));
            } else {
                if (effect.type === 'from') {
                    trackTween(this._startTween(tweener, spine, 'from', duration, {
                        ...effect,
                        onComplete: record.finish,
                    }));
                } else {
                    trackTween(this._startTween(tweener, spine, 'to', duration, {
                        ...effect,
                        onComplete: record.finish,
                    }));
                }
            }
        });
    }

    _startTween(tweener, target, type, duration, props) {
        const cleanProps = { ...props };
        delete cleanProps.type;
        delete cleanProps.time;
        if (typeof gsap !== 'undefined' && tweener === gsap) {
            return tweener[type](target, { ...cleanProps, duration });
        }
        return tweener[type](target, duration, cleanProps);
    }
}
