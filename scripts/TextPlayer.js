// Typewriter text driver. PIXI EventEmitter — emits 'end' when text fully shown.
// `update(delta)` is called every frame with the PIXI ticker delta (~1.0 per
// frame at 60fps). We convert delta → ms (delta * 1000/60) and reveal one
// character every `_charIntervalMs` ms. Speed semantics:
//   speed = 100  →  ~50ms/char (NORMAL)
//   speed = 4    →  ~2ms/char  (FAST, mostly instant)
// Formula: charIntervalMs = BASE_INTERVAL / (speed/100)   where BASE_INTERVAL=50.
class TextPlayer extends PIXI.utils.EventEmitter {
    constructor(opts) {
        super();
        this._textObj   = opts.text;       // PIXI.Text
        this._content   = '';
        this._index     = 0;
        this._playing   = false;
        this._elapsedMs = 0;
        this._baseIntervalMs = 80;
        this._charIntervalMs = this._baseIntervalMs;   // ms per char (default ~20 cps)
        this._speed     = 100;
        this.speed      = opts.speed != null ? opts.speed : 100;
    }

    get speed()    { return this._speed; }
    set speed(v)   {
        this._speed = v || 100;
        // Higher speed value → faster typing → smaller interval.
        this._charIntervalMs = this._baseIntervalMs * (100 / this._speed);
    }
    get playing()  { return this._playing; }
    get content()  { return this._content; }

    update(delta) {
        if (!this._playing) return;
        this._elapsedMs += delta * (1000 / 60);
        const newIndex = Math.floor(this._elapsedMs / this._charIntervalMs);
        if (newIndex === this._index) return;
        this._index = newIndex;
        this._forwardContent();
    }

    play(text, doClear = true) {
        if (doClear) this.clear();
        this._content += (text || '');
        this._playing = true;
    }

    clear() {
        this._textObj.text = '';
        this._content = '';
        this._index   = 0;
        this._elapsedMs = 0;
    }

    addLineBreak() {
        this._content += '\n';
    }

    showAll() {
        this._textObj.text = this._content;
        this._index     = Math.max(0, this._content.length - 1);
        this._elapsedMs = this._charIntervalMs * this._index;
        this._end();
    }

    destroy() {
        this._playing = false;
        this.removeAllListeners();
    }

    _forwardContent() {
        if (!this._content) return;
        this._textObj.text = this._content.slice(0, this._index + 1);
        if (this._index >= this._content.length - 1) this._end();
    }

    _end() {
        this._playing = false;
        this.emit('end');
    }
}
