# UTab Security & Access Control Roadmap

> 2026-02 時点の設計・実装ログです。現行運用では完了フェーズの参照資料として扱います。

## 目的
- 公開サービスとして運用しつつ、未認証ユーザーによるDB書き込みを最小化する。
- 大会ごとのパスワード制で、audience / speaker / adjudicator のアクセスを制御する。
- organizer の権限境界を大会単位にし、他大会への影響を遮断する。
- 公開APIのレスポンスを安全な最小限に制限する。
- レートリミットとDoS耐性、監査ログを導入する。

## 前提・決定事項
- 大会パスワードは「必須 / 不要」の2択。
- audience も大会パスワード設定に従う。
- superuser は固定の1アカウントのみ（自己登録不可）。
- organizer は自己登録可。
- organizer は複数大会を操作できるが、権限は自分が作成した大会または所属大会のみに限定。
- HTTPS はアプリ側ではなくリバースプロキシで終端する想定。

## 仕様の骨子
- 大会アクセスセッションを導入し、パスワード成功後に同じセッションで再入力不要にする。
- 大会パスワードが必須の場合、閲覧・結果送信の双方で大会アクセスが必要。パスワード不要の大会はアクセスを自動付与する。
- パスワード成功時は `req.session.tournamentAccess[tournamentId]` にタイムスタンプ/バージョンを保存し、24時間以内または非アクティブ2時間で切れるようにする。
- organizer / superuser は大会管理系APIの操作が可能だが、対象大会のメンバーシップ必須。

## Phase 0: 仕様確定とリスク棚卸し
**目標**
- 公開/非公開の閲覧仕様、結果送信仕様、公開レスポンス仕様を確定する。
- 監査ログのイベント種別を確定する。

**主要タスク**
- 大会アクセス仕様の最終確認。
- 公開レスポンスの許可フィールド定義。
- 監査ログの検索要件（期間、ユーザー、イベント、対象ID）。

**確定事項（2026-02-07）**

1. 大会アクセス/閲覧/送信の権限階層:
大会閲覧（View）は、`auth.access.required=false` の大会では未認証でも許可する。`auth.access.required=true` の大会では大会アクセスセッションまたは管理者権限が必要。
大会アクセス（Access）は、結果送信・提出系APIの前提とし、`auth.access.required` の値に関わらず大会アクセスセッションまたは管理者権限が必要。
大会管理（Admin）は、superuser もしくは大会メンバーシップを持つ organizer に限定する。

2. 大会アクセスセッションの扱い:
`/api/tournaments/:id/access` でパスワード検証に成功した場合、セッションに大会アクセスを保存する。
保存形式は `req.session.tournamentAccess[tournamentId] = { grantedAt, role? }` を基本とし、期限はセッション有効期間に準拠する。
ログアウト時は大会アクセスを含むセッションを破棄する。

3. 公開レスポンス許可フィールド（public view のみ適用）:

> **現行契約（2026-09-18）**: 2026-02-07 に確定した初期 allowlist は、その後の participant workflow と権限制御の変更で一部 obsolete になった。以下を現行の security contract とし、`packages/server/src/services/response-sanitizer.ts` と route middleware を実装上の source of truth とする。
>
> 「raw の `userDefinedData` / `user_defined_data` を公開しない」という原則は維持する。ただし Round は participant UI が必要とする設定だけを **新しい object として再構成して返す**。Tournament の `options` も style の participant-facing key だけを allowlist で再構成する。

