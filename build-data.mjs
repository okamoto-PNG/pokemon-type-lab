import fs from 'node:fs';

const GQL = 'https://graphql.pokeapi.co/v1beta2';

// --- 0. レギュレーション定義を読む ---
const REGS = JSON.parse(fs.readFileSync(new URL('./regulations.json', import.meta.url), 'utf8'));
const CUR  = REGS.sets.find(r => r.id === REGS.current);
if (!CUR) throw new Error(`regulations.json: current="${REGS.current}" に一致する set がない`);
if (!CUR.pool || CUR.pool.source !== 'pokedex') throw new Error(`${CUR.id}: pool.source が pokedex ではない`);
console.error(`レギュレーション: ${CUR.id} (${CUR.start} 〜 ${CUR.end})`);
async function q(query) {
  const r = await fetch(GQL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ query }) });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0,500));
  return j.data;
}

// --- 1. 18タイプの名前 ---
const tn = await q(`{
  typename(where:{language_id:{_eq:1}, type_id:{_lte:18}}, order_by:{type_id:asc}) { type_id name }
  en: typename(where:{language_id:{_eq:9}, type_id:{_lte:18}}, order_by:{type_id:asc}) { type_id name }
}`);
const typeIds = tn.typename.map(t => t.type_id);
const idx = new Map(typeIds.map((id, i) => [id, i]));
const enMap = new Map(tn.en.map(t => [t.type_id, t.name]));
const types = tn.typename.map(t => ({ id: t.type_id, ja: t.name, en: enMap.get(t.type_id) }));

// --- 2. 相性表 (デフォルト等倍、typeefficacy は等倍以外のみ収録) ---
const chart = typeIds.map(() => typeIds.map(() => 1));
const eff = await q(`{ typeefficacy(where:{damage_type_id:{_lte:18}, target_type_id:{_lte:18}}, limit:2000)
  { damage_type_id target_type_id damage_factor } }`);
for (const e of eff.typeefficacy) {
  chart[idx.get(e.damage_type_id)][idx.get(e.target_type_id)] = e.damage_factor / 100;
}

// --- 2.5 レギュレーションの使用可能プールを図鑑から解決 ---
const dexRes = await q(`{
  pokedex(where:{id:{_eq:${CUR.pool.pokedexId}}}) { name }
  pokemondexnumber(where:{pokedex_id:{_eq:${CUR.pool.pokedexId}}}) { pokemon_species_id }
}`);
if (!dexRes.pokedex.length) throw new Error(`pokedex id=${CUR.pool.pokedexId} が存在しない`);
const poolSpecies = [...new Set(dexRes.pokemondexnumber.map(x => x.pokemon_species_id))].sort((a, b) => a - b);
if (!poolSpecies.length) throw new Error(`pokedex ${CUR.pool.pokedexId} が空`);
console.error(`使用可能プール: ${poolSpecies.length} 種 (pokedex "${dexRes.pokedex[0].name}")`);
const poolSet = new Set(poolSpecies);

// --- 2.6 フォルム単位の実装状況を learnset から取る ---
// Champions (version group 32) に技を持つ個体 = そのソフトに実装されている姿。
// メガやリージョンフォルムの可否は図鑑（種単位）では分からないので、ここで補う。
const implIds = new Set();
for (let off = 0; ; off += 10000) {
  const d = await q(`{ pokemonmove(where:{version_group_id:{_eq:${CUR.pool.versionGroupId}}},
                       limit:10000, offset:${off}, distinct_on:pokemon_id) { pokemon_id } }`);
  d.pokemonmove.forEach(x => implIds.add(x.pokemon_id));
  if (d.pokemonmove.length < 10000) break;
}
if (!implIds.size) throw new Error(`version group ${CUR.pool.versionGroupId} の learnset が空`);
console.error(`learnset のある個体: ${implIds.size} 件`);

// --- 3. ポケモン本体 (ページング) ---
const rows = [];
for (let off = 0; ; off += 1000) {
  const d = await q(`{ pokemon(limit:1000, offset:${off}, order_by:{id:asc}) {
    id is_default pokemon_species_id
    pokemontypes(order_by:{slot:asc}) { type_id }
    pokemonspecy { generation_id is_legendary is_mythical pokemonspeciesnames(where:{language_id:{_in:[1,2]}}) { name language_id } }
    pokemonforms { name is_mega pokemonformnames(where:{language_id:{_eq:1}}) { name } }
  } }`);
  rows.push(...d.pokemon);
  if (d.pokemon.length < 1000) break;
}
console.error(`fetched ${rows.length} pokemon rows`);

