// Mirrors original TrackManager / ce class
class TrackManager {
    constructor(tracks) {
        this._tracks = tracks;
        this._current = 0;
        this._nextLabel = null;
        this._stopTrackIndex = -1;
    }

    get currentTrack() { return this._tracks[this._current]; }
    get nextTrack()    { return this._tracks[this._current + 1]; }

    // True if at least one track has a select option
    get hasSelectTrack() { return this._tracks.some(t => t.select); }

    get reachesStopTrack() {
        return this._stopTrackIndex !== -1 && this._current === this._stopTrackIndex;
    }

    set nextLabel(v) { this._nextLabel = v; }

    // Advance one step; returns the new currentTrack (or undefined at end)
    forward() {
        if (this._nextLabel) {
            this._jumpTo(this._nextLabel);
        } else {
            this._current++;
        }
        return this.currentTrack;
    }

    resetStopTrack() { this._stopTrackIndex = -1; }

    // Set stop point to the track just before the first select track
    setBeforeSelectTrackToStopTrack() {
        const index = this._tracks.findIndex(t => t.select);
        this._stopTrackIndex = (index !== -1 && index !== 0) ? index - 1 : index;
    }

    // Public alias used by AdvPlayer after a select choice
    jumpTo(label) { this._jumpTo(label); }

    // Return current track (convenience method alongside getter)
    current() { return this._tracks[this._current]; }

    destroy() {
        this._tracks = [];
        this._current = 0;
        this._nextLabel = null;
        this._stopTrackIndex = -1;
    }

    _jumpTo(label) {
        for (let i = 0; i < this._tracks.length; i++) {
            if (this._tracks[i].label === label) {
                this._current = i;
                this._nextLabel = null;
                return;
            }
        }
        throw new Error(`label "${label}" is not found.`);
    }
}
