// Choice selection list — mirrors original ne / SelectList class.
// Events: "appear", "select" { text, nextLabel }
class SelectList extends PIXI.utils.EventEmitter {
    constructor(soundController = null) {
        super();
        this._container = new PIXI.Container();
        this._loader    = PIXI.Loader.shared;
        this._sound     = soundController;
        this._container.visible = false;
        this._baseLayer = new PIXI.Graphics();
        this._baseLayer.beginFill(0x000000, 0.5);
        this._baseLayer.drawRect(0, 0, 1136, 640);
        this._baseLayer.endFill();
        this._baseLayer.alpha = 0;
        this._itemsContainer = new PIXI.Container();
        this._container.addChild(this._baseLayer);
        this._container.addChild(this._itemsContainer);
        this._items     = [];
        this._floatTweens = [];
        this._frameIdx  = 1;   // next frame index to use (1, 2, 3)
        this._active    = false;
        this._selecting = false;
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
        itemContainer._frame = new PIXI.Sprite(res.texture);
        const frame = itemContainer._frame;
        frame.anchor.set(0.5);
        itemContainer.addChild(frame);

        const textObj = new PIXI.Text(text, {
            fontFamily: USED_FONT,
            fontSize:   24,
            lineHeight: 30,
            fill:       0x594F4C,
            align:      'center',
            padding:    3,
        });
        textObj.anchor.set(0.5);
        textObj.position.set(0, 0);
        itemContainer.addChild(textObj);

        itemContainer.interactive = true;
        itemContainer.buttonMode  = true;
        const select = () => this._onSelectItem(itemContainer, text, nextLabel);
        itemContainer.once('tap', select);
        itemContainer.once('pointertap', select);
        itemContainer.once('click', select);
        itemContainer.once('touchstart', select);

        this._itemsContainer.addChild(itemContainer);
        this._items.push(itemContainer);
        this._frameIdx++;
    }

    // Make choices visible and start floating animation; emits "appear"
    appear() {
        this._applyLayout();
        this._container.visible = true;
        this._active = true;
        TweenMax.to(this._baseLayer, 0.16, { alpha: 1 });
        this._startFloatAnimation();
        this.emit('appear');
    }

    reset() {
        this._stopFloatAnimation();
        this._itemsContainer.removeChildren();
        this._items     = [];
        this._frameIdx  = 1;
        this._active    = false;
        this._selecting = false;
        this._container.visible = false;
    }

    // ─── Private helpers ───────────────────────────────────────────────────

    _applyLayout() {
        const layouts = {
            1: [[564, 114]],
            2: [[212, 216], [912, 216]],
            3: [[564, 114], [212, 216], [912, 216]],
            4: [[564, 114], [212, 216], [912, 216], [564, 344]],
            5: [[564, 104], [212, 186], [912, 186], [324, 374], [794, 374]],
        };
        const positions = layouts[Math.min(this._items.length, 5)] || layouts[1];
        this._items.slice(5).forEach(item => item.destroy({ children: true }));
        this._items = this._items.slice(0, 5);
        this._items.forEach((item, index) => {
            const frameKey = `selectFrame${index + 1}`;
            const res = this._loader.resources[frameKey];
            if (res && res.texture && item._frame) item._frame.texture = res.texture;
            const pos = positions[index] || positions[0];
            item.position.set(pos[0], pos[1]);
            item.alpha = 1;
            item.scale.set(1);
        });
    }

    _onSelectItem(selected, text, nextLabel) {
        if (!this._active || this._selecting) return;
        this._selecting = true;
        if (this._sound) this._sound.playSeUrl(SELECT_ANSWER_SE_KEY);
        this.emit('selectStart');
        this._items.forEach(item => { item.interactive = false; });
        this._stopFloatAnimation();
        TweenMax.to(this._baseLayer, 0.16, { alpha: 0 });
        Promise.all(this._items.map(item => item === selected
            ? this._animateSelected(item)
            : this._animateUnselected(item)
        )).then(() => {
            this._itemsContainer.removeChildren();
            this._items   = [];
            this._frameIdx = 1;
            this._active  = false;
            this._selecting = false;
            this._container.visible = false;
            this.emit('select', { target: selected, text, nextLabel, isSelectedItem: true });
        });
    }

    _startFloatAnimation() {
        this._stopFloatAnimation();
        this._items.forEach((item, index) => {
            const baseY = item.y;
            item.scale.set(0);
            const appear = TweenMax.to(item.scale, 0.08, { x: 1, y: 1 });
            const float = new TimelineMax({ repeat: -1 });
            float.to(item, 0.64, { y: baseY + 12, ease: Power1.easeInOut });
            float.to(item, 0.64, { y: baseY, ease: Power1.easeInOut });
            appear.eventCallback('onComplete', () => float.play(0));
            float.pause();
            this._floatTweens.push(appear, float);
        });
    }

    _stopFloatAnimation() {
        this._floatTweens.forEach(tween => {
            if (tween && typeof tween.kill === 'function') tween.kill();
        });
        this._floatTweens = [];
    }

    _animateSelected(item) {
        return new Promise(resolve => {
            TweenMax.to(item.scale, 0.18, {
                x: 1.2,
                y: 1.2,
                ease: Back.easeOut,
                onComplete: () => {
                    TweenMax.to(item, 0.18, {
                        alpha: 0,
                        delay: 0.6,
                        onComplete: resolve,
                    });
                },
            });
        });
    }

    _animateUnselected(item) {
        return new Promise(resolve => {
            TweenMax.to(item, 0.10, {
                y: item.y - 50,
                alpha: 0.66,
                ease: Power1.easeOut,
            });
            TweenMax.to(item.scale, 0.10, { x: 0.66, y: 0.66, ease: Power1.easeOut });
            TweenMax.to(item, 0.20, {
                y: item.y + 100,
                alpha: 0,
                delay: 0.10,
                ease: Power1.easeIn,
                onComplete: resolve,
            });
            TweenMax.to(item.scale, 0.20, { x: 0, y: 0, delay: 0.10, ease: Power1.easeIn });
        });
    }
}
