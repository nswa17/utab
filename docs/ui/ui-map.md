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
| 大会設定 | `/admin/:tournamentId/home` | `packages/web/src/views/admin/AdminTournamentHome.vue` |
| ラウンド一覧 | `/admin/:tournamentId/rounds` | `packages/web/src/views/admin/AdminTournamentRounds.vue` |
| ラウンド詳細（シェル） | `/admin/:tournamentId/rounds/:round` | `packages/web/src/views/admin/round/AdminRoundIndex.vue` |
| ラウンド割当 | `/admin/:tournamentId/rounds/:round/allocation` | `packages/web/src/views/admin/round/AdminRoundAllocation.vue` |
| ラウンド結果（生結果） | `/admin/:tournamentId/rounds/:round/result` | `packages/web/src/views/admin/round/AdminRoundResult.vue` |
| 提出一覧 | `/admin/:tournamentId/submissions` | `packages/web/src/views/admin/AdminTournamentSubmissions.vue` |
| 集計結果 | `/admin/:tournamentId/compiled` | `packages/web/src/views/admin/AdminTournamentCompiled.vue` |
| 結果（JSON） | `/admin/:tournamentId/results` | `packages/web/src/views/admin/AdminTournamentResults.vue` |

補足:
- `大会設定`（`/admin/:tournamentId/home` の overview）では、参加者向け URL の QR コードを表示する（大会単位）。
- `大会設定` は「大会名」「スタイル」「大会公開」「大会パスワード設定」をカード化し、公開/パスワード設定はスイッチUIで操作する。
- `大会データ管理`の`入力方式`（手動入力/CSV取り込み）は、チーム/ジャッジ/会場/スピーカー/所属機関で共通の選択状態として扱う。
- 管理画面の検索結果（登録済み大会・大会データ管理・提出データ）は、名前に数字を含む場合も自然順で表示する。
- `大会レイアウト（シェル）`（`/admin/:tournamentId`）の上部タブ（大会設定/ラウンド管理/大会データ管理/レポート生成）は、セグメントUIで統一表示する。

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

### ラウンド管理補足
- `ラウンド一覧`（`/admin/:tournamentId/rounds`）の`対戦表設定`は、`/admin/:tournamentId/rounds/:round/allocation`へページ遷移する。
- `ラウンド一覧`（`/admin/:tournamentId/rounds`）の`提出データ閲覧`は、`/admin/:tournamentId/submissions?round=:round`へページ遷移する。
- `ラウンド詳細設定`の展開エリアは、ショートカット行の`ラウンド詳細設定`ボタン直下に表示する。

## 主要フロー（簡易）
1. 大会作成: `/login` → `/admin`（新規大会作成） → `/admin/:tournamentId/home`（大会設定/参加者ログイン設定） → `/admin/:tournamentId/rounds`（ラウンド作成）
2. ラウンド編集: `/admin/:tournamentId/rounds` → `/admin/:tournamentId/rounds/:round` → `/admin/:tournamentId/rounds/:round/allocation` または `/result`
3. 結果確認: `/admin/:tournamentId/submissions` → `/admin/:tournamentId/compiled` → `/admin/:tournamentId/results`（参加者は `/user/:tournamentId/results`）
4. 参加者ログイン/入力: `/user` → `/user/:tournamentId/home`（ログインキー） → `/user/:tournamentId/:role/home` → `/rounds/:round/(draw|ballot|feedback)`

## 共通レイアウト
- グローバルヘッダー: `packages/web/src/components/common/AppHeader.vue`
- ルートレイアウト: `packages/web/src/App.vue`
