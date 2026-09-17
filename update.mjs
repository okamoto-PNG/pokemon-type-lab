/**
 * レギュレーション更新の取り込み。
 *
 *   node update.mjs          差分を表示して pokedata.json と index.html を更新する
 *   node update.mjs --check  更新せず、差分と要対応事項だけ表示する（終了コードで判定可）
 *
 * 新レギュレーションが始まったら regulations.json に 1 ブロック足して current を変え、
 * これを実行する。使用可能ポケモンの一覧を手で書く必要はない。
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const CHECK = process.argv.includes('--check');
const here  = new URL('.', import.meta.url);
const path  = f => new URL(f, here);
const read  = f => { try { return JSON.parse(fs.readFileSync(path(f), 'utf8')); } catch { return null; } };

const before = read('pokedata.json');
const regs   = read('regulations.json');
const cur    = regs.sets.find(r => r.id === regs.current);
const today  = new Date().toISOString().slice(0, 10);

console.log(`今日: ${today}`);
console.log(`regulations.json の current: ${cur.id} (${cur.start} 〜 ${cur.end})\n`);

// --- 1. レギュレーション定義そのものが古くないか ---
const problems = [];
if (today > cur.end)   problems.push(`${cur.id} は ${cur.end} で終了しています。新しいレギュレーションを regulations.json に追加し、current を更新してください。`);
if (today < cur.start) problems.push(`${cur.id} はまだ開始していません（${cur.start} 開始）。`);

// --- 2. 最新データを取得（--check でも一時ファイルに取って差分だけ見る） ---
const backup = before ? JSON.stringify(before) : null;
try {
  execFileSync(process.execPath, ['build-data.mjs'], { cwd: here, stdio: ['ignore', 'ignore', 'inherit'] });
} catch (e) {
  console.error('\n取得に失敗しました。ネットワークか PokéAPI 側の問題の可能性があります。');
  process.exit(2);
}
const after = read('pokedata.json');

// --- 3. 差分 ---
const nameOf = r => r[0];
const poolOf = d => new Set(d?.regulation?.species ?? []);
const setOf  = d => new Set((d?.pokemon ?? []).map(nameOf));
const diff   = (a, b) => [...b].filter(x => !a.has(x));

const changes = [];
if (before) {
  const [pb, pa] = [poolOf(before), poolOf(after)];
  const [nb, na] = [setOf(before),  setOf(after)];
  const addedPool = diff(pb, pa), removedPool = diff(pa, pb);
  const addedMon  = diff(nb, na), removedMon  = diff(na, nb);

  if (before.regulation?.id !== after.regulation.id)
    changes.push(`レギュレーション: ${before.regulation?.id ?? '(なし)'} → ${after.regulation.id}`);
  if (addedPool.length)   changes.push(`ロースター追加 ${addedPool.length} 種 (species id: ${addedPool.join(', ')})`);
  if (removedPool.length) changes.push(`ロースター削除 ${removedPool.length} 種 (species id: ${removedPool.join(', ')})`);
  if (addedMon.length)    changes.push(`新規ポケモン ${addedMon.length} 件: ${addedMon.join('、')}`);
  if (removedMon.length)  changes.push(`消えたポケモン ${removedMon.length} 件: ${removedMon.join('、')}`);

  const nameById = new Map((after.pokemon ?? []).map(r => [r[7], r[0]]));
  if (addedPool.length)
    changes.push('  ↳ 追加された種: ' + addedPool.map(id => nameById.get(id) ?? `#${id}`).join('、'));
} else {
  changes.push('前回のデータがないため、差分なしで新規作成しました。');
}

console.log(changes.length ? '■ 差分\n' + changes.map(c => '  ' + c).join('\n') : '■ 差分なし（データは最新です）');

if (problems.length) console.log('\n■ 要対応\n' + problems.map(p => '  ! ' + p).join('\n'));

// --- 4. 反映 ---
if (CHECK) {
  if (backup) fs.writeFileSync(path('pokedata.json'), backup);   // --check は書き換えない
  console.log('\n--check のため index.html は更新していません。');
  process.exit(changes.length || problems.length ? 1 : 0);
}

execFileSync(process.execPath, ['build.mjs'], { cwd: here, stdio: 'inherit' });
execFileSync(process.execPath, ['test.mjs'],  { cwd: here, stdio: 'inherit' });
console.log('\n完了。index.html を再公開してください。');
if (problems.length) process.exit(1);
