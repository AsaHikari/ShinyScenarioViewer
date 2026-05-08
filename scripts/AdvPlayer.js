// AdvPlayer — coordinator. Mirrors enza's _e class.
// State machine, _onTap, _forward, _onEndText, _changeToWaiting, _playTrack
// reproduce the original behavior. Driven by app.ticker via update(delta).
class AdvPlayer extends PIXI.utils.EventEmitter {
    constructor(app) {
        super();
        this._app    = app;
        this._loader = PIXI.Loader.shared;

        this._bgLayer        = new BgLayer();
        this._middleFgLayer  = new MiddleFgLayer();
        this._characterStage = new CharacterStage();
        this._fgLayer        = new FgLayer();
        this._stillLayer     = new StillLayer();
        this._scenarioPlayer = new ScenarioPlayer();
        this._effectLayer    = new EffectLayer();
        this._movieLayer     = new MovieLayer();
        this._soundController = new SoundController();
        this._selectList     = new SelectList(this._soundController);
        this._mainController = new MainController(this._soundController);
        this._scenarioLogLayer = new ScenarioLogLayer();

        this._schedule       = new Schedule();
        this._trackManager   = null;

        this._state          = State.FREE;
        this._mode           = SpeedMode.MANUAL;
        this._effectSpeed    = 1;
        this._textSpeed      = 100;
        this._waitTime       = 200;
        this._autoWaitTime   = 0;
        this._currentVoice   = null;
        this._currentVoiceKeepActive = false;
        this._currentVoiceEndHandler = null;

        this._container = new PIXI.Container();

        // interactionLayer — full-canvas tap surface. Use Container with an
        // explicit hitArea (more reliable across PIXI v6 builds than a 0-alpha
        // Graphics fill).
        this._interactionLayer = new PIXI.Container();
        this._interactionLayer.interactive = true;
        this._interactionLayer.hitArea = new PIXI.Rectangle(0, 0, 1136, 640);
        this._interactionLayer.on('pointertap', () => this._onTap());

        // Z-order (matches the order enza's me[] uses)
        const layers = [
            this._bgLayer, this._middleFgLayer, this._characterStage,
            this._fgLayer, this._stillLayer,
            this._selectList, this._scenarioPlayer, this._effectLayer,
        ];
        layers.forEach(l => this._container.addChild(l.stageObj));
        // Interaction sits ABOVE content but BELOW UI (so empty-space taps
        // advance text, button taps land on UI buttons above)
        this._container.addChild(this._interactionLayer);
        this._container.addChild(this._mainController.stageObj);
        this._container.addChild(this._movieLayer.stageObj);
        this._container.addChild(this._scenarioLogLayer.stageObj);

        // Wire ScenarioPlayer events (per enza _setupScenarioPlayer)
        this._scenarioPlayer.on('play',    this._onPlayText, this);
        this._scenarioPlayer.on('endText', this._onEndText,  this);

        // Wire MainController control events (per enza _setupMainController)
        this._mainController.on('control', this._onControl, this);

        // Log overlay close → resume playback (enza emits 'closeLog')
        this._scenarioLogLayer.on('closeLog', () => this._closeLog());
        this._scenarioLogLayer.on('replayVoice', (voice) => this._replayLogVoice(voice));

        // Wire SelectList
        this._selectList.on('appear', () => this._onAppearSelectList());
        this._selectList.on('select', (e) => this._onSelect(e));
    }

    get stageObj()         { return this._container; }
    get scenarioPlayer()   { return this._scenarioPlayer; }
    get soundController()  { return this._soundController; }

    // ───────────────────────────────────────────────────────────────────
    // Lifecycle
    // ───────────────────────────────────────────────────────────────────
    start(tracks) {
        this._trackManager = new TrackManager(tracks);
        this._mainController.init(this._scenarioPlayer.stageObj);
        this._setMode(SpeedMode.MANUAL);
        this._playTrack(this._trackManager.currentTrack);
        this.emit('startAdvPlayer');
    }

