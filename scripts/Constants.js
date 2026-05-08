'use strict';

// Asset roots local to this ShinyScenarioViewer shell.
const ASSET_PATH      = './assets';
const DOWNLOADS_PATH  = './assets';

// Font names — both HummingStd-E woff2 parts are used as a family fallback.
const USED_FONT_PRIMARY = 'HummingStd-E-1';
const USED_FONT_SECONDARY = 'HummingStd-E-2';
const USED_FONT      = [USED_FONT_PRIMARY, USED_FONT_SECONDARY];
const USED_FONT_UI   = USED_FONT;
const FONT_TIMEOUT   = 3000;

// Log entry text style — exact enza values from Je/Qe layout templates
const LOG_TEXT_FILL     = 0x615365;   // 6378341 in enza
const LOG_TEXT_FONTSIZE = 24;

// ─── Speed Modes (mirrors original: fe=1 manual, pe=2 auto) ───
const SpeedMode = {
    MANUAL: 1,
    AUTO: 2,
};

// ─── Player States (mirrors original le object) ───
const State = {
    FREE:    'FREE',
    PLAYING: 'PLAYING',
    WAITING: 'WAITING',
    LOCKED:  'LOCKED',
};

// ─── Text Control modes (mirrors original X object) ───
// lock: whether to wait for user tap after text finishes
// beforePlay: what to do to the text player before playing new text
const TextCtrl = {
    p:  { lock: true,  beforePlay: 'clear' },    // default: clear + wait for tap
    n:  { lock: false, beforePlay: 'none' },     // no-op: show inline, auto-continue
    r:  { lock: false, beforePlay: 'addLine' },  // append newline, auto-continue
    l:  { lock: true,  beforePlay: 'addLine' },  // append newline, wait for tap
    cm: { lock: false, beforePlay: 'clear' },    // clear, auto-continue (used after select)
};

// ─── Wait types (mirrors original de/he) ───
const WaitType = {
    TIME:   'time',
    EFFECT: 'effect',
};

// Spine category alias map (same as EventViewer)
const SPINE_ALIAS = {
    stand_fix:            'stand',
    stand_costume_fix:    'stand_costume',
    stand_flex:           'stand',
    stand_costume_flex:   'stand_costume',
    stand:                'stand',
    stand_costume:        'stand_costume',
    stand_jersey:         'stand_jersey',
    stand_silhouette:     'stand_silhouette',
};

// Values that must NOT be converted to URLs by AdvResourceConverter
// (they are commands consumed directly by sub-layers)
const PRESERVED_VALUES = new Set([
    'on', 'off', 'pause', 'resume', 'fade_out', 'rect', 'circle',
]);

// URL templates per resource type. ${id} substituted at convert time.
const ASSET_FORMAT = {
    bg:         `${ASSET_PATH}/images/event/bg/\${id}.jpg`,
    fg:         `${ASSET_PATH}/images/event/fg/\${id}.png`,
    middleFg:   `${ASSET_PATH}/images/event/fg/\${id}.png`,
    bgm:        `${ASSET_PATH}/sounds/bgm/\${id}.m4a`,
    se:         `${ASSET_PATH}/sounds/se/event/\${id}.m4a`,
    voice:      `${ASSET_PATH}/sounds/voice/events/\${id}.m4a`,
    textFrame:  `${ASSET_PATH}/images/event/text_frame/\${id}.png`,
    still:      `${ASSET_PATH}/images/event/still/\${id}.jpg`,
    movie:      `${ASSET_PATH}/movies/\${id}.mp4`,
};

// Character (per-id+category) URL templates
// speakerIcon uses downloads/images/content/{type}/icon_circle_l/{id}.png (180×180)
// logTextFrame uses downloads/images/event/log_text_frame/{id}.png (744×82)
const CHARACTER_ASSET_FORMAT = {
    spine:        `${ASSET_PATH}/spine/\${type}/\${category}/\${id}/data.json`,
    still:        `${ASSET_PATH}/images/content/\${type}/card/\${id}.jpg`,
    speakerIcon:  `${DOWNLOADS_PATH}/images/content/\${type}/icon_circle_l/\${id}.png`,
    logTextFrame: `${DOWNLOADS_PATH}/images/event/log_text_frame/\${id}.png`,
};

