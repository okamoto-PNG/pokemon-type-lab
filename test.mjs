import { TYPES, POKEMON, multiplier, analyze, suggest, norm, REG, POOL, checkRules, regulationStatus,
         effMultiplier, berryEffect, ABILITY_JA, ABILITY_FX, ITEMS, ITEM_BY, mulText,
         recommend, canHoldItem, defVector } from './logic.mjs';
let fail = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fail++; };
const ti = ja => TYPES.findIndex(t => t.ja === ja);
const mon = n => { const p = POKEMON.find(x => x.name === n); if (!p) throw new Error('not found: ' + n); return { types: p.types, name: n, mon: p }; };

console.log('\n■ 倍率の計算');
ok(multiplier(ti('こおり'), mon('ガブリアス').types) === 4, 'こおり → ガブリアス = ×4');
ok(multiplier(ti('でんき'), mon('ガブリアス').types) === 0, 'でんき → ガブリアス = ×0（じめん無効）');
ok(multiplier(ti('いわ'),   mon('リザードン').types) === 4, 'いわ → リザードン = ×4');
ok(multiplier(ti('でんき'), mon('ギャラドス').types) === 4, 'でんき → ギャラドス = ×4');
ok(multiplier(ti('じめん'), mon('ゲンガー').types)   === 2, 'じめん → ゲンガー = ×2（ゴースト等倍 × どく2倍）');
ok(multiplier(ti('かくとう'), mon('メタグロス').types) === 1, 'かくとう → メタグロス = ×1（はがね2倍 × エスパー半減）');
ok(multiplier(ti('かくとう'), mon('ドドゲザン').types) === 4, 'かくとう → ドドゲザン = ×4（あく・はがね）');

console.log('\n■ メガシンカ');
const find = n => POKEMON.find(p => p.name === n);
const tj = p => p.types.map(t => TYPES[t].ja).join('/');
ok(POKEMON.filter(p => p.kind === 1).length === 95, 'メガ・ゲンシ 95 件を収録');
ok(tj(find('メガリザードンＸ')) === 'ほのお/ドラゴン', 'メガリザードンＸ = ほのお/ドラゴン');
ok(tj(find('メガリザードンＹ')) === 'ほのお/ひこう', 'メガリザードンＹ = ほのお/ひこう（原種と同型でも収録）');
ok(find('メガフシギバナ')?.kind === 1, 'メガフシギバナ（原種と同型）を収録');
ok(tj(find('メガオーダイル')) === 'みず/ドラゴン', 'メガオーダイル = みず/ドラゴン');
ok(tj(find('ゲンシグラードン')) === 'じめん/ほのお', 'ゲンシグラードン = じめん/ほのお');
ok(tj(find('ゲンシカイオーガ')) === 'みず', 'ゲンシカイオーガ も収録（和名が同一でも取りこぼさない）');
ok(tj(find('ヒヒダルマ（ダルマモード）')) === 'ほのお/エスパー', 'イッシュのダルマモード = ほのお/エスパー');
ok(tj(find('ヒヒダルマ（ダルマモード・ガラル）')) === 'こおり/ほのお', 'ガラルのダルマモード = こおり/ほのお（同名衝突を分離）');
ok(['ケンタロス（パルデアのすがた）','ケンタロス（パルデアのすがた・ブレイズ）','ケンタロス（パルデアのすがた・ウォーター）']
     .every(n => find(n)), 'パルデアケンタロス3種がすべて残る');
{
  const sig = new Set(), dup = [];
  for (const p of POKEMON) { if (sig.has(p.name)) dup.push(p.name); sig.add(p.name); }
  ok(dup.length === 0, '名前の重複ゼロ' + (dup.length ? ' → ' + dup.join('、') : ''));
}
ok(find('メガリザードンＸ').key.includes(norm('メガリザードンx')), '全角Ｘを半角xで検索できる（NFKC正規化）');
ok(!POKEMON.some(p => p.name.includes('別フォルム')), '和名なしの重複フォルムは除外済み');
ok(multiplier(ti('フェアリー'), find('メガリザードンＸ').types) === 1, 'フェアリー → メガリザードンＸ = ×1（ほのお半減 × ドラゴン2倍）');
ok(multiplier(ti('いわ'), find('メガリザードンＹ').types) === 4, 'いわ → メガリザードンＹ = ×4');

console.log('\n■ サンプルパーティの分析');
const party = ['ガブリアス','リザードン','カビゴン','ゲンガー','ギャラドス','サンダース'].map(mon);
const a = analyze(party);
console.log(`  危険 ${a.danger} / 注意 ${a.caution} / 手薄 ${a.thin} / スコア ${a.score.toFixed(1)} (${(a.score/6).toFixed(2)}/体)`);
console.log('  攻撃カバー ' + a.offense.comboHit + '/' + a.offense.comboTotal +
            ' ・抜群不可の単タイプ: ' + (a.offense.uncovered.map(t => TYPES[t].ja).join('、') || 'なし'));
