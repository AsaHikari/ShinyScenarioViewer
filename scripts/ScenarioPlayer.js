// Text dialog component. Owns: frame sprite + speaker label + body text +
// a TextPlayer (typewriter). Emits 'play' on text start and 'endText' with
// the active textControl object when text finishes.
class ScenarioPlayer extends PIXI.utils.EventEmitter {
    constructor(layout = {}) {
        super();
        this._container = new PIXI.Container();
        this._loader    = PIXI.Loader.shared;
        this._frameMap  = new Map();          // url → Sprite
        this._frameObj  = null;
        this._speakerObj = null;
        this._textObj    = null;
        this._arrowObj   = null;
        this._voicePlayingObj = null;
        this._voiceFrames = [];
        this._voiceTicker = 0;
        this._arrowTicker = 0;

        this._textControl = null;             // current ctrl (set by setTextControl)
        this._isAuto      = false;

        this._framePos    = layout.framePos    || { x: 100, y: 460 };
        this._speakerPos  = layout.speakerPos  || { x: 260, y: 472 };
        this._textPos     = layout.textPos     || { x: 250, y: 520 };
        // fontSize/lineHeight/wordWrapWidth match enza TextPlayer config exactly
        this._fontSize    = layout.fontSize    || 22;

        // TextPlayer needs a target Text — created lazily, but TextPlayer needs a
        // reference. Create the Text now so we can pass it.
        this._ensureTextObj();
        this._textPlayer = new TextPlayer({ text: this._textObj });
        this._textPlayer.on('end', this._onTextEnd, this);
        this._buildIndicators();
    }

    get stageObj() { return this._container; }
    get playing()  { return this._textPlayer.playing; }
    set isAuto(v)  { this._isAuto = v; }
    set speed(v)   { this._textPlayer.speed = v; }

    update(delta) {
        this._textPlayer.update(delta);
        this._updateVoicePlayingAnimation(delta);
        this._updateArrowAnimation(delta);
    }

    // Called by AdvPlayer at the start of every _playTrack — applies the
    // beforePlay action of the previously-stored ctrl.
    applyTextControl() {
        const ctrl = this._textControl;
        if (!ctrl) return;
        const bp = ctrl.beforePlay;
        if (bp === 'clear') {
            this._setBodyLineHeight();
            this._textPlayer.clear();
        }
        if (bp === 'addLine') {
            this._setBodyLineHeight();
            this._textPlayer.addLineBreak();
        }
        this._textControl = null;
    }

    setTextControl(ctrlKey) {
        const ctrl = TextCtrl[ctrlKey];
        if (!ctrl) { console.warn(`[ScenarioPlayer] unknown textCtrl: ${ctrlKey}`); return; }
        this._textControl = ctrl;
    }

    play(text, textWait = 0) {
        const start = () => {
            // A previous `textFrame:'off'` may have hidden the text object.
            // Re-show it whenever we play new text.
            if (this._textObj) this._textObj.visible = true;
            this._hideArrow();
            this.emit('play');
            this._textPlayer.play(text || '', false);
        };
        if (textWait > 0) setTimeout(start, textWait);
        else start();
    }

    // Tap during PLAYING — show all text immediately; triggers TextPlayer 'end'
    endText() { this._textPlayer.showAll(); }

    // textFrame can be: 'on', 'off', or a full URL produced by AdvResourceConverter
    controlFrame(frame) {
        if (!frame) return;
        if (frame === 'on') {
            if (this._frameObj)   this._frameObj.visible   = true;
            if (this._speakerObj) this._speakerObj.visible = true;
            if (this._textObj)    this._textObj.visible    = true;
            return;
        }
        if (frame === 'off') {
            if (this._frameObj)   this._frameObj.visible   = false;
            if (this._speakerObj) this._speakerObj.visible = false;
            if (this._textObj)    this._textObj.visible    = false;
            this.hideIndicators();
            return;
        }
        this._switchFrame(frame);   // url
    }

    controlSpeaker(speaker) {
        this._ensureSpeakerObj();
        if (!speaker || speaker === 'off') {
            this._speakerObj.visible = false;
            return;
        }
        this._speakerObj.visible = true;
        this._speakerObj.text = speaker;
    }

