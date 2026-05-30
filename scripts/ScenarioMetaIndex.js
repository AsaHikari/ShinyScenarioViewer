// ScenarioMetaIndex.js — lookup table for chapter title popup
// Maps `{eventType}/{eventId}` → popup display data.
// If an entry is missing or has no `name`, the popup is skipped.
//
// Fields:
//   cardId   — enza idol card ID (10-digit), used to build CDN icon URL
//   name     — chapter/episode display name (e.g. "第1話", "オープニング")
//   title    — (optional) event song/title name (e.g. "EQUAL")
//   catIcon  — event category icon key (default: "produce")
//              "idol" | "support" | "produce" | "after"
//
// Card icon URL template:
//   images/content/idols/icon/{cardId}.png
//   (with CDN hash resolution via hashResources)
//
const SCENARIO_META = {

    // ── 2018018: 冬優子 新エリアリポート ──────────────────────────────
    "produce_events/201801801": {
        cardId: "1050180010",
        name:   "エリアリポート① - 新エリア入り口",
        catIcon: "produce",
    },
    "produce_events/201801802": {
        cardId: "1050180010",
        name:   "エリアリポート② - お菓子の家",
        catIcon: "produce",
    },
    "produce_events/201801811": {
        cardId: "1050180010",
        name:   "エリアリポート③ - パレード",
        catIcon: "produce",
    },

    // ── 2018019: 冬優子 花嫁役 ──────────────────────────────────────
    "produce_events/201801901": {
        cardId: "1040180050",
        name:   "花嫁役① - 役作り（非官方名称）",
        catIcon: "produce",
    },
    "produce_events/201801902": {
        cardId: "1040180050",
        name:   "花嫁役② - 練習（非官方名称）",
        catIcon: "produce",
    },
    "produce_events/201801911": {
        cardId: "1040180050",
        name:   "花嫁役③ - 本番（非官方名称）",
        catIcon: "produce",
    },

    // ── 2001009: 真乃 (card 1040010040) アイドルイベント ─────────────
    "produce_events/200100901": {
        cardId: "1040010040",
        name:   "秋香る",
        catIcon: "idol",
    },
    "produce_events/200100902": {
        cardId: "1040010040",
        name:   "響くやわらか",
        catIcon: "idol",
    },
    "produce_events/200100903": {
        cardId: "1040010040",
        name:   "空の下",
        catIcon: "idol",
    },
    "produce_events/200100904": {
        cardId: "1040010040",
        name:   "染まる景色に",
        catIcon: "idol",
    },

    // ── 4001094: イルミネーションスターズ 田舎お泊りロケ ──────────────
    "game_event_communications/400109401": {
        cardId: "1040010010",
        name:   "スタジオ収録（VTR前）",
        catIcon: "idol",
    },
    "game_event_communications/400109402": {
        cardId: "1040010010",
        name:   "移動中の車内",
        catIcon: "idol",
    },
    "game_event_communications/400109403": {
        cardId: "1040010010",
        name:   "到着、ご家族と対面",
        catIcon: "idol",
    },
    "game_event_communications/400109404": {
        cardId: "1040010010",
        name:   "早朝、お手伝い分担",
        catIcon: "idol",
    },
    "game_event_communications/400109405": {
        cardId: "1040010010",
        name:   "めぐる：家事＆動物",
        catIcon: "idol",
    },
    "game_event_communications/400109406": {
        cardId: "1040010010",
        name:   "真乃：お迎え＆おつかい",
        catIcon: "idol",
    },
    "game_event_communications/400109407": {
        cardId: "1040010010",
        name:   "灯織：畑仕事＆夕飯支度",
        catIcon: "idol",
    },
    "game_event_communications/400109408": {
        cardId: "1040010010",
        name:   "大家族の晩餐",
        catIcon: "idol",
    },
};

// ── Helper: build CDN card icon URL from cardId ──────────────────────────
// Uses the enza CDN hash algorithm.
// Requires hashResources.json or a pre-built hash map.
function buildCardIconUrl(cardId, cardHash) {
    // Local files are stored as {cardId}.png (no hash prefix)
    return `${ASSET_PATH}/images/content/idols/icon/${cardId}.png`;
}

// ── Lookup helper ────────────────────────────────────────────────────────
function getScenarioMeta(eventType, eventId) {
    const key = `${eventType}/${eventId}`;
    return SCENARIO_META[key] || null;
}
