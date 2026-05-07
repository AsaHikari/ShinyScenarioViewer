// Video-playback layer — mirrors original movieLayer.
// control(movieId) adds an HTML5 <video> element and returns a Promise.
class MovieLayer {
    constructor() {
        this._container = new PIXI.Container();
        this._video     = null;
        this._sprite    = null;
    }

    get stageObj() { return this._container; }

    // Returns a Promise that resolves when the video ends.
    // movieUrl is a full URL after AdvResourceConverter (or any string id).
    control(movieUrl) {
        return new Promise(resolve => {
            this._cleanup();

            const path = movieUrl.startsWith('http') || movieUrl.includes('/')
                ? movieUrl
                : `${ASSET_PATH}/movies/${movieUrl}.mp4`;
            const video = document.createElement('video');
            video.src   = path;
            video.autoplay = false;
            video.muted    = false;

            video.addEventListener('ended', () => {
                this._cleanup();
                resolve();
            });
            video.addEventListener('error', () => {
                console.warn(`[MovieLayer] failed to load: ${path}`);
                this._cleanup();
                resolve();
            });

            const texture  = PIXI.Texture.from(video);
            const sprite   = new PIXI.Sprite(texture);
            sprite.width   = 1136;
            sprite.height  = 640;

            this._container.addChild(sprite);
            this._video  = video;
            this._sprite = sprite;

            video.play().catch(() => resolve());
        });
    }

    reset() { this._cleanup(); }

    _cleanup() {
        if (this._video) {
            this._video.pause();
            this._video.src = '';
            this._video = null;
        }
        if (this._sprite) {
            if (this._sprite.texture) this._sprite.texture.destroy(true);
            this._container.removeChild(this._sprite);
            this._sprite = null;
        }
    }
}