// Default text frame used on first track if none specified
const DEFAULT_TEXT_FRAME = '001';

// Select frame texture URLs (1..3 typically)
const SELECT_FRAME_URL = (n) =>
    `${ASSET_PATH}/images/event/select_frame/${String(n).padStart(3, '0')}.png`;

// UI spritesheet (Z=top buttons)
const UI_PARTS_URL  = `${ASSET_PATH}/images/ui/parts_event.json`;
const UI_COMMON_PARTS_URL = `${DOWNLOADS_PATH}/images/ui/start_and_common/parts.json`;
const UI_COMMON_ATLAS_URL = `${DOWNLOADS_PATH}/images/ui/common/parts.json`;

// Common UI tap SE (same file EventViewer uses)
const UI_TAP_SE_URL = `${ASSET_PATH}/sounds/se/003.m4a`;
const UI_TAP_SE_KEY = 'uiTapSe';
const UI_CANCEL_SE_URL = `${ASSET_PATH}/sounds/se/004.m4a`;
const UI_CANCEL_SE_KEY = 'uiCancelSe';

// Producer bubble (looping voice for producer dialogue).
const PRODUCER_BUBBLE_KEY = 'voiceProducerDefault';
const PRODUCER_BUBBLE_URL = `${ASSET_PATH}/sounds/se/002.m4a`;

// Mode-button presets — enza uses exactly three modes (normal / auto / fast4).
// `speed` here is fed into TextPlayer; FAST uses a very large value so the
// typewriter is essentially instantaneous (matches enza textSpeed=80×normal).
// `effectSpeed` is used by AdvPlayer for layer tween scaling.
// FAST also disables voice/SE playback (enza soundDisabled:true).
const CONTROL_PRESETS = {
    NORMAL: { mode: 1, speed: 100,  effectSpeed: 1, waitTime: 180, soundDisabled: false },
    AUTO:   { mode: 2, speed: 100,  effectSpeed: 1, waitTime: 800, soundDisabled: false },
    FAST:   { mode: 2, speed: 8000, effectSpeed: 8, waitTime: 20,  soundDisabled: true  },
    LOG:    { opensLog: true },
};

// ─── Speaker icon lookup (mirrors enza _getSpeakerIconPath logic) ────────────
// Built from enza's internal character ID↔name table.
// sub_characters takes priority over characters (matching enza check order).
const SPEAKER_ICON_SUB = {
    'はづき': '901',
    '社長':   '902',
};
const SPEAKER_ICON_MAIN = {
    '真乃':   '001', '灯織':   '002', 'めぐる': '003', '恋鐘':   '004',
    '摩美々': '005', '咲耶':   '006', '結華':   '007', '霧子':   '008',
    '果穂':   '009', 'カホ':   '009', '智代子': '010', 'チヨコ': '010',
    '樹里':   '011', 'ジュリ': '011', '凛世':   '012', 'リンゼ': '012',
    '夏葉':   '013', 'ナツハ': '013', '甘奈':   '014', '甜花':   '015',
    '千雪':   '016', 'あさひ': '017', '冬優子': '018', '愛依':   '019',
    '透':     '020', '円香':   '021', '小糸':   '022', '雛菜':   '023',
    'にちか': '024', '美琴':   '025', 'ルカ':   '026', '羽那':   '027',
    'はるき': '028',
    'ルビー': '801', 'かな':   '802', 'MEMちょ': '803', 'あかね': '804',
};
// Producer speaker names → no icon (null returned by enza)
const PRODUCER_SPEAKERS = new Set(['プロデューサー', 'Producer', 'producer', '制作人']);
// Fallback icon when no match: sub_characters/801
const DEFAULT_SPEAKER_ICON_ID   = '801';
const DEFAULT_SPEAKER_ICON_TYPE = 'sub_characters';