| Resource | 現行 public/view contract | Notes |
| --- | --- | --- |
| Tournament | `_id`, `name`, `style`, `total_round_num`, `current_round_num`, `hidden`, `auth.access.required`; 必要な場合のみ `options.style.{team_num,score_weights,side_labels,side_labels_short,speaker_sequence,range,adjudicator_range,roles}` | password/hash、任意の `options`、raw `user_defined_data`、`createdBy` は public DTO に含めない |
| Team | `_id`, `tournamentId`, `name`, `template.speakers` | raw `template` の他 key、`details`、`userDefinedData` は非公開 |
| Speaker | `_id`, `tournamentId`, `name` | `userDefinedData` は非公開 |
| Adjudicator | `_id`, `tournamentId`, `name` | `preev` / `details` / `userDefinedData` は非公開 |
| Venue | `_id`, `tournamentId`, `name` | `details` / `userDefinedData` は非公開 |
| Institution | `_id`, `tournamentId`, `name` | category/priority と `userDefinedData` は public DTO では非公開 |
| Round | `_id`, `tournamentId`, `round`, `name`, `motions`, `motionOpened`, `teamAllocationOpened`, `adjudicatorAllocationOpened`, participant-safe `userDefinedData` subset | hidden round は非admin list から除外し direct get も 404。motions は `motionOpened=true` のときだけ返す。safe subset は `hidden`, `evaluate_from_adjudicators`, `evaluate_from_teams`, `chairs_always_evaluated`, `no_speaker_score`, `allow_low_tie_win`, `allow_score_winner_mismatch`, `score_by_matter_manner`, `poi`, `best`, `evaluator_in_team`, `ballot_submitter_roles` |
| Draw | `_id`, `tournamentId`, `round`, `drawOpened`, `allocationOpened`, sanitized `allocation` | 両方 closed なら `allocation=[]`。team draw だけ closed なら allocation rows は残すが team ids を空文字で mask し、`allocationOpened=true` なら chairs/panels/trainees は公開する。adjudicator allocation が closed ならそれらの配席は空配列。hidden round の Draw は非admin response から除外 |
| Result | public/view 対象外 | 現行 route は `requireTournamentAdmin` |
| Compiled | public/view 対象外 | 現行 route は `requireTournamentAdmin` |
| RawResults | public/view 対象外 | 現行 route は GET を含め `requireTournamentAdmin` |

`createdBy`, `submittedBy`, password material、ユーザーの大会 membership 一覧などの内部情報は public DTO に passthrough しない。Result/Compiled 用 sanitizer helper は残っているが、現行 HTTP route が public であることを意味しない。

4. 監査ログのイベント種別:
`auth.login` / `auth.logout` / `auth.register` / `tournament.create` / `tournament.update` / `tournament.delete` / `tournament.access.grant` / `tournament.access.revoke` /
`team.create` / `team.update` / `team.delete` / `speaker.create` / `speaker.update` / `speaker.delete` / `adjudicator.create` / `adjudicator.update` / `adjudicator.delete` /
`venue.create` / `venue.update` / `venue.delete` / `institution.create` / `institution.update` / `institution.delete` /
`round.create` / `round.update` / `round.delete` / `draw.create` / `draw.update` / `draw.delete` /
`submission.create` / `submission.update` / `submission.delete` / `result.create` / `result.update` / `result.delete` / `compiled.create`.

5. 監査ログの検索要件:
検索条件は `tournamentId`、`from/to` 日時、`actorUserId`、`action`、`targetType`、`targetId` を指定可能とする。
レスポンスは `createdAt` 降順でページング対応（`limit`/`cursor`）とし、`ip`/`userAgent`/`actorRole` を含める。

**編集候補ファイル**
- PLAN.md
- docs/migration/task11-validation.md

## Phase 1: 認証・権限制御の基盤改修
**目標**
- ロールを大会単位に移行し、権限境界を明確化する。
- organizer は大会メンバーシップに基づき操作可能。
- superuser は固定アカウントのみ。

**主要タスク**
- 大会メンバーシップモデルの追加。
- organizer の権限判定を「大会メンバーシップ必須」に変更。
- register で superuser が作成できないよう制限。

**進捗（2026-02-08）**
- [x] `TournamentMember` モデルを追加し、`tournamentId + userId` の一意制約を導入。
- [x] `requireTournamentAdmin` / `requireTournamentRole` を大会メンバーシップ参照へ変更。
- [x] `register` で `superuser` 作成を拒否。
- [x] 統合テストを更新し、`superuser` 自己登録拒否と「メンバーシップ剥奪後の organizer 操作拒否」を追加。

**編集候補ファイル**
- packages/server/src/models/user.ts
- packages/server/src/models/tournament.ts
- packages/server/src/models/tournament-member.ts (新規)
- packages/server/src/middleware/auth.ts
- packages/server/src/controllers/auth.ts
- packages/server/src/controllers/tournament-users.ts
- packages/server/src/routes/auth.ts
- packages/server/src/routes/tournaments.ts

**テスト更新**
- packages/server/test/integration.part*.test.ts

## Phase 2: 大会アクセスセッション（大会パスワード）
**目標**
- 大会パスワード必須/不要を実装し、大会アクセスセッションを発行する。パスワード入力後は同一セッション内で再入力不要にする。
- audience / speaker / adjudicator の結果送信はアクセスセッションまたは管理者権限でしか行えないようにする。

