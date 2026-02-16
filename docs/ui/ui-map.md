# UI Map (UTab)

## 画面一覧（ルートと対応コンポーネント）

### 認証
| 画面 | ルート | コンポーネント |
| --- | --- | --- |
| ログイン | `/login` | `packages/web/src/views/Login.vue` |
| 新規登録 | `/signup` | `packages/web/src/views/Signup.vue` |

### 管理画面
| 画面 | ルート | コンポーネント |
| --- | --- | --- |
| 管理ダッシュボード | `/admin` | `packages/web/src/views/admin/AdminHome.vue` |
| 大会レイアウト（シェル） | `/admin/:tournamentId` | `packages/web/src/views/admin/AdminTournament.vue` |
| 大会セットアップ | `/admin/:tournamentId/setup` | `packages/web/src/views/admin/AdminTournamentHome.vue` |
| ラウンド運営ハブ | `/admin/:tournamentId/operations` | `packages/web/src/views/admin/AdminRoundOperationsHub.vue` |
| ラウンド詳細設定 | `/admin/:tournamentId/operations/rounds` | `packages/web/src/views/admin/AdminTournamentRounds.vue` |
| ラウンド詳細（シェル） | `/admin/:tournamentId/rounds/:round` | `packages/web/src/views/admin/round/AdminRoundIndex.vue` |
| ラウンド割当 | `/admin/:tournamentId/rounds/:round/allocation` | `packages/web/src/views/admin/round/AdminRoundAllocation.vue` |
| ラウンド結果（生結果） | `/admin/:tournamentId/rounds/:round/result` | `packages/web/src/views/admin/round/AdminRoundResult.vue` |
| 提出一覧 | `/admin/:tournamentId/submissions` | `packages/web/src/views/admin/AdminTournamentSubmissions.vue` |
| 結果確定・レポート | `/admin/:tournamentId/reports` | `packages/web/src/views/admin/AdminTournamentCompiled.vue` |
| 結果（JSON） | `/admin/:tournamentId/results` | `packages/web/src/views/admin/AdminTournamentResults.vue` |

補足:
- `大会設定`（`/admin/:tournamentId/setup` の overview）では、参加者向け URL の QR コードを表示する（大会単位）。
- `大会設定` は「大会名」「スタイル」「大会公開」「大会パスワード設定」をカード化し、公開/パスワード設定はスイッチUIで操作する。
- `大会セットアップ` では `ラウンドデフォルト設定` を編集でき、以降に作成する新規ラウンドへ既定値として継承される。
- `ラウンドデフォルト設定` と各 `ラウンド詳細設定` のラウンド関連オプションは、`ラウンド設定` / `ブレイク基本方針` / `集計基本方針（集計設定）` の枠に分割して表示する。
- `大会セットアップ` では `新規ラウンド作成`（番号・名称・種別）を行う。ラウンド詳細の上書き設定は `ラウンド詳細設定` で扱う。
- `大会データ管理`の`入力方式`（手動入力/CSV取り込み）は、チーム/ジャッジ/会場/スピーカー/所属機関で共通の選択状態として扱う。
- 管理画面の検索結果（登録済み大会・大会データ管理・提出データ）は、名前に数字を含む場合も自然順で表示する。
- `大会レイアウト（シェル）`（`/admin/:tournamentId`）の上部タブは、`大会セットアップ` / `ラウンド運営` / `結果確定・レポート` の3区分で表示する。
- 互換URLとして `/admin/:tournamentId/home` は `/setup`、`/rounds` は `/operations`、`/compiled` は `/reports` へリダイレクトする。
- `admin UI v2` 機能フラグが OFF の場合は旧URL（`/home` `/rounds` `/compiled`）を主導線とし、各画面に `新画面へ移動` 導線を表示する。
- `VITE_ADMIN_UI_LEGACY_READONLY=true` の場合、旧主導線（`/home` `/rounds` `/compiled`）は読み取り専用表示となる。

