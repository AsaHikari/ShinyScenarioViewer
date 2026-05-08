// Video-playback layer — mirrors original movieLayer.
// control(movieId) adds an HTML5 <video> element and returns a Promise.
class MovieLayer {
    constructor() {
        this._container = new PIXI.Container();
        this._video     = null;
        this._sprite    = null;
        this._movieAudio = null;
        this._movieSeStarted = false;
    }

    get stageObj() { return this._container; }

    // Returns a Promise that resolves when the video ends.
    // movieUrl is a full URL after AdvResourceConverter (or any string id).
    control(movieUrl, opts = {}) {
        return new Promise(resolve => {
            this._cleanup();
            const seUrl = opts.seUrl;
            this._movieSeStarted = false;
            this._movieAudio = seUrl ? this._createMovieAudio(seUrl) : null;

            const path = movieUrl.startsWith('http') || movieUrl.includes('/')
                ? movieUrl
                : `${ASSET_PATH}/movies/${movieUrl}.mp4`;
            const video = document.createElement('video');
            video.crossOrigin = 'anonymous';
            video.src   = path;
            video.autoplay = false;
            video.muted    = !!this._movieAudio;
            video.volume   = 1;
            video.preload  = 'auto';
            video.playsInline = true;
            video.setAttribute('playsinline', '');

            const playMovieSe = () => {
                if (!this._movieAudio || this._movieSeStarted || video.currentTime <= 0) return;
                this._movieSeStarted = true;
                this._syncMovieAudio(video);
                const p = this._movieAudio.play();
                if (p && typeof p.catch === 'function') p.catch(() => {});
            };
            const resumeMovieSe = () => {
                if (!this._movieAudio || !this._movieSeStarted) return;
                this._syncMovieAudio(video);
                const p = this._movieAudio.play();
                if (p && typeof p.catch === 'function') p.catch(() => {});
            };
            const pauseMovieSe = () => {
                if (this._movieAudio) this._movieAudio.pause();
            };

            video.addEventListener('ended', () => {
                this._stopMovieAudio();
                video.pause();
                resolve();
            });
            video.addEventListener('error', () => {
                console.warn(`[MovieLayer] failed to load: ${path}`);
                this._cleanup();
                resolve();
            });
            video.addEventListener('timeupdate', playMovieSe);
            video.addEventListener('playing', resumeMovieSe);
            video.addEventListener('waiting', pauseMovieSe);
            video.addEventListener('pause', pauseMovieSe);

            const texture  = PIXI.Texture.from(video);
            const sprite   = new PIXI.Sprite(texture);
            sprite.width   = 1136;
            sprite.height  = 640;

            this._container.addChild(sprite);
            this._video  = video;
            this._sprite = sprite;

            video.play().catch(() => {
                this._cleanup();
                resolve();
            });
        });
    }

    reset() { this._cleanup(); }

    _cleanup() {
        if (this._video) {
            this._video.pause();
            this._video.src = '';
            this._video = null;
        }
        this._stopMovieAudio();
        if (this._sprite) {
            if (this._sprite.texture) this._sprite.texture.destroy(true);
            this._container.removeChild(this._sprite);
            this._sprite = null;
        }
    }

    _stopMovieAudio() {
        if (this._movieAudio) {
            this._movieAudio.pause();
            this._movieAudio.src = '';
            this._movieAudio = null;
        }
        this._movieSeStarted = false;
    }

    _createMovieAudio(seUrl) {
        const audio = document.createElement('audio');
        audio.crossOrigin = 'anonymous';
        audio.src = seUrl;
        audio.preload = 'auto';
        audio.volume = 1;
        return audio;
    }

    _syncMovieAudio(video) {
        if (!this._movieAudio) return;
        try {
            if (Math.abs(this._movieAudio.currentTime - video.currentTime) > 0.2) {
                this._movieAudio.currentTime = video.currentTime;
            }
        } catch (_) {}
    }
}