**主要タスク**
- `tournament.auth.access` に `required`, `passwordHash`, `version` を追加し、パスワード更新時に `version` をインクリメントして既存アクセスを失効させる。
- 大会アクセスセッションを `req.session.tournamentAccess[tournamentId] = { grantedAt, expiresAt, version }` 形式で保存し、24時間または非アクティブ2時間で自動更新。
- `/api/tournaments/:id/access` を追加してパスワード検証（enter/skip） → アクセス付与（既存アクセスの延長）を行う。成功時に `tournamentAccess` に `version` を保存。
- `/api/tournaments/:id/exit` を新設し、ユーザーがその大会のアクセスだけ取り消せるようにする。

**進捗（2026-02-08）**
- [x] `tournament.auth.access.required/passwordHash/version` のサーバー正規化と、パスワード変更時 `version` インクリメントを実装。
- [x] `req.session.tournamentAccess[tournamentId] = { grantedAt, expiresAt, version }` を導入し、24時間絶対期限・2時間非アクティブ期限を実装。
- [x] `/api/tournaments/:id/access`（`enter/skip`）と `/api/tournaments/:id/exit` を実装。
- [x] `/api/submissions/*` を「大会アクセス必須（管理者バイパス可）」へ変更。
- [x] 統合テストで「保護大会の閲覧/送信拒否」「access 成功後の許可」「exit とパスワード更新による失効」を追加。

**編集候補ファイル**
- packages/server/src/models/tournament.ts
- packages/server/src/types/express-session.d.ts
- packages/server/src/controllers/tournaments.ts
- packages/server/src/routes/tournaments.ts
- packages/server/src/middleware/auth.ts

**テスト更新**
- packages/server/test/integration.part*.test.ts

## Phase 3: APIアクセス制御の置換
**目標**
- 未認証ユーザーのDB書き込みを最小化する。
- 結果送信系は「大会アクセス必須」に統一。

**主要タスク**
- requireTournamentRole を廃止し、以下の判定に分離。
- requireTournamentView: 閲覧権限
- requireTournamentAccess: 結果送信権限
- requireTournamentAdmin: 管理者権限

**進捗（2026-02-08、履歴）**
- [x] `requireTournamentRole` を廃止し、`requireTournamentView` を追加。
- [x] 当時の閲覧系ルートを `requireTournamentView` に移行。
- [x] 当時は `raw-results` GET を `requireTournamentAccess` に移行。
- [x] `pnpm -C packages/server test` で統合テストを実行。

**現行差分（2026-09-18）**
- teams/speakers/adjudicators/venues/institutions/rounds/draws の participant-facing read と Tournament の direct get は `requireTournamentView` 系の境界を使う。Tournament list は公開可視性フィルタ + public DTO で返す。
- results / compiled / raw-results は GET を含め `requireTournamentAdmin`。2026-02 の「results/compiled は閲覧系」「raw-results GET は Access」という記述は履歴であり、現行権限仕様ではない。

**編集候補ファイル**
- packages/server/src/middleware/auth.ts
- packages/server/src/routes/teams.ts
- packages/server/src/routes/speakers.ts
- packages/server/src/routes/adjudicators.ts
- packages/server/src/routes/venues.ts
- packages/server/src/routes/institutions.ts
- packages/server/src/routes/rounds.ts
- packages/server/src/routes/draws.ts
- packages/server/src/routes/results.ts
- packages/server/src/routes/compiled.ts
- packages/server/src/routes/raw-results.ts
- packages/server/src/routes/submissions.ts

**テスト更新**
- packages/server/test/integration.part*.test.ts

## Phase 4: 公開レスポンスの制限
**目標**
- 公開APIのレスポンスを安全な最小限に制限する。
- createdBy / submittedBy / raw userDefinedData 等の内部情報を遮断し、participant に必要な設定だけ明示 allowlist で再構成する。

**主要タスク**
- 公開レスポンス用のサニタイズ関数を導入。
- コントローラの list/get 応答を DTO 化。

**進捗（2026-02-08、履歴）**
- [x] `packages/server/src/services/response-sanitizer.ts` を追加し、公開用 allowlist/sanitize を実装。
- [x] 当時の非admin read を公開DTOへ変換。
- [x] `draws` の公開レスポンスを DTO 化。
- [x] 統合テストで内部フィールドの除去を検証。