    update(delta) {
        if (this._paused) return;
        this._schedule.update(delta);
        this._scenarioPlayer.update(delta);
    }

    pause()  { this._paused = true; }
    resume() { this._paused = false; }

    // ───────────────────────────────────────────────────────────────────
    // State helpers
    // ───────────────────────────────────────────────────────────────────
    _setMode(m) {
        this._scenarioPlayer.isAuto = (m === SpeedMode.AUTO);
        this._mode = m;
    }
    _isFree()    { return this._state === State.FREE; }
    _isLocked()  { return this._state === State.LOCKED; }
    _isWaiting() { return this._state === State.WAITING; }
    _changeToFree()    { this._state = State.FREE; }
    _changeToPlaying() { this._state = State.PLAYING; }
    _changeToLocked()  { this._state = State.LOCKED; }

    _changeToWaiting() {
        this._state = State.WAITING;
        if (this._mode !== SpeedMode.AUTO) return;
        if (this._autoWaitTime > 0) return;

        const v = this._currentVoice;
        // Producer bubble loops forever — don't wait for it; just auto-advance.
        if (!v || this._currentVoiceIsLooping) {
            this._registerScheduleForward();
            return;
        }

        // Regular voice: wait for it to end before auto-advancing (mirrors enza).
        // Attach 'end' listener with a fallback timeout in case the event never fires.
        const onEnd = () => {
            if (this._currentVoice !== v) return;
            this._registerScheduleForward();
        };
        if (typeof v.once === 'function') {
            v.once('end', onEnd);
            const dur = (v.duration && v.duration > 0) ? v.duration * 1000 + 800 : 6000;
            const tid = setTimeout(() => { this._detachVoiceEndListener(); onEnd(); }, dur);
            this._voiceEndListener = { voice: v, fn: onEnd, tid };
        } else {
            this._registerScheduleForward();
        }
    }

    _detachVoiceEndListener() {
        const e = this._voiceEndListener;
        if (!e) return;
        try {
            if (e.voice && typeof e.voice.off === 'function') e.voice.off('end', e.fn);
            else if (e.voice && typeof e.voice.removeListener === 'function') e.voice.removeListener('end', e.fn);
        } catch(_) {}
        if (e.tid != null) clearTimeout(e.tid);
        this._voiceEndListener = null;
    }

    _detachCurrentVoiceEndHandler() {
        const e = this._currentVoiceEndHandler;
        if (!e) return;
        try {
            if (e.voice && typeof e.voice.off === 'function') {
                e.voice.off('end', e.fn);
                e.voice.off('ended', e.fn);
            } else if (e.voice && typeof e.voice.removeListener === 'function') {
                e.voice.removeListener('end', e.fn);
                e.voice.removeListener('ended', e.fn);
            }
        } catch(_) {}
        this._currentVoiceEndHandler = null;
    }

    _bindCurrentVoiceEndHandler(voice, keepActive) {
        this._detachCurrentVoiceEndHandler();
        this._currentVoiceKeepActive = !!keepActive;
        if (!voice || typeof voice.once !== 'function') return;
        let done = false;
        const onEnd = () => {
            if (done || this._currentVoice !== voice) return;
            done = true;
            this._currentVoiceKeepActive = false;
            this._currentVoiceEndHandler = null;
        };
        voice.once('end', onEnd);
        voice.once('ended', onEnd);
        this._currentVoiceEndHandler = { voice, fn: onEnd };
    }

    _registerScheduleForward(extra = 0) {
        this._schedule.register(() => this._forward(), this._waitTime + extra);
    }

    // ───────────────────────────────────────────────────────────────────
    // Tap / forward / control
    // ───────────────────────────────────────────────────────────────────
    _onTap() {
        this.emit('tap');
        if (this._mode !== SpeedMode.MANUAL) return;
        if (this._state === State.PLAYING)      this._endTrack();
        else if (this._state === State.WAITING) this._forward();
    }