    controlVoicePlayingAnimation(voice) {
        this._stopVoicePlayingAnimation();
        if (!voice || this._isNeedTextSE() || !this._textControl) return;
        this._playVoicePlayingAnimation();
        let done = false;
        const onEnd = () => {
            if (done) return;
            done = true;
            this._stopVoicePlayingAnimation();
            if (!this.playing) this._showArrow();
        };
        if (typeof voice.once === 'function') {
            voice.once('end', onEnd);
            voice.once('ended', onEnd);
        }
    }

    reset() {
        this._textPlayer.clear();
        this._textControl = null;
        this.hideIndicators();
    }

    hideIndicators() {
        this._hideArrow();
        this._stopVoicePlayingAnimation();
    }

    destroy() {
        this._textPlayer.destroy();
        this.removeAllListeners();
    }

    _onTextEnd() {
        const ctrl = this._textControl || TextCtrl.p;
        this._showArrow();
        this.emit('endText', ctrl);
    }

    _buildIndicators() {
        const tex = this._getCommonTexture('next_arrow.png');
        if (tex) {
            this._arrowObj = new PIXI.Sprite(tex);
            this._arrowObj.anchor.set(0.5);
        } else {
            const g = new PIXI.Graphics();
            g.beginFill(0xFFFFFF, 0.9);
            g.drawPolygon([0, 0, 16, 8, 0, 16]);
            g.endFill();
            g.pivot.set(8, 8);
            this._arrowObj = g;
        }
        this._arrowBasePos = { x: this._framePos.x + 814, y: this._framePos.y + 128 };
        this._arrowObj.position.set(this._arrowBasePos.x, this._arrowBasePos.y);
        this._arrowObj.visible = false;
        this._container.addChild(this._arrowObj);

        this._voicePlayingObj = new PIXI.Container();
        this._voicePlayingObj.position.set(this._framePos.x + 808, this._framePos.y + 135);
        this._voicePlayingObj.visible = false;
        const speakerTex = this._getCommonTexture('speaker.png');
        if (speakerTex) {
            const speaker = new PIXI.Sprite(speakerTex);
            speaker.anchor.set(1, 0.5);
            this._voicePlayingObj.addChild(speaker);
        }
        this._voiceFrames = ['speaker_volume_1.png', 'speaker_volume_2.png', 'speaker_volume_3.png']
            .map(name => this._getCommonTexture(name))
            .filter(Boolean)
            .map((tex, i) => {
                const sp = new PIXI.Sprite(tex);
                sp.anchor.set(0.5);
                sp.position.set(5 + 5 * i, 0);
                sp.visible = false;
                sp.alpha = 0;
                this._voicePlayingObj.addChild(sp);
                return sp;
            });
        this._container.addChild(this._voicePlayingObj);
    }

    _getCommonTexture(name) {
        const atlas = PIXI.Loader.shared.resources['uiCommonAtlas'];
        return (atlas && atlas.textures && atlas.textures[name]) || PIXI.utils.TextureCache[name] || null;
    }

    _isNeedTextSE() {
        const speaker = this._speakerObj && this._speakerObj.text;
        return !!speaker && (PRODUCER_SPEAKERS.has(speaker) || speaker === '審査員' || speaker === 'judge');
    }

    _playVoicePlayingAnimation() {
        if (!this._voicePlayingObj) return;
        this._hideArrow();
        this._voicePlayingObj.visible = true;
        this._voiceTicker = 0;
        this._setVoiceVolumeAlphas(0);
    }

    _stopVoicePlayingAnimation() {
        if (!this._voicePlayingObj) return;
        this._voicePlayingObj.visible = false;
        this._setVoiceVolumeAlphas(null);
    }

    _updateVoicePlayingAnimation(delta) {
        if (!this._voicePlayingObj || !this._voicePlayingObj.visible || this._voiceFrames.length === 0) return;
        this._voiceTicker += delta;
        this._setVoiceVolumeAlphas(this._voiceTicker % 90);
    }

    _setVoiceVolumeAlphas(frame) {
        this._voiceFrames.forEach((sp, i) => {
            if (frame == null) {
                sp.visible = false;
                sp.alpha = 0;
                return;
            }
            const start = 20 * (i + 1);
            const fadeInEnd = start + 5;
            const fadeOutStart = fadeInEnd + 20 * (this._voiceFrames.length - i);
            const fadeOutEnd = fadeOutStart + 5;
            let alpha = 0;
            if (frame >= start && frame < fadeInEnd) {
                alpha = (frame - start) / 5;
            } else if (frame >= fadeInEnd && frame < fadeOutStart) {
                alpha = 1;
            } else if (frame >= fadeOutStart && frame < fadeOutEnd) {
                alpha = 1 - (frame - fadeOutStart) / 5;
            }
            sp.visible = alpha > 0;
            sp.alpha = alpha;
        });
    }