for (const r of a.rows.filter(r => r.level !== 'safe').sort((x,y)=>y.weak-x.weak))
  console.log(`   ${r.ja.padEnd(6,'　')} 弱${r.weak} 耐${r.res} → ${r.level}  [${r.mults.map(m=>'×'+m).join(' ')}]`);
ok(a.rows.every(r => r.mults.length === 6), '全18行が6体ぶんの倍率を持つ');
ok(a.rows.find(r => r.ja === 'いわ').level === 'danger', 'いわ が危険判定（リザ×4・ギャラ×2・受け皿ゼロ）');
ok(a.rows.find(r => r.ja === 'こおり').level === 'caution', 'こおり が注意判定（ガブ×4・受け皿ゼロ）');
ok(a.rows.find(r => r.ja === 'でんき').level === 'safe', 'でんき は安定（ギャラ×4だがガブ無効＋サンダース半減）');

console.log('\n■ レギュレーション (Pokémon Champions)');
const rule = (pt, id) => checkRules(pt).find(r => r.id === id);
ok(REG.id === 'M-C', `現行レギュレーションは ${REG.id}`);
ok(POOL.size === 231, `使用可能プール ${POOL.size} 種`);
ok(REG.rules.teamMin === 4 && REG.rules.teamMax === 6, 'チームは 4〜6 体');
ok(POKEMON.filter(p => p.legal).length === 338, 'フォルム単位で 338 件が使用可');
ok(POKEMON.filter(p => p.legal && p.kind === 1).length === 81, 'うちメガ・ゲンシ 81 件');
ok(REG.overrides.length === 3, 'formOverrides が 3 件適用されている');
['メガアブソルZ','メガボーマンダ','メガガブリアスZ','メガルカリオZ','メガグソクムシャ','メガセグレイブ']
  .forEach(n => ok(find(n)?.legal === true, `M-C 追加メガ ${n} が使用可`));
['メガミュウツーＸ','メガレックウザ','メガラティアス']
  .forEach(n => ok(find(n)?.legal === false, `伝説のメガ ${n} は使用不可`));
ok(!POKEMON.some(p => p.legal && p.legend), '使用可プールに伝説・幻は 1 体もいない');
ok(party.every(m => m.mon.legal), 'サンプルパーティは全員 M-C 使用可');
ok(rule(party,'pool').ok && rule(party,'size').ok && rule(party,'species').ok, 'サンプルパーティは全ルールを満たす');
ok(find('ラプラス') && !find('ラプラス').legal, 'ラプラスは M-C 対象外');
ok(find('パオジアン') && !find('パオジアン').legal, 'パオジアン（四災）も対象外');
{
  const bad = [mon('リザードン'), mon('メガリザードンＸ'), mon('カビゴン'), mon('ゲンガー')];
  ok(!rule(bad,'species').ok, 'リザードン＋メガリザードンＸ を同族重複として弾く');
  ok(rule(bad,'size').ok, '4 体はチームサイズOK');
}
ok(!rule(party.slice(0,3),'size').ok, '3 体はチームサイズNG（ダブルは4体以上）');
ok(regulationStatus(new Date('2026-09-17')).expired === false, '2026-09-17 は期間内');
ok(regulationStatus(new Date('2026-12-03')).expired === true, '2026-12-03 は期間切れを検出');

console.log('\n■ とくせい・もちもの');
const abId = ja => Number(Object.keys(ABILITY_JA).find(k => ABILITY_JA[k] === ja));
const M = (name, ability, item) => ({ ...mon(name), ability: ability ? abId(ability) : null, item: item ?? null });
const em = (atkJa, m) => effMultiplier(ti(atkJa), m);

ok(ITEMS.length === 143, `持ち物 ${ITEMS.length} 件を収録`);
ok(ITEMS.filter(x => x.mode).length === 21, 'うち相性に効くのは 21 件（半減きのみ18＋ふうせん等3）');
ok(ITEMS.every(x => x.ja && x.g), '全持ち物に和名とグループがある');
ok(!ITEMS.some(x => x.ja.includes('ナイト') && x.ja.length > 4), 'メガストーンは除外されている');
ok(ITEM_BY.get('leftovers')?.ja === 'たべのこし' && !ITEM_BY.get('leftovers').mode, 'たべのこしは収録されるが相性には効かない');
{ const c = { ...mon('カビゴン'), ability: null, item: 'leftovers' };
  ok(effMultiplier(ti('かくとう'), c) === 2, '相性に効かない持ち物は倍率を変えない'); }