    _endTrack() {
        // First click during PLAYING: only finish the typewriter immediately.
        // Voice keeps playing; mouth keeps moving (its stop is owned by
        // CharacterStage, triggered by the voice's own 'end' event).
        // Producer bubble is stopped in _onEndText() which fires from endText() below.
        this._scenarioPlayer.endText();
    }

    _forward() {
        if (!this._trackManager) return;
        if (!this._trackManager.currentTrack) return;
        if (this._selectList.active) return;
        this._scenarioPlayer.hideIndicators();

        // Detach any pending AUTO 'voice end' listener — otherwise it can fire
        // on the now-orphaned voice and stop the next track's lip animation.
        this._detachVoiceEndListener();

        this._soundController.removeSe();

        const cur = this._trackManager.currentTrack;
        const shouldKeepVoice = !!cur.voiceKeep || this._currentVoiceKeepActive;
        if (!shouldKeepVoice) {
            this._soundController.removeVoice();
            this._detachCurrentVoiceEndHandler();
            this._currentVoice = null;
            this._currentVoiceIsLooping = false;
            this._currentVoiceKeepActive = false;
            this._scenarioPlayer.controlVoicePlayingAnimation(null);
            if (cur.text && this._characterStage.stopLipAnimations) {
                this._characterStage.stopLipAnimations();
            }
        }
        if (this._trackManager.reachesStopTrack) {
            this._trackManager.resetStopTrack();
            this.emit('skipped');
            if (!this._isFree()) return;
        }

        const next = this._trackManager.forward();
        if (next) {
            this._playTrack(next);
        } else {
            this._changeToLocked();
            this.emit('end');
        }
    }

    _onPlayText() { this._changeToPlaying(); }

    _onEndText(ctrl) {
        // Stop the producer looping bubble — fires whether typewriter finished
        // naturally OR via tap (endText() path also goes through here).
        if (this._currentVoiceIsLooping && this._currentVoice) {
            this._soundController.removeVoice();
            this._detachCurrentVoiceEndHandler();
            this._currentVoice = null;
            this._currentVoiceIsLooping = false;
            this._currentVoiceKeepActive = false;
            this._scenarioPlayer.controlVoicePlayingAnimation(null);
        }

        if (ctrl && ctrl.lock) {
            if (!this._isLocked()) this._changeToWaiting();
        } else {
            this._forward();
        }
    }

    _onControl(e) {
        if (!e) return;
        if (e.opensLog) { this._openLog(); return; }
        // Mode change — if waiting and there are scheduled events, complete them;
        // otherwise step forward right now (matches enza _changeMode)
        if (this._isWaiting()) {
            if (this._schedule.hasEvents) this._schedule.completeAll();
            else this._forward();
        }
        this._setMode(e.mode);
        this._effectSpeed = e.effectSpeed || 1;
        this._bgLayer.speed = this._effectSpeed;
        this._scenarioPlayer.speed = e.speed;
        this._waitTime = e.waitTime;
        // FAST mode disables voice/SE per enza soundDisabled flag.
        if (this._soundController.setSoundDisabled) {
            this._soundController.setSoundDisabled(!!e.soundDisabled);
        }
    }

    _openLog() {
        this.pause();
        this._soundController.pauseSeAndVoice();
        this._scenarioLogLayer.open();
        this.emit('openLog');
    }
    _closeLog() {
        if (this._soundController.removeLogVoice) this._soundController.removeLogVoice();
        this.resume();
        this._soundController.resumeSeAndVoice();
    }

    _replayLogVoice(voice) {
        if (!voice || !this._soundController.playLogVoice) return;
        this._soundController.playLogVoice(voice);
    }