// learnset がまだ入っていない種（＝ロースターに入ったばかり）は、フォルム単位で判定できない
const implSpecies = new Set(rows.filter(p => implIds.has(p.id)).map(p => p.pokemon_species_id));
const lagging = poolSpecies.filter(id => !implSpecies.has(id));
if (lagging.length) console.error(`learnset 未反映の種: ${lagging.length} 件（この種のフォルムは種単位で判定）`);

/**
 * レギュレーションで使えるか。
 *   種がロースター外           → 不可
 *   通常の姿                   → 可
 *   別フォルム（メガ等）        → learnset にあれば可。
 *                                learnset 自体が未反映の種なら、取りこぼさないよう可とする。
 */
const OV = CUR.formOverrides || { allow: [], deny: [] };
const ovAllow = new Set(OV.allow || []), ovDeny = new Set(OV.deny || []);
const ovSeen = new Set();

function isLegal(p) {
  const slug = p.pokemonforms?.[0]?.name;
  if (ovDeny.has(slug))  { ovSeen.add(slug); return false; }
  if (ovAllow.has(slug)) { ovSeen.add(slug); return true; }
  if (!poolSet.has(p.pokemon_species_id)) return false;
  if (p.is_default) return true;
  if (implIds.has(p.id)) return true;
  // learnset がまだ入っていない種は、フォルムを取りこぼさないよう可とする
  return !implSpecies.has(p.pokemon_species_id);
}

// --- 4. デフォルト種 + 「デフォルトとタイプが違う」別フォルムだけ残す ---
const key = p => p.pokemontypes.map(t => t.type_id).join('/');
const defaultTypeKey = new Map();
for (const p of rows) if (p.is_default) defaultTypeKey.set(p.pokemon_species_id, key(p));

// 同じ和名でもタイプが違うフォルムを区別するための語（API のフォルム名スラッグから拾う）
const VARIANT_JA = {
  galar:'ガラル', alola:'アローラ', hisui:'ヒスイ', paldea:'パルデア',
  combat:'コンバット', blaze:'ブレイズ', aqua:'ウォーター',
  male:'オス', female:'メス',
};
/** API のフォルム名から、まだ和名に現れていない識別語を取り出す */
function variantTag(apiName, current) {
  return (apiName || '').split('-')
    .map(tok => VARIANT_JA[tok])
    .filter(ja => ja && !current.includes(ja))
    .join('・');
}

const out = [];
const seenSig  = new Set();   // 名前＋タイプ。完全重複はここで捨てる
const seenName = new Set();   // 名前のみ。衝突したらタイプ違いなので区別する
const dropped = [];
const renamed = [];
for (const p of rows) {
  const tids = p.pokemontypes.map(t => t.type_id).filter(t => idx.has(t));
  if (!tids.length) continue;
  const sp = p.pokemonspecy;
  const base = sp?.pokemonspeciesnames?.find(n => n.language_id === 1)?.name;
  const roma = (sp?.pokemonspeciesnames?.find(n => n.language_id === 2)?.name || '').toLowerCase();
  if (!base) continue;
  let name = base, kind = 0;   // 0=原種 1=メガ/ゲンシ 2=その他フォルム
  const pf   = p.pokemonforms?.[0];
  const form = pf?.pokemonformnames?.[0]?.name;
  if (!p.is_default) {
    // メガシンカとゲンシカイキは、原種とタイプが同じでも収録する
    const isPrimal = /-primal$/.test(pf?.name || '');
    const isMega   = !!pf?.is_mega || isPrimal;
    if (!isMega && key(p) === defaultTypeKey.get(p.pokemon_species_id)) continue;
    // トーテム等、和名のつかない差分フォルムは既存フォルムの重複なので捨てる
    if (!isMega && !form) continue;
    kind = isMega ? 1 : 2;
    // 「メガリザードンＸ」は単体で完結しているので原種名を前置しない。
    // 一方ゲンシカイキの和名は両者とも「ゲンシカイキのすがた」で区別がつかないため、原種名から組み立てる。
    name = isPrimal            ? `ゲンシ${base}`
         : /^メガ/.test(form)  ? form
         :                       `${base}（${form}）`;
  }
  const tkey = tids.join('/');
  if (seenSig.has(name + '|' + tkey)) { dropped.push(name); continue; }  // 完全重複
  if (seenName.has(name)) {
    // 同名だがタイプが違う（ガラルのダルマモード、パルデアケンタロスの3種など）
    const tag = variantTag(pf?.name, name);
    name = tag ? `${base}（${form ? form + '・' : ''}${tag}）` : `${name}＋`;
    while (seenName.has(name)) name += '＋';
    renamed.push(name);
  }
  seenSig.add(name + '|' + tkey);
  seenName.add(name);
  out.push([name, idx.get(tids[0]), tids[1] != null ? idx.get(tids[1]) : -1, sp.generation_id, (sp.is_legendary||sp.is_mythical)?1:0, roma, kind, p.pokemon_species_id, isLegal(p) ? 1 : 0]);
}
out.sort((a, b) => a[7] - b[7] || a[0].localeCompare(b[0], 'ja'));
const pokemon = out.map(r => r.slice(0, 9));   // [..., species id, レギュ使用可フラグ]