ok(ITEMS.filter(x => x.mode && x.mode.startsWith('berry')).length === 18, '半減きのみ 18 種');
ok(ITEM_BY.get('roseli-berry')?.ja === 'ロゼルのみ', 'PokéAPI に無いロゼルのみを補正できている');
ok(TYPES[ITEM_BY.get('roseli-berry').t].ja === 'フェアリー', 'ロゼルのみ = フェアリー半減');
ok(Object.keys(ABILITY_FX).length === 20, '相性を書き換えるとくせい 20 件');

// とくせいは倍率に反映される
ok(em('じめん', M('ゲンガー')) === 2, 'とくせい未指定なら素の倍率（じめん → ゲンガー ×2）');
ok(em('じめん', M('ゲンガー', 'ふゆう')) === 0, 'ふゆう で じめん 無効');
ok(em('ほのお', M('カビゴン', 'あついしぼう')) === 0.5, 'あついしぼう で ほのお 半減');
ok(em('こおり', M('カビゴン', 'あついしぼう')) === 0.5, 'あついしぼう で こおり 半減');
ok(em('みず', M('ギャラドス')) === 0.5, 'ギャラドス は素で みず 半減');
{ // ハードロック系は効果抜群のときだけ 0.75
  const t = { types: mon('ガブリアス').types, ability: abId('ハードロック'), item: null };
  ok(em('こおり', t) === 3, 'ハードロック: こおり ×4 → ×3');
  ok(em('ほのお', t) === 0.5, 'ハードロック: 抜群でなければ掛からない（ほのお → ガブリアス ×0.5 のまま）');
}

// 持ち物のうち「持ち続けるもの」は倍率に反映
ok(em('じめん', M('ガブリアス', null, 'air-balloon')) === 0, 'ふうせん で じめん 無効');
ok(em('じめん', M('リザードン')) === 0, 'リザードンは素で じめん 無効（ひこう）');
ok(em('じめん', M('リザードン', null, 'iron-ball')) === 2, 'くろいてっきゅう で じめん が通る（×2）');
ok(em('じめん', M('ゲンガー', 'ふゆう', 'iron-ball')) === 2, 'くろいてっきゅう は ふゆう も無効化する');
ok(em('ノーマル', M('ゲンガー')) === 0, 'ノーマル → ゲンガー は無効');
ok(em('ノーマル', M('ゲンガー', null, 'ring-target')) === 1, 'ねらいのまと で無効が解除される');

// 半減きのみは倍率に混ぜず、注記として返す
{
  const g = M('ガブリアス', null, 'yache-berry');
  const base = em('こおり', g);
  ok(base === 4, 'きのみは実効倍率を変えない（こおり → ガブリアス は ×4 のまま）');
  ok(berryEffect(ti('こおり'), g, base) === 2, 'ヤチェのみ: 初撃のみ ×2 と注記される');
  ok(berryEffect(ti('ほのお'), g, em('ほのお', g)) === null, '対象外のタイプには注記が出ない');
}
{
  const c = M('カビゴン', null, 'occa-berry');
  ok(berryEffect(ti('ほのお'), c, em('ほのお', c)) === null, 'オッカのみは効果抜群でないと発動しない');
  const h = M('カビゴン', null, 'chilan-berry');
  ok(berryEffect(ti('ノーマル'), h, em('ノーマル', h)) === 0.5, 'ホズのみは等倍でも半減する');
}

// 行列に反映されるか
{
  const pt = [M('ゲンガー', 'ふゆう'), M('カビゴン'), M('リザードン'), M('ギャラドス')];
  const row = analyze(pt).rows.find(r => r.ja === 'じめん');
  ok(row.mults[0] === 0, '行列にも ふゆう が反映される');
  ok(row.berries.every(b => b === null), 'きのみ未所持なら注記なし');
}

// アイテム条項
{
  const dup = [M('カビゴン', null, 'occa-berry'), M('ゲンガー', null, 'occa-berry'), M('リザードン'), M('ギャラドス')];
  const r = checkRules(dup).find(x => x.id === 'item');
  ok(r && !r.ok, '同じ持ち物の重複を弾く');
  const okTeam = [M('カビゴン', null, 'occa-berry'), M('ゲンガー', null, 'yache-berry'), M('リザードン'), M('ギャラドス')];
  ok(checkRules(okTeam).find(x => x.id === 'item').ok, '違う持ち物なら通る');
}
ok(mulText(0.75) === '¾' && mulText(3) === '3' && mulText(1.25) === '1.25', 'とくせい由来の端数も表示できる');