    // ───────────────────────────────────────────────────────────────────
    // Select
    // ───────────────────────────────────────────────────────────────────
    _onAppearSelectList() {
        this.emit('appearSelectList');
        this._changeToLocked();
    }
    _addSelectItem(items, fallbackNextLabel) {
        items.forEach((it, i) => {
            this._selectList.addItem(it.text || it, it.nextLabel || fallbackNextLabel);
        });
        // If next track itself is also a select, the original delays appear()
        const nt = this._trackManager.nextTrack;
        if (!nt || !nt.select) this._selectList.appear();
    }
    _onSelect(e) {
        this._scenarioPlayer.setTextControl('cm');
        this.emit('select', e.nextLabel);
        this._trackManager.nextLabel = e.nextLabel;
        this._scenarioLogLayer.stackTrack(e);
        this._forward();
    }

    // ───────────────────────────────────────────────────────────────────
    // _playTrack — full dispatch (mirrors enza)
    // ───────────────────────────────────────────────────────────────────
    _playTrack(e) {
        if (!e) return;
        this._changeToFree();

        const {
            speaker, text, textCtrl, textWait, textFrame,
            bg, bgEffect, bgEffectTime,
            middleFg, middleFgEffect, middleFgEffectTime,
            fg, fgEffect, fgEffectTime,
            bgm, bgmFadeTime, se, voice, voiceKeep, lip,
            select, nextLabel,
            charStill, stillCtrl, still,
            movie, gameEventCommunicationMovie, gameEventCommunicationSe,
            charSpine, charLabel, charPosition, charScale,
            charAnim1, charAnim2, charAnim3, charAnim4, charAnim5,
            charAnim1Loop, charAnim2Loop, charAnim3Loop, charAnim4Loop, charAnim5Loop,
            charLipAnim, charEffect,
            effectLabel, effectTarget, effectValue,
            waitType, waitTime, autoWaitTime,
        } = e;

        const Q = [];
        let lipDuration;

        // Apply previously-stored textCtrl (clear / addLine / noop) BEFORE new text
        this._scenarioPlayer.applyTextControl();

        // Producer bubble: if the speaker is the producer and no voice is specified,
        // play the looping bubble sound (mirrors EventViewer SoundManager lines 54-57)
        const isProducer = (speaker === 'プロデューサー' || speaker === '制作人');
        const effectiveVoice = voice || (isProducer ? PRODUCER_BUBBLE_KEY : null);
        const voiceIsLooping = !voice && isProducer;

        // Voice & lipDuration
        if (e.lipAnimDuration) {
            lipDuration = e.lipAnimDuration;          // seconds (CharacterStage convention)
        } else if (effectiveVoice) {
            this._detachCurrentVoiceEndHandler();
            this._currentVoice = this._soundController.control('voice', effectiveVoice, null, voiceIsLooping);
            this._currentVoiceIsLooping = voiceIsLooping;
            this._bindCurrentVoiceEndHandler(this._currentVoice, !!voice && !!voiceKeep);
            lipDuration = (this._currentVoice && this._currentVoice.duration)
                ? this._currentVoice.duration : undefined;   // already seconds
        }

        // nextLabel (only when select is NOT present)
        if (nextLabel !== undefined && !select) {
            this._trackManager.nextLabel = nextLabel;
        }

        // Speaker / text / textCtrl
        if (speaker !== undefined) this._scenarioPlayer.controlSpeaker(speaker);
        if (text) {
            this._scenarioPlayer.setTextControl(textCtrl || 'p');
            this._scenarioPlayer.play(text, textWait || 0);
            this._scenarioLogLayer.stackTrack(e);
        } else if (textCtrl) {
            this._scenarioPlayer.setTextControl(textCtrl);
        }
        if (textFrame !== undefined) this._scenarioPlayer.controlFrame(textFrame);
        this._scenarioPlayer.controlVoicePlayingAnimation(this._currentVoice);

        // Layers
        if (bg !== undefined)       Q.push(this._bgLayer.control(bg, bgEffect, bgEffectTime, this._effectSpeed));
        if (middleFg !== undefined) Q.push(this._middleFgLayer.control(middleFg, middleFgEffect, middleFgEffectTime, this._effectSpeed));
        if (fg !== undefined)       Q.push(this._fgLayer.control(fg, fgEffect, fgEffectTime, this._effectSpeed));

        // Stills
        if (charStill !== undefined) this._stillLayer.control(charStill);
        if (still     !== undefined) this._stillLayer.control(still);
        if (stillCtrl !== undefined) this._stillLayer.control(stillCtrl);

        // BGM / SE
        if (bgm) this._soundController.control('bgm', bgm, bgmFadeTime);
        if (se && !movie) this._soundController.control('se',  se);

        // Character (asset = converted charSpine URL)
        if (charSpine || charLabel) {
            const p = this._characterStage.control({
                asset: charSpine, label: charLabel,
                position: charPosition, scale: charScale,
                anim1: charAnim1, anim2: charAnim2, anim3: charAnim3, anim4: charAnim4, anim5: charAnim5,
                anim1Loop: charAnim1Loop, anim2Loop: charAnim2Loop, anim3Loop: charAnim3Loop,
                anim4Loop: charAnim4Loop, anim5Loop: charAnim5Loop,
                lipAnim: charLipAnim, lipAnimDuration: lipDuration,
                lipMarks: lip, keepsLipAnimation: voiceKeep,
                voiceObj: this._currentVoice,
                effect: charEffect, effectSpeed: this._effectSpeed,
            });
            Q.push(p);
        }

        // Select
        if (select) this._addSelectItem(select, nextLabel);

        // Effect
        if (effectValue) Q.push(this._effectLayer.control(effectLabel, effectTarget, effectValue, this._effectSpeed));

        // Movie
        if (movie)                       { this._changeToLocked(); this._controlMovie(movie, se); }
        if (gameEventCommunicationMovie) { this._changeToLocked(); this._controlMovie(gameEventCommunicationMovie, gameEventCommunicationSe); }

        // autoWaitTime — only effective in AUTO mode (matches enza)
        this._autoWaitTime = (autoWaitTime > 0 && this._mode === SpeedMode.AUTO) ? autoWaitTime : 0;
        if (this._autoWaitTime > 0) {
            this._changeToLocked();
            this._registerScheduleForward(this._autoWaitTime);
        }

        // waitType — in FAST mode (effectSpeed≥8) time-based waits are skipped (0ms);
        // effect-based waits still wait for the actual tween Promise to resolve
        // (but tweens run 8× faster), matching enza's effectSpeed scaling behaviour.
        if (waitType) {
            this._changeToLocked();
            if (waitType === WaitType.TIME) {
                const delay = this._effectSpeed >= 8 ? 0
                    : (waitTime || 0) / this._effectSpeed;
                this._schedule.register(() => this._handleWaitEnd(), delay);
            } else if (waitType === WaitType.EFFECT) {
                Promise.all(Q).then(() => {
                    // 1-frame defer (matches enza FrameTween.wait(1))
                    setTimeout(() => this._handleWaitEnd(), 16);
                });
            }
        }

        if (this._effectSpeed >= 8 && !text && !movie && !gameEventCommunicationMovie) {
            this._forceEndSkippableTrack();
        }

        // _onEndTrack: if still FREE (no text, no wait, no movie, no select) → forward
        this._onEndTrack();
    }

    _onEndTrack() {
        if (this._isFree()) this._forward();
    }

    _handleWaitEnd() {
        this._changeToFree();
        this._forward();
    }

    _forceEndSkippableTrack() {
        [this._bgLayer, this._middleFgLayer, this._fgLayer, this._effectLayer, this._characterStage]
            .forEach(layer => {
                if (layer && typeof layer.endEffect === 'function') layer.endEffect();
                else if (layer && typeof layer.endEffects === 'function') layer.endEffects();
            });
    }

    _controlMovie(url, seUrl) {
        if (seUrl) this._soundController.control('se', seUrl);
        this._movieLayer.control(url).then(() => this._handleWaitEnd());
    }
}