**現行差分（2026-09-18）**
- public DTO の正確な field contract は上記「現行契約」を参照する。
- Tournament style override と Round の participant-safe flags は、raw object passthrough ではなく allowlist で再構成して公開する。
- Draw は `drawOpened` と `allocationOpened` を独立に扱う。team draw が closed でも adjudicator allocation が open なら team ids を mask した allocation rows と配席を返す。
- results / compiled / raw-results は現在 admin-only のため、通常の participant public DTO endpoint ではない。

**編集候補ファイル**
- packages/server/src/services/response-sanitizer.ts (新規)
- packages/server/src/controllers/teams.ts
- packages/server/src/controllers/speakers.ts
- packages/server/src/controllers/adjudicators.ts
- packages/server/src/controllers/venues.ts
- packages/server/src/controllers/institutions.ts
- packages/server/src/controllers/rounds.ts
- packages/server/src/controllers/results.ts
- packages/server/src/controllers/compiled.ts
- packages/server/src/controllers/raw-results.ts

**テスト更新**
- packages/server/test/integration.part*.test.ts

## Phase 5: HTTPS / CORS / CSRF
**目標**
- HTTPS 終端を前提に安全なセッション設定を確立する。
- CORS をホワイトリスト制に統一。
- CSRF を抑止。

**主要タスク**
- trust proxy と secure cookie の設定を本番前提に修正。
- CORS_ORIGIN を必須にし、true 許可を廃止。
- Origin/Referer チェックか CSRF トークン方式を追加。

**進捗（2026-02-08）**
- [x] `app.set('trust proxy', isProd ? 1 : false)` と `session.proxy` を設定し、`secure` cookie を本番前提で明示。
- [x] `CORS_ORIGIN` を必須化し、カンマ区切り whitelist 判定へ変更（`origin: true` を廃止）。
- [x] `Origin/Referer` を検証する CSRF ミドルウェアを追加し、状態変更メソッド（POST/PUT/PATCH/DELETE）に適用。
- [x] 統合テストに「許可Originのpreflight成功」「非許可Originの拒否」「非許可OriginでのPOST拒否」を追加。

**編集候補ファイル**
- packages/server/src/app.ts
- packages/server/src/config/environment.ts

## Phase 6: レートリミットとDoS耐性
**目標**
- 認証・結果送信の濫用を抑止。
- 大量リクエストへの耐性を上げる。

**主要タスク**
- express-rate-limit と express-slow-down を導入。
- /auth, /submissions, /raw-results を強めに制限。
- ボディサイズ制限のルート別調整。
- 一覧APIのページング導入を検討。

**進捗（2026-02-08）**
- [x] `express-rate-limit` と `express-slow-down` を導入し、API全体＋ `/auth` `/submissions` `/raw-results` に段階的な制限を追加。
- [x] `express.json` をルート別制限に変更（`/auth` 32kb、`/submissions` 256kb、`/raw-results` 1mb、その他 `/api` 256kb）。
- [x] ボディサイズ超過を適切に返すため、エラーハンドラで `err.status` を尊重するよう修正。
- [x] 統合テストに「CORS/Origin拒否」と「JSONボディサイズ超過(413)」を追加。
- [x] 一覧APIのページングは「監査ログAPI（Phase 7）」と既存一覧API改修（Phase 8）の2段階で導入する方針に確定（Phase 6 では方針策定まで）。

**運用Runbook（2026-02-12）**
- [x] レートリミットとJSONボディサイズを環境変数化し、デプロイ後の閾値調整をコード変更なしで実施可能にした。
- [x] `submissions` の既定値を NAT 集中提出に合わせて緩和（`max=240/5min`, `delayAfter=40`）し、低負荷時のスループット確保と高負荷時の抑制を両立。
- 推奨の監視指標:
  - `429` 比率（`/api/submissions/*`, `/api/compiled`）  
  - P95/P99 レイテンシ（提出ピーク時）  
  - compile 実行時間（100チーム超大会）
- 初期の閾値調整手順:
  1. 直近ピーク30分の `429` 比率が 1% を超える場合は `RATE_LIMIT_SUBMISSIONS_MAX` を段階的に +20%。
  2. API 遅延が増加する場合は `RATE_LIMIT_SUBMISSIONS_DELAY_STEP_MS` を +20〜50ms で調整。
  3. 認証総当たりが増える場合は `RATE_LIMIT_AUTH_MAX` を引き下げ、`RATE_LIMIT_AUTH_DELAY_STEP_MS` を増やす。
  4. JSON超過(413)が頻発する場合のみ、用途別に `JSON_LIMIT_*` を最小限で拡張する。