console.log('\n■ 補完探索（6体 → 入れ替え 1026通り）');
const t0 = performance.now();
const s = suggest(party, a);
const ms = performance.now() - t0;
s.forEach((r,i) => console.log(`   ${i+1}. ${r.types.map(t=>TYPES[t].ja).join('/')}`.padEnd(22,' ') +
  `← ${party[r.slot].name} 交代  危険${r.delta.danger} 注意${r.delta.caution} スコア${r.delta.score>0?'+':''}${r.delta.score.toFixed(1)}  例:${r.examples.map(p=>p.name).join('、')||'なし'}`));
ok(s.length === 5, '提案が5件返る');
ok(s[0].s.danger <= a.danger, '1位は危険タイプ数を悪化させない');
ok(ms < 400, `1026通りの探索が ${ms.toFixed(0)}ms（400ms未満）`);

console.log('\n■ メガは持ち物を持てない');
ok(canHoldItem(mon('カビゴン')) === true, '通常のポケモンは持ち物を持てる');
ok(canHoldItem(mon('メガリザードンＸ')) === false, 'メガはメガストーンで枠が埋まる');
ok(canHoldItem(mon('ゲンシグラードン')) === false, 'ゲンシカイキもオーブで埋まる');
ok(canHoldItem(mon('ライチュウ（アローラのすがた）')) === true, 'リージョンフォルムは普通に持てる');
ok(canHoldItem({ types: [0], name: '仮枠', mon: null }) === true, '型のみの仮枠は対象外');

console.log('\n■ おすすめポケモン');
{
  const t0 = performance.now();
  const rec = recommend(party, analyze(party));
  const ms = performance.now() - t0;
  console.log(`  候補 ${POKEMON.filter(p => p.legal).length} 件 × 6枠 を ${ms.toFixed(0)}ms で探索`);
  rec.slice(0, 5).forEach((r, i) => console.log(
    `   ${i + 1}. ${r.p.name}`.padEnd(22, ' ') +
    (r.ability != null ? `（${ABILITY_JA[r.ability]}）`.padEnd(14, ' ') : ''.padEnd(14, ' ')) +
    `← ${party[r.slot].name} 交代  危険${r.delta.danger} 注意${r.delta.caution} 手薄${r.delta.thin} スコア${r.delta.score > 0 ? '+' : ''}${r.delta.score.toFixed(1)}`));
  ok(rec.length === 8, '8件返る');
  ok(ms < 1500, `探索が ${ms.toFixed(0)}ms（1500ms未満）`);
  ok(rec.every(r => r.p.legal), '候補はすべてレギュ使用可');
  ok(new Set(rec.map(r => r.p.i)).size === rec.length, '同じポケモンが重複しない');
  { const c = {}; rec.forEach(r => { const k = [...r.p.types].sort().join('-'); c[k] = (c[k]||0)+1; });
    ok(Math.max(...Object.values(c)) <= 2, '同じタイプ構成は2件まで');
    ok(Object.keys(c).length >= 4, `タイプ構成が ${Object.keys(c).length} 種類に散る`); }
  ok(!(rec.some(r => r.p.name === 'クチート') && rec.some(r => r.p.name === 'メガクチート')),
     'クチートとメガクチート（同種・同タイプ）は両方出さない');
  const used = new Set(party.map(m => m.mon.sid));
  ok(rec.every(r => !used.has(r.p.sid)), '既にいる種は候補から外れる（同族条項）');
  ok(rec[0].s.danger <= analyze(party).danger, '1位は危険タイプ数を悪化させない');
  ok(rec.every(r => r.ability == null || ABILITY_FX[r.ability]), '推奨とくせいは相性に効くものだけ');
}
{ // 空きがあるときは追加として扱う
  const rec = recommend(party.slice(0, 4), analyze(party.slice(0, 4)));
  ok(rec.every(r => r.slot === -1), '4体なら入れ替えではなく追加');
}
ok(recommend([], { danger: 0, caution: 0, thin: 0, score: 0 }).length === 0, '空パーティなら候補なし');

console.log('\n■ ベクトル化しても結果が変わらない');
{
  const v = defVector(M('ゲンガー', 'ふゆう'));
  ok(v.length === 18 && v[ti('じめん')] === 0, 'defVector にとくせいが反映される');
}

console.log('\n■ 空パーティ');
const e = analyze([]);
ok(e.rows.length === 18 && e.offense.uncovered.length === 18, '空でも落ちない');
ok(suggest([], e).length === 0, '空なら提案なし');

console.log(fail ? `\n${fail} 件 FAILED\n` : '\nすべて通過\n');
process.exit(fail ? 1 : 0);
