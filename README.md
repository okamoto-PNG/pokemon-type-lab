# タイプ相性ラボ

Pokémon Champions のレギュレーションに沿って、6体パーティの弱点・耐性を計算するツール。

公開ページ: https://claude.ai/artifact/EyZkRFXShPsoAenXuPnJ42

`index.html` は単体で完結しているので、ダブルクリックでも動く。実行時の通信はゼロ。

## 新しいレギュレーションが来たときの手順

1. `regulations.json` の `sets` に 1 ブロック足して、`current` をその id に変える。

   ```json
   {
     "id": "M-D",
     "label": "レギュレーション M-D",
     "game": "Pokémon Champions",
     "start": "2026-12-02",
     "end": "2027-03-xx",
     "pool": { "source": "pokedex", "pokedexId": 36, "versionGroupId": 32 },
     "megaRule": "learnset-with-overrides",
     "rules": { "format": "doubles", "teamMin": 4, "teamMax": 6, "bring": 4,
                "level": 50, "speciesClause": true, "itemClause": true, "restrictedMax": 0 },
     "formOverrides": { "allow": [], "deny": [] },
     "sources": ["公式のレギュレーション表 URL"]
   }
   ```

   **使用可能ポケモンの一覧は書かなくてよい。** PokéAPI の図鑑（`pokedex id = 36`、内部名 `champions`）と
   習得表（`version group 32`）からビルド時に解決する。`formOverrides` は空で始めてよく、
   `node update.mjs` の出力を見て足りないフォルムがあれば後から足す。
   古いレギュレーションのブロックは `"pool": null` にして残しておけば履歴になる。

2. 取り込む。

   ```
   node update.mjs
   ```

   前回との差分（ロースターの増減、新規ポケモン名、レギュレーション切り替わり）を表示してから、
   `pokedata.json` と `index.html` を再生成し、テストまで走らせる。

3. `index.html` を再公開する。

### 更新が必要かどうかだけ見たいとき

```
node update.mjs --check
```

ファイルを書き換えずに差分と要対応事項だけ出す。差分または要対応があれば終了コード 1 を返すので、
定期実行して「変化があったときだけ通知」に使える。

`regulations.json` の `end` を過ぎていると `要対応` として警告する。PokéAPI 側のロースターが
先に更新されることもあるので、`--check` で差分が出たら手順 1 から進める。

## ファイル構成

| ファイル | 役割 |
|---|---|
| `regulations.json` | レギュレーションの定義（期間・ルール・プールの引き先・フォルム補正）。**手で編集するのはここだけ** |
| `build-data.mjs` | PokéAPI GraphQL から取得して `pokedata.json` を作る |
| `pokedata.json` | 埋め込むデータのスナップショット |
| `app.template.html` | アプリ本体。`__DATA__` がデータの差し込み位置 |
| `build.mjs` | テンプレートにデータを埋めて `index.html` を出力。ロジック部を `logic.mjs` に切り出す |
| `test.mjs` | 相性計算・レギュレーション判定のテスト |
| `update.mjs` | 上記をまとめて回す更新パイプライン |

`app.template.html` の 1〜4.5 章は DOM に触らない純粋関数なので、`build.mjs` が
`logic.mjs` として切り出し、`test.mjs` がそれをそのまま import してテストしている。
アプリ本体とテスト対象が同一で、コピーが存在しない。

## わかっている制約

- **フォルム単位の可否は3つの情報源を重ねて出している。**
  1. 図鑑 (`pokedex 36`) … 種の在否。最新。
  2. 習得表 (`version group 32`) … 姿の在否。図鑑より更新が遅れる。
  3. `regulations.json` の `formOverrides` … 1も2も間に合っていない分を手で補正。
  ロースターに入ったばかりで習得表がまだ無い種は、取りこぼさないよう種単位で使用可としている。
  `formOverrides` のスラッグが1件も一致しないとビルド時に警告が出る。
- **とくせいと持ち物は、相性に効くものだけ扱う。**
  とくせいは相性を書き換える20件（ふゆう・もらいび・あついしぼう・ハードロック等）を倍率に反映。
  持ち物は半減きのみ18種＋ふうせん・くろいてっきゅう・ねらいのまと。
  半減きのみは1回限りなので倍率には混ぜず、セルに `⇒` で併記するだけ（危険度判定にも含めない）。
  たべのこし・とつげきチョッキなど相性に効かない持ち物は、あえて入れていない（マトリクスが1マスも動かないため）。
- 種族値・技・テラスタル・天候は扱わない。ダメージ計算機ではない。
- 終了済みレギュレーション（M-A / M-B）のプールは再現できない。PokéAPI は最新ロースターしか持たない。

## 開発

```
node build-data.mjs   # データ取得のみ
node build.mjs        # index.html 生成のみ
node test.mjs         # テストのみ
node update.mjs       # 取得 → 差分表示 → 生成 → テスト
```