    _raiseIndicators() {
        if (this._arrowObj && this._container.children.includes(this._arrowObj)) {
            this._container.setChildIndex(this._arrowObj, this._container.children.length - 1);
        }
        if (this._voicePlayingObj && this._container.children.includes(this._voicePlayingObj)) {
            this._container.setChildIndex(this._voicePlayingObj, this._container.children.length - 1);
        }
    }

    _showArrow() {
        if (!this._arrowObj) return;
        const ctrl = this._textControl || TextCtrl.p;
        if (this._isAuto || !ctrl.lock || (this._voicePlayingObj && this._voicePlayingObj.visible)) return;
        this._arrowTicker = 0;
        this._arrowObj.position.set(this._arrowBasePos.x, this._arrowBasePos.y);
        this._arrowObj.visible = true;
    }

    _hideArrow() {
        if (this._arrowObj) this._arrowObj.visible = false;
        if (this._arrowObj && this._arrowBasePos) {
            this._arrowObj.position.set(this._arrowBasePos.x, this._arrowBasePos.y);
        }
    }

    _updateArrowAnimation(delta) {
        if (!this._arrowObj || !this._arrowObj.visible) return;
        this._arrowTicker = (this._arrowTicker + delta) % 60;
        const phase = this._arrowTicker < 30 ? this._arrowTicker / 30 : (this._arrowTicker - 30) / 30;
        const eased = phase * (2 - phase);
        const offset = this._arrowTicker < 30 ? 5 * eased : 5 * (1 - eased);
        this._arrowObj.position.set(this._arrowBasePos.x + offset, this._arrowBasePos.y + offset);
    }

    _switchFrame(url) {
        const res = this._loader.resources[url];
        if (!res || !res.texture) {
            console.warn('[ScenarioPlayer] textFrame missing:', url);
            return;
        }
        if (!this._frameMap.has(url)) {
            this._frameMap.set(url, new PIXI.Sprite(res.texture));
        }
        const sprite = this._frameMap.get(url);
        sprite.position.set(this._framePos.x, this._framePos.y);

        if (this._frameObj && this._frameObj !== sprite) {
            this._container.removeChild(this._frameObj);
        }
        if (!this._container.children.includes(sprite)) {
            this._container.addChildAt(sprite, 0);
        }
        sprite.visible = true;
        this._frameObj = sprite;

        this._ensureSpeakerObj();
        this._ensureTextObj();
        // Switching to a real frame implies the dialog box is visible again.
        if (this._textObj)    this._textObj.visible    = true;
        if (this._speakerObj) this._speakerObj.visible = true;
        // Make sure text/speaker stay above the frame
        if (this._speakerObj) this._container.setChildIndex(
            this._speakerObj, this._container.children.length - 1);
        if (this._textObj) this._container.setChildIndex(
            this._textObj, this._container.children.length - 1);
        this._raiseIndicators();
    }

    _ensureSpeakerObj() {
        if (this._speakerObj) return;
        // enza speaker style: { fill: 0x555555, fontFamily: 'HummingStd-E' } only.
        // No fontWeight (no bold variant exists in HummingStd-E woff2 — setting
        // 'bold' forces the browser to synthesise / fall back, which causes
        // Japanese chars to render with a different (default) typeface).
        this._speakerObj = new PIXI.Text('', {
            fontFamily: USED_FONT, fontSize: this._fontSize + 2, fill: 0x555555,
        });
        this._speakerObj.position.set(this._speakerPos.x, this._speakerPos.y);
        this._container.addChild(this._speakerObj);
    }

    _ensureTextObj() {
        if (this._textObj) return;
        // enza dialogue style: family HummingStd-E, size 22, lineHeight 30,
        // wordWrap true, wordWrapWidth 661, breakWords true.
        this._textObj = new PIXI.Text('', {
            fontFamily: USED_FONT, fontSize: this._fontSize, fill: 0x555555,
            align: 'left', lineHeight: 30,
            wordWrap: true, wordWrapWidth: 661, breakWords: true,
        });
        this._textObj.position.set(this._textPos.x, this._textPos.y);
        this._container.addChild(this._textObj);
    }

    _setBodyLineHeight() {
        if (!this._textObj) return;
        this._textObj.style.lineHeight = 30;
    }
}