// 効かなかった override はスラッグの綴り間違い。黙って無視せず知らせる。
const ovUnused = [...ovAllow, ...ovDeny].filter(x => !ovSeen.has(x));
if (ovUnused.length) console.error(`! formOverrides が一致しませんでした: ${ovUnused.join(', ')}`);
if (ovSeen.size) console.error(`formOverrides を適用: ${[...ovSeen].join(', ')}`);

const legal = pokemon.filter(r => r[8] === 1);
const byKind = legal.reduce((m, r) => (m[r[6]] = (m[r[6]] || 0) + 1, m), {});
console.error(`レギュ使用可 ${legal.length} 件 = 通常 ${byKind[0] || 0} / メガ・ゲンシ ${byKind[1] || 0} / その他フォルム ${byKind[2] || 0}`);

const regulation = {
  id: CUR.id, label: CUR.label, game: CUR.game,
  start: CUR.start, end: CUR.end,
  rules: CUR.rules, megaRule: CUR.megaRule, sources: CUR.sources,
  overrides: [...ovSeen],
  pokedexId: CUR.pool.pokedexId,
  species: poolSpecies,
  legalCount: legal.length,
  laggingSpecies: lagging.length,
  builtAt: new Date().toISOString().slice(0, 10),
};


// --- サニティチェック: 手計算で分かる相性を検証 ---
const ti = n => types.findIndex(t => t.ja === n);
const expect = (atk, def, want) => {
  const got = chart[ti(atk)][ti(def)];
  if (got !== want) throw new Error(`相性表が不正: ${atk}->${def} = ${got} (expected ${want})`);
};
expect('ほのお', 'くさ', 2); expect('じめん', 'ひこう', 0); expect('でんき', 'じめん', 0);
expect('ドラゴン', 'フェアリー', 0); expect('かくとう', 'ゴースト', 0); expect('みず', 'ほのお', 2);
expect('ノーマル', 'いわ', 0.5); expect('エスパー', 'あく', 0);
console.error('相性表 OK');

const data = { types, chart, pokemon, regulation };
const json = JSON.stringify(data);
fs.writeFileSync(new URL('./pokedata.json', import.meta.url), json);
if (dropped.length) console.error(`完全重複で除外: ${dropped.length} 件 → ${[...new Set(dropped)].join('、')}`);
if (renamed.length) console.error(`同名別タイプを改名: ${renamed.length} 件 → ${renamed.join('、')}`);
console.error(`types=${types.length} pokemon=${pokemon.length} bytes=${json.length}`);
const kinds = pokemon.reduce((m,p)=>(m[p[6]]=(m[p[6]]||0)+1,m),{});
console.error(`内訳: 原種 ${kinds[0]||0} / メガ・ゲンシ ${kinds[1]||0} / その他フォルム ${kinds[2]||0}`);
console.error('メガ抜粋:', pokemon.filter(p=>p[6]===1).slice(0,4).map(p=>p[0]).join('、'),
              '…', pokemon.filter(p=>p[6]===1).slice(-2).map(p=>p[0]).join('、'));
console.error('sample:', JSON.stringify(pokemon.slice(0, 3)), JSON.stringify(pokemon.filter(p=>p[0].includes('（')).slice(0,3)));
