// Converts raw scenario tracks (with short ids like bg:"00001") into
// tracks whose fields hold ready-to-load asset URLs. The original game
// runs all JSON through this step before handing it to AdvPlayer.
//
// Mirrors enza AdvResourceConverter.convertResourcePaths exactly:
//   • logTextFrame  ← raw textFrame id  → downloads/images/event/log_text_frame/{id}.png
//   • speakerIcon   ← speaker name lookup → downloads/images/content/{type}/icon_circle_l/{id}.png
class AdvResourceConverter {
    constructor(opts = {}) {
        this._assetFormat          = opts.assetFormat          || ASSET_FORMAT;
        this._characterAssetFormat = opts.characterAssetFormat || CHARACTER_ASSET_FORMAT;
        this._defaultTextFrame     = opts.defaultTextFrame     || DEFAULT_TEXT_FRAME;
        this._preserved            = opts.preserved            || PRESERVED_VALUES;
    }

    // Returns a NEW array of converted tracks (does not mutate input).
    convertResourcePaths(tracks) {
        const assetKeys = Object.keys(this._assetFormat);
        // enza .map(): logTextFrame is set ONLY when this track has a textFrame field.
        // Propagation between tracks happens later in ScenarioLogLayer._createLogList.
        const out = tracks.map((t) => {
            const e = Object.assign({}, t);

            // Capture raw textFrame id BEFORE asset conversion (needed for logTextFrame)
            const rawTextFrame = (e.textFrame && !this._preserved.has(e.textFrame))
                ? e.textFrame : null;

            // stillType + stillId  →  charStill (or game_event_communications movie)
            if (e.stillType && e.stillId) {
                if (e.stillType === 'game_event_communications') {
                    e.gameEventCommunicationMovie = e.stillId;
                    e.gameEventCommunicationSe    = e.stillId;
                } else {
                    e.charStill = this._characterPath('still',
                        { type: e.stillType, id: e.stillId });
                }
                delete e.stillType;
                delete e.stillId;
            }

            // charType + charId  →  charSpine
            if (e.charType && e.charId) {
                const cat = SPINE_ALIAS[e.charCategory] || e.charCategory || 'stand';
                e.charSpine = this._characterPath('spine',
                    { type: e.charType, category: cat, id: e.charId });
            }

            // speakerIcon  ← speaker name lookup
            if (e.speaker) {
                e.speakerIcon = this._getSpeakerIconPath(e.speaker);
            }

            // logTextFrame  ← raw textFrame id ONLY (no inter-track propagation here)
            if (rawTextFrame) {
                e.logTextFrame = this._characterPath('logTextFrame', { id: rawTextFrame });
            }

            // Convert all simple-asset fields (bg/fg/bgm/se/voice/textFrame/still/...)
            for (const key of assetKeys) {
                if (e[key] === undefined || e[key] === null) continue;
                if (this._preserved.has(e[key])) continue;
                e[key] = this._assetPath(key, { id: e[key] });
            }

            return e;
        });

        // First track: ensure textFrame and logTextFrame are set (enza behaviour)
        if (out.length && out[0].textFrame === undefined) {
            out[0].textFrame    = this._assetPath('textFrame',    { id: this._defaultTextFrame });
            out[0].logTextFrame = this._characterPath('logTextFrame', { id: this._defaultTextFrame });
        }

        return out;
    }

    // Return a flat list of unique URLs to preload.
    extractResourceList(convertedTracks) {
        const assetKeys = Object.keys(this._assetFormat);
        const list = [];
        for (const t of convertedTracks) {
            for (const k of assetKeys) {
                if (t[k] && !this._preserved.has(t[k])) list.push(t[k]);
            }
            if (t.charStill)    list.push(t.charStill);
            if (t.charSpine)    list.push(t.charSpine);
            if (t.speakerIcon)  list.push(t.speakerIcon);
            if (t.logTextFrame) list.push(t.logTextFrame);
            if (t.gameEventCommunicationMovie) list.push(t.gameEventCommunicationMovie);
            if (t.gameEventCommunicationSe)    list.push(t.gameEventCommunicationSe);
        }
        return Array.from(new Set(list));
    }

    // Mirrors enza _getSpeakerIconPath: sub_characters priority → characters → fallback
    _getSpeakerIconPath(speaker) {
        if (!speaker || PRODUCER_SPEAKERS.has(speaker)) return null;
        // sub_characters first
        if (SPEAKER_ICON_SUB[speaker]) {
            return this._characterPath('speakerIcon',
                { type: 'sub_characters', id: SPEAKER_ICON_SUB[speaker] });
        }
        // main characters
        if (SPEAKER_ICON_MAIN[speaker]) {
            return this._characterPath('speakerIcon',
                { type: 'characters', id: SPEAKER_ICON_MAIN[speaker] });
        }
        // fallback (sub_characters/801)
        return this._characterPath('speakerIcon',
            { type: DEFAULT_SPEAKER_ICON_TYPE, id: DEFAULT_SPEAKER_ICON_ID });
    }

    _assetPath(key, vars) {
        return this._assetFormat[key].replace('${id}', vars.id);
    }

    _characterPath(key, vars) {
        return this._characterAssetFormat[key]
            .replace('${type}',     vars.type     || '')
            .replace('${category}', vars.category || '')
            .replace('${id}',       vars.id       || '');
    }
}
