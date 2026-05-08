// Choice selection list — mirrors original ne / SelectList class.
// Events: "appear", "select" { text, nextLabel }
class SelectList extends PIXI.utils.EventEmitter {
    constructor(soundController = null) {
        super();
        this._container = new PIXI.Container();
        this._loader    = PIXI.Loader.shared;
        this._sound     = soundController;
        this._frameMap  = new Map();
        this._items     = [];
        this._frameIdx  = 1;   // next frame index to use (1, 2, 3)
        this._active    = false;
    }

    get stageObj()  { return this._container; }
    get active()    { return this._active; }

    // Add one choice item; called once per select track
    addItem(text, nextLabel) {
        const frameKey = `selectFrame${this._frameIdx}`;
        const res = this._loader.resources[frameKey];
        if (!res || !res.texture) {
            console.warn(`[SelectList] frame resource missing: ${frameKey}`);
            return;
        }

        const itemContainer = new PIXI.Container();
        const frame = new PIXI.Sprite(res.texture);
        itemContainer.addChild(frame);

        const textObj = new PIXI.Text(text, {
            fontFamily: USED_FONT,
            fontSize:   24,
            fill:       0x778899,
            align:      'center',
            padding:    3,
        });
        textObj.anchor.set(0.5);
        // frame size is 318×172
        textObj.position.set(159, 86);
        itemContainer.addChild(textObj);

        // Position by frame index
        const positions = [null, [568, 125], [200, 240], [936, 240]];
        const pos = positions[this._frameIdx] || [568, 125];
        itemContainer.pivot.set(159, 86);
        itemContainer.position.set(pos[0], pos[1]);

        itemContainer.interactive = true;
        itemContainer.buttonMode  = true;
        itemContainer.once('click',      () => this._onSelectItem(itemContainer, text, nextLabel));
        itemContainer.once('touchstart', () => this._onSelectItem(itemContainer, text, nextLabel));

        this._container.addChild(itemContainer);
        this._items.push(itemContainer);
        itemContainer.scale.set(1);
        TweenMax.from(itemContainer, 0.08, { pixi: { scaleX: 0, scaleY: 0 }, ease: Power1.easeOut });
        this._frameIdx++;
    }

    // Make choices visible and start floating animation; emits "appear"
    appear() {
        this._active = true;
        this._items.forEach(item => {
            const baseY = item.y;
            const tl    = new TimelineMax({ repeat: -1, yoyo: true });
            tl.to(item, 1, { pixi: { y: baseY - 10 }, ease: Power1.easeInOut });
            tl.to(item, 1, { pixi: { y: baseY },       ease: Power1.easeInOut });
        });
        this.emit('appear');
    }

    reset() {
        this._container.removeChildren();
        this._items     = [];
        this._frameIdx  = 1;
        this._active    = false;
    }

    // ─── Private helpers ───────────────────────────────────────────────────

    _onSelectItem(selected, text, nextLabel) {
        if (this._sound) this._sound.playSeUrl(SELECT_ANSWER_SE_URL);
        // Disable all items immediately
        this._items.forEach(item => { item.interactive = false; });

        this._items.forEach(item => {
            TweenMax.killTweensOf(item);
            if (item === selected) {
                TweenMax.to(item, 0.18, { pixi: { scaleX: 1.2, scaleY: 1.2 }, ease: Back.easeOut });
                TweenMax.to(item, 0.18, { alpha: 0, delay: 0.78, ease: Power1.easeOut });
            } else {
                TweenMax.to(item, 0.10, {
                    pixi: { y: item.y - 50, scaleX: 0.66, scaleY: 0.66 },
                    alpha: 0.66,
                    ease: Power1.easeOut,
                });
                TweenMax.to(item, 0.20, {
                    pixi: { y: item.y + 100, scaleX: 0, scaleY: 0 },
                    alpha: 0,
                    delay: 0.10,
                    ease: Power2.easeIn,
                });
            }
        });
        setTimeout(() => {
            this._container.removeChildren();
            this._items   = [];
            this._active  = false;
            this.emit('select', { text, nextLabel });
        }, 960);
    }
}