**主な環境変数（抜粋）**
- `RATE_LIMIT_SUBMISSIONS_WINDOW_MS` / `RATE_LIMIT_SUBMISSIONS_MAX` / `RATE_LIMIT_SUBMISSIONS_DELAY_AFTER`
- `RATE_LIMIT_AUTH_WINDOW_MS` / `RATE_LIMIT_AUTH_MAX` / `RATE_LIMIT_AUTH_DELAY_AFTER`
- `RATE_LIMIT_RAW_RESULTS_WINDOW_MS` / `RATE_LIMIT_RAW_RESULTS_MAX` / `RATE_LIMIT_RAW_RESULTS_DELAY_AFTER`
- `JSON_LIMIT_AUTH` / `JSON_LIMIT_SUBMISSIONS` / `JSON_LIMIT_RAW_RESULTS` / `JSON_LIMIT_DEFAULT`

**編集候補ファイル**
- packages/server/src/app.ts
- packages/server/src/routes/*.ts

## Phase 7: 監査ログ
**目標**
- 大会単位での監査ログ記録と検索閲覧を実現。

**主要タスク**
- 監査ログモデルを追加。
- 主要な作成/更新/削除イベントにログを追加。
- 検索APIを実装し、検索条件を提供。

**進捗（2026-02-08）**
- [x] `AuditLog` モデルを追加し、`tournamentId/action/actor/target/createdAt` を検索しやすいインデックスを定義。
- [x] 監査ログ自動記録ミドルウェアを追加し、`auth` / `tournaments` / `teams` / `speakers` / `adjudicators` / `venues` / `institutions` / `rounds` / `draws` / `submissions` / `results` / `compiled` の主要な作成・更新・削除イベントを記録。
- [x] `/api/audit-logs` を新設し、`tournamentId` `from/to` `actorUserId` `action` `targetType` `targetId` `limit/cursor` で検索できるように実装。
- [x] 統合テストに「監査ログ記録」「フィルタ検索」「カーソルページング」「権限制御」を追加。
- [x] 監査対象の mutation は、処理開始前に `AuditLog(outcome=pending)` を永続化する。予約保存に失敗した場合は mutation を開始せず 503 で fail-closed とする。
- [x] mutation 完了後は同じ監査レコードを `succeeded` / `failed` に確定する。確定更新が失敗しても durable な `pending` レコードを残し、既に実行済みの mutation を監査失敗だけを理由に再試行させない。
- [x] したがって監査ログは best-effort telemetry ではなく、監査対象 mutation に対して「副作用開始前に少なくとも1件の durable audit record が存在する」ことを保証する。プロセスクラッシュ等で outcome 確定前に停止した場合は `pending` が未確定操作の証跡となる。

**編集候補ファイル**
- packages/server/src/models/audit-log.ts (新規)
- packages/server/src/controllers/audit-logs.ts (新規)
- packages/server/src/routes/audit-logs.ts (新規)
- packages/server/src/controllers/*

**テスト更新**
- packages/server/test/integration.part*.test.ts

## Phase 8: 移行と回帰テスト
**目標**
- 既存大会データを安全に移行。
- 主要フローのリグレッションを防止。

**主要タスク**
- 大会パスワード未設定は「不要」扱いで移行。
- 既存ユーザーの大会メンバーシップを生成。
- 統合テストの更新と追加。

**進捗（2026-02-08）**
- [x] 起動時データメンテナンスをサービス化し、自動実行へ移行。
- [x] 旧形式 `auth.access.password` を `passwordHash` に移行し、パスワード未設定大会の `required` を `false` に補正。
- [x] `User.tournaments` と `Tournament.createdBy` から `TournamentMember` をバックフィル。
- [x] 統合テストに「Phase 8 移行（アクセス補正・パスワードハッシュ化・メンバーシップ移行・冪等性）」を追加。

**編集候補ファイル**
- packages/server/test/integration.part*.test.ts
- README.md
- PLAN.md
- packages/server/src/services/startup-data-maintenance.service.ts
- packages/server/src/services/tournament-access-maintenance.service.ts
- packages/server/src/services/tournament-membership-maintenance.service.ts
