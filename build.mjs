import fs from 'node:fs';
const tpl  = fs.readFileSync('app.template.html', 'utf8');
const json = fs.readFileSync('pokedata.json', 'utf8');
if (!tpl.includes('__DATA__')) throw new Error('プレースホルダが見つかりません');
fs.writeFileSync('index.html', tpl.replace('__DATA__', json), 'utf8');
console.log('index.html', (fs.statSync('index.html').size / 1024).toFixed(1) + 'KB');

// --- テンプレートから「DOM に触らない部分」だけ切り出して実際に走らせる ---
const start = tpl.indexOf('const DATA = __DATA__;');
const end   = tpl.indexOf('/* === 5. 状態');
if (start < 0 || end < 0) throw new Error('切り出し位置が見つかりません');
const logic = tpl.slice(start, end).replace('__DATA__', json);
fs.writeFileSync('logic.mjs', logic + '\nexport { TYPES, CHART, POKEMON, norm, REG, POOL, checkRules, regulationStatus, effMultiplier, berryEffect, ABILITY_JA, ABILITY_FX, ITEMS, ITEM_BY, mulText, recommend, canHoldItem, defVector, multiplier, analyze, summarize, suggest, typeKey, judge };\n');
