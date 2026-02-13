# Tabbycat チーム配置（予選ドロー）アルゴリズム概要

UTab 側で「ブレイク/シード」や「予選のチーム配置」を設計するために、Tabbycat のコード（本リポジトリ同梱）から要点だけ抜き出してまとめたメモ。

## 参照コード（UTab repo 内）

- 予選（power pairing）:
  - `tabbycat/tabbycat/draw/generator/powerpair.py`
  - `tabbycat/tabbycat/draw/generator/one_up_one_down.py`
  - `tabbycat/tabbycat/draw/generator/graph.py`
- アウトラウンド（elimination）:
  - `tabbycat/tabbycat/draw/generator/elimination.py`
  - `tabbycat/tabbycat/draw/generator/utils.py`

## 全体像（Power-paired draw）

Tabbycat の power pairing は「ブラケット（勝敗点=points）→ペアリング→衝突回避→サイド割当」の段階設計になっている。

1. **入力**
   - standings 上の並びを持つ Team リスト（`team.points` が第 1 指標として使われる）
   - 同校/過去対戦などの衝突判定に必要な属性（例: `institution`, `seen()`）
2. **ブラケット作成**
   - `points` が同じチームをまとめ、`OrderedDict[points] -> [teams...]` を作る
3. **奇数ブラケット解消（odd bracket resolution）**
   - ブラケット内が奇数のときに次ブラケットへ **pull-up** するか、**intermediate bracket**（`points + 0.5`）を作る
4. **ペアリング生成**
   - ブラケットごとに `Pairing` を作る（`slide` / `fold` / `random` など）
5. **衝突回避（avoid_conflicts）**
   - `one_up_one_down`（上下の対戦と swap）や `graph`（最小コストマッチング）で衝突を減らす
6. **サイド割当**
   - AFF/NEG を決める（サイド偏り等を目的関数に入れて最適化）
7. **フラグ付け**
   - pull-up などのイベントをフラグとして残し、画面表示や運用判断に使えるようにしている

## 重要オプション（powerpair.py）

- `odd_bracket`
  - `pullup_top|pullup_bottom|pullup_random|...`
  - `intermediate|intermediate_bubble_up_down`
- `pullup_restriction`
  - `none|least_to_date|lowest_ds_wins|lowest_ds_speaks`
- `pairing_method`
  - `slide|fold|random|adjacent|...`
- `avoid_conflicts`
  - `off|one_up_one_down|graph`

## odd bracket（奇数ブラケット）処理の考え方

- **pull-up 系**
  - 奇数になったブラケットから 1 チームを「次ブラケットへ移動」して偶数化する
  - `pullup_restriction` で「誰を pull-up しやすいか」を制御できる（例: pull-up 回数が少ない順）
- **intermediate bracket 系**
  - `points+0.5` の中間ブラケットを作り、「奇数の末尾」と「次ブラケットの先頭」を対戦させる
  - `intermediate_bubble_up_down` は中間ブラケットで衝突が出た場合に swap を試みる

## 衝突回避（one-up-one-down / graph）

- **one-up-one-down**
  - 衝突している対戦を「一つ上/下の対戦」と入れ替えることで衝突を減らす（ルールベースの swap）
- **graph**
  - ブラケット内のチームを頂点としたグラフを作り、衝突や不都合を **コスト** にして最小化するマッチングを求める
  - 「局所 swap では解決できないケース」に強い反面、実装/理解は重い

## アウトラウンド（elimination）: 非 2^k の break を bye で成立させる

Tabbycat の elimination generator は **break size が 2 の冪でなくても** 1st outround を作れる設計になっている。

- 例: break 24
  - 上位 8 シードが bye（次ラウンドへ）
  - 下位 16 チームで 8 試合 → 勝者 8 が上位 8 と合流して 16（=2^k）にする
- ペアリングは基本 **fold**（`1 vs N, 2 vs N-1 ...`）で、以後は勝ち上がりで進行する

## UTab（現状）との大きな違い（参考）

- UTab core のチーム配置は「フィルタの順/重みから相手の選好順を作り、Gale–Shapley でマッチング」する方式
- Tabbycat は「ブラケットで強さ順を固定 → その枠内で swap/最適化 → side を最適化」という段階方式

この違いにより、Tabbycat の方が「ブラケット/シード/bye」と相性がよく、アウトラウンド設計の参考にしやすい。

