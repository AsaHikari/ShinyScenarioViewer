// Audio controller. control('bgm'|'se'|'voice', url, fadeMs?) returns the
// playing IMediaInstance for voice (so AdvPlayer can wait for 'end').
class SoundController {
    constructor(opts = {}) {
        this._loader        = PIXI.Loader.shared;
        this._currentBgm    = null;
        this._currentBgmUrl = null;
        this._currentSe     = null;
        this._currentVoice  = null;
        this._currentVoiceRes = null;
        this._currentLogVoice = null;

        if (PIXI.sound) PIXI.sound.volumeAll = opts.masterVolume ?? 0.4;
    }

    control(type, url, fadeTime, loop) {
        // FAST mode disables se + voice playback (mirrors enza soundDisabled)
        if (this._soundDisabled && (type === 'voice' || type === 'se')) return null;
        switch (type) {
            case 'bgm':   this._playBgm(url, fadeTime); return null;
            case 'se':    this._playSe(url);            return null;
            case 'voice': return this._playVoice(url, !!loop);
        }
        return null;
    }

    setSoundDisabled(v) {
        this._soundDisabled = !!v;
        if (this._soundDisabled) { this.removeVoice(); this.removeSe(); }
    }

    removeSe() {
        if (this._currentSe) { try { this._currentSe.stop(); } catch(_){}; this._currentSe = null; }
    }

    removeVoice() {
        if (this._currentVoice) {
            try { this._currentVoice.stop(); } catch(_){};
            this._currentVoice = null;
            this._currentVoiceRes = null;
        }
    }

    removeLogVoice() {
        if (this._currentLogVoice) {
            try { this._currentLogVoice.stop(); } catch(_){};
            this._currentLogVoice = null;
        }
    }

    pauseSeAndVoice() {
        if (this._currentSe) {
            try { this._currentSe.stop(); } catch(_){}
            this._currentSe = null;
        }
        if (this._currentVoice) try { this._currentVoice.paused = true; } catch(_){}
    }
    resumeSeAndVoice() {
        if (this._currentVoice) try { this._currentVoice.paused = false; } catch(_){}
    }

    removeAll() {
        this.removeSe();
        this.removeVoice();
        this.removeLogVoice();
        if (this._currentBgm) { try { this._currentBgm.stop(); } catch(_){}; this._currentBgm = null; this._currentBgmUrl = null; }
    }

    fadeOutAll(duration = 1200) {
        this._fadeStop(this._currentSe, duration, () => { this._currentSe = null; });
        this._fadeStop(this._currentVoice, duration, () => {
            this._currentVoice = null;
            this._currentVoiceRes = null;
        });
        this._fadeStop(this._currentLogVoice, duration, () => { this._currentLogVoice = null; });
        this._fadeStop(this._currentBgm, duration, () => {
            this._currentBgm = null;
            this._currentBgmUrl = null;
        });
    }

    destroy() { this.removeAll(); }

    // Play any preloaded sound by URL or key (used by MainController for UI taps).
    playSeUrl(urlOrKey) {
        // Try direct lookup, then any matching resource whose URL ends with the path
        let res = this._loader.resources[urlOrKey];
        if (!res) {
            for (const k in this._loader.resources) {
                const r = this._loader.resources[k];
                if (r && r.url === urlOrKey) { res = r; break; }
            }
        }
        if (!res) res = this._loader.resources[UI_TAP_SE_KEY];
        if (!res || !res.sound) return;
        try { res.sound.play({ loop: false }); } catch(_) {}
    }

    playLogVoice(urlOrKey) {
        if (!urlOrKey) return null;
        this.removeLogVoice();
        const res = this._findSoundResource(urlOrKey);
        if (!res || !res.sound) return null;
        try {
            this._currentLogVoice = res.sound.play({ loop: false });
            return this._currentLogVoice;
        } catch(_) { return null; }
    }

    _findSoundResource(urlOrKey) {
        let res = this._loader.resources[urlOrKey];
        if (res) return res;
        for (const k in this._loader.resources) {
            const r = this._loader.resources[k];
            if (r && r.url === urlOrKey) return r;
        }
        return null;
    }

    _playBgm(url, fadeTime) {
        if (url === 'fade_out') {
            if (this._currentBgm) {
                const inst = this._currentBgm;
                if (typeof gsap !== 'undefined') {
                    gsap.to(inst, { volume: 0, duration: (fadeTime || 1000) / 1000,
                        onComplete: () => { try { inst.stop(); } catch(_){} } });
                } else if (typeof TweenMax !== 'undefined') {
                    TweenMax.to(inst, (fadeTime || 1000) / 1000,
                        { volume: 0, onComplete: () => { try { inst.stop(); } catch(_){} } });
                } else {
                    try { inst.stop(); } catch(_) {}
                }
            }
            return;
        }
        if (url === 'off') {
            if (this._currentBgm) { try { this._currentBgm.stop(); } catch(_){}; this._currentBgm = null; this._currentBgmUrl = null; }
            return;
        }
        if (url === this._currentBgmUrl) return;       // already playing this BGM
        if (this._currentBgm) { try { this._currentBgm.stop(); } catch(_){}; this._currentBgm = null; }

        const res = this._loader.resources[url];
        if (!res || !res.sound) return;
        try {
            this._currentBgm = res.sound.play({ loop: true, singleInstance: true });
            this._currentBgmUrl = url;
            res.sound.volume = 0.5;
        } catch(_) {}
    }

    _playSe(url) {
        const res = this._loader.resources[url];
        if (!res || !res.sound) return;
        try { this._currentSe = res.sound.play({ loop: false }); } catch(_) {}
    }

    // Returns the playing media instance, augmented with .duration (seconds).
    _playVoice(url, loop = false) {
        this.removeVoice();
        const res = this._loader.resources[url];
        if (!res || !res.sound) return null;
        try {
            const inst = res.sound.play({ loop });
            this._currentVoice    = inst;
            this._currentVoiceRes = res;
            // Expose .duration so AdvPlayer can compute lipAnimDuration
            if (inst && res.sound.duration) {
                inst.duration = res.sound.duration;
            }
            return inst;
        } catch(_) { return null; }
    }

    _fadeStop(inst, duration, clear) {
        if (!inst) {
            clear();
            return;
        }
        const finish = () => {
            try { inst.stop(); } catch(_) {}
            clear();
        };
        try {
            if (typeof gsap !== 'undefined') {
                gsap.to(inst, { volume: 0, duration: duration / 1000, onComplete: finish });
            } else if (typeof TweenMax !== 'undefined') {
                TweenMax.to(inst, duration / 1000, { volume: 0, onComplete: finish });
            } else {
                finish();
            }
        } catch (_) {
            finish();
        }
    }
}
