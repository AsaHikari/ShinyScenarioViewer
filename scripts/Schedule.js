// Lightweight timed-callback scheduler driven by AdvPlayer.update(delta).
// Mirrors the original game's schedule helper: register(callback, ms),
// completeAll(), update(delta) — delta in PIXI ticker units (~16.67ms at 60fps).
class Schedule {
    constructor() {
        this._events = [];   // { fn, remaining }
    }

    get hasEvents() { return this._events.length > 0; }

    register(fn, ms) {
        if (typeof fn !== 'function') return;
        this._events.push({ fn, remaining: Math.max(0, ms || 0) });
    }

    cancelAll() {
        this._events.length = 0;
    }

    completeAll() {
        while (this._events.length > 0) {
            const event = this._events.shift();
            try {
                event.fn();
            } catch (err) {
                console.error('[Schedule] callback failed', err);
                throw err;
            }
        }
    }

    update(deltaTicks) {
        if (this._events.length === 0) return;
        const deltaMs = deltaTicks * (1000 / 60);
        const ready = [];
        this._events = this._events.filter(e => {
            e.remaining -= deltaMs;
            if (e.remaining <= 0) { ready.push(e); return false; }
            return true;
        });
        ready.forEach(e => {
            try {
                e.fn();
            } catch (err) {
                console.error('[Schedule] callback failed', err);
                throw err;
            }
        });
    }

    destroy() {
        this._events.length = 0;
    }
}