### 参加者画面
| 画面 | ルート | コンポーネント |
| --- | --- | --- |
| 現在公開中の大会 | `/user` | `packages/web/src/views/user/UserHome.vue` |
| 大会レイアウト（シェル） | `/user/:tournamentId` | `packages/web/src/views/user/UserTournament.vue` |
| 大会ホーム | `/user/:tournamentId/home` | `packages/web/src/views/user/UserTournamentHome.vue` |
| 大会結果 | `/user/:tournamentId/results` | `packages/web/src/views/user/UserTournamentResults.vue` |
| 参加者レイアウト（役割） | `/user/:tournamentId/:participant(audience|speaker|adjudicator)` | `packages/web/src/views/user/participant/UserParticipantLayout.vue` |
| 参加者ホーム | `/user/:tournamentId/:participant/home` | `packages/web/src/views/user/participant/UserParticipantHome.vue` |
| ラウンドレイアウト | `/user/:tournamentId/:participant/rounds/:round` | `packages/web/src/views/user/participant/round/UserParticipantRoundLayout.vue` |
| ラウンド概要 | `/user/:tournamentId/:participant/rounds/:round/home` | `packages/web/src/views/user/participant/round/UserRoundHome.vue` |
| ラウンドドロー | `/user/:tournamentId/:participant/rounds/:round/draw` | `packages/web/src/views/user/participant/round/UserRoundDraw.vue` |
| スコアシート（シェル） | `/user/:tournamentId/:participant/rounds/:round/ballot` | `packages/web/src/views/user/participant/round/UserRoundBallot.vue` |
| スコアシート一覧 | `/user/:tournamentId/:participant/rounds/:round/ballot/home` | `packages/web/src/views/user/participant/round/ballot/UserRoundBallotHome.vue` |
| スコアシート入力 | `/user/:tournamentId/:participant/rounds/:round/ballot/entry` | `packages/web/src/views/user/participant/round/ballot/UserRoundBallotEntry.vue` |
| フィードバック（シェル） | `/user/:tournamentId/:participant/rounds/:round/feedback` | `packages/web/src/views/user/participant/round/UserRoundFeedback.vue` |
| フィードバック一覧 | `/user/:tournamentId/:participant/rounds/:round/feedback/home` | `packages/web/src/views/user/participant/round/feedback/UserRoundFeedbackHome.vue` |
| フィードバック入力 | `/user/:tournamentId/:participant/rounds/:round/feedback/:adjudicatorId` | `packages/web/src/views/user/participant/round/feedback/UserRoundFeedbackEntry.vue` |

補足:
- `大会レイアウト（シェル）`（`/user/:tournamentId`）では、大会名の左側に参加者アクセスURLのQRコードを表示する（クリックでURLコピー）。
- `大会レイアウト（シェル）` の参加者タブ（対戦表/スピーカー/ジャッジ）はセグメントUIで表示し、右側に同じトーンのカード/テーブル表示スイッチを表示する。
- 参加者の `対戦表` で、チーム割り当て/ジャッジ割り当ての片方のみ公開されている場合は、公開状態チップ（チーム: 公開/非公開、ジャッジ: 公開/非公開）を表示して非公開ロールの存在を明示する。

### ラウンド管理補足
- `ラウンド運営ハブ`（`/admin/:tournamentId/operations`）は、提出確認→集計→次ラウンド対戦生成→公開の固定ステップを表示する。
- `ラウンド運営ハブ` の `公開設定` では、`モーション公開` / `対戦表公開（チームのみ）` / `対戦表公開（ジャッジのみ）` をモーション入力エリア直下（保存済みモーション行）で横並びに操作する。
- `ラウンド運営ハブ` の `集計レポート` では、差分比較の基準選択はテーブル右上の小型セレクト（`過去の集計結果`）で行い、未選択時は `最新集計` を基準にする。
- `ラウンド運営ハブ` と `ラウンド割当` の対戦生成は、参照用の集計 `snapshot` を選択できる。第1ラウンドは `snapshot` なしでも実行可能で、第2ラウンド以降は前ラウンド集計を参照する。
- `ラウンド詳細設定`（`/admin/:tournamentId/operations/rounds`）から、従来のラウンド詳細設定（評価・ブレイク設定など）を編集する。
- `ラウンド詳細設定` は作成画面ではなく、既存ラウンドの上書き設定（公開状態、重み、評価設定、ブレイク詳細）の編集に集中する。
- `ラウンド詳細設定`の展開エリアは、ショートカット行の`ラウンド詳細設定`ボタン直下に表示する。
- `結果確定・レポート`（`/admin/:tournamentId/reports`）では、`過去の集計結果` を選択して比較・出力する。詳細再計算は `CompileOptionsEditor` を共通利用し、一覧テーブルは `SortHeaderButton` でソートできる。

## 主要フロー（簡易）
1. 大会作成: `/login` → `/admin`（新規大会作成） → `/admin/:tournamentId/setup`（大会設定/参加者ログイン設定） → `/admin/:tournamentId/operations`（ラウンド作成）
2. ラウンド編集: `/admin/:tournamentId/operations` → `/admin/:tournamentId/rounds/:round` → `/admin/:tournamentId/rounds/:round/allocation` または `/result`
3. 結果確認: `/admin/:tournamentId/submissions` → `/admin/:tournamentId/reports` → `/admin/:tournamentId/results`（参加者は `/user/:tournamentId/results`）
4. 参加者ログイン/入力: `/user` → `/user/:tournamentId/home`（ログインキー） → `/user/:tournamentId/:role/home` → `/rounds/:round/(draw|ballot|feedback)`

## 共通レイアウト
- グローバルヘッダー: `packages/web/src/components/common/AppHeader.vue`
- ルートレイアウト: `packages/web/src/App.vue`
- 共通トグルスイッチ: `packages/web/src/components/common/ToggleSwitch.vue`（大会セットアップ/ラウンド運営ハブで利用）
- 共通ソートヘッダ: `packages/web/src/components/common/SortHeaderButton.vue`（公開前プレビュー/集計レポートで利用）
- 共通コラプス見出し: `packages/web/src/components/common/CollapseHeader.vue`（大会セットアップ/ラウンド詳細設定で利用）
- 共通スナップショット選択: `packages/web/src/components/common/CompiledSnapshotSelect.vue`（大会結果レポート/自動生成モーダルで利用）
