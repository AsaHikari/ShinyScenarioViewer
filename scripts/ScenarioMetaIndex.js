'use strict';

const SCENARIO_META = {};

function buildCardIconUrl(cardId) {
    const folder = String(cardId).startsWith('2') ? 'support_idols' : 'idols';
    return `${ASSET_PATH}/images/content/${folder}/icon/${cardId}.png`;
}

function getScenarioMeta(eventType, eventId) {
    return SCENARIO_META[`${eventType}/${eventId}`] || null;
}
