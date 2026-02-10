# UTab Security & Access Control Roadmap

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
以下の許可フィールド以外は返さない。`createdBy` / `submittedBy` / `userDefinedData` / `user_defined_data` / `passwordHash` / `tournaments` は必ず遮断する。

| Resource | Public allowlist fields | Notes |
| --- | --- | --- |
| Tournament | `_id`, `name`, `style`, `total_round_num`, `current_round_num`, `auth.access.required` | `auth` のパスワード情報や `options` は非公開 |
| Team | `_id`, `tournamentId`, `name`, `institution`, `speakers` | `details` と `userDefinedData` は非公開 |
| Speaker | `_id`, `tournamentId`, `name` | `userDefinedData` は非公開 |
| Adjudicator | `_id`, `tournamentId`, `name` | `strength` / `preev` / `details` は非公開 |
| Venue | `_id`, `tournamentId`, `name` | `details` は非公開 |
| Institution | `_id`, `tournamentId`, `name` | `userDefinedData` は非公開 |
| Round | `_id`, `tournamentId`, `round`, `name`, `motions` | `teamAllocationOpened` / `adjudicatorAllocationOpened` は非公開 |
| Draw | `_id`, `tournamentId`, `round`, `drawOpened`, `allocationOpened`, `allocation` | `drawOpened=false` の場合 `allocation=[]` を返す。`allocationOpened=false` の場合は審判配席のみ非公開 |
| Result | `_id`, `tournamentId`, `round`, `payload` | `payload` 内は `user_defined_data` / `comment` 等の内部情報を除去 |
| Compiled | `_id`, `tournamentId`, `payload` | `payload` 内は内部情報を除去 |
| RawResults | 公開対象外 | 大会アクセスまたは管理者権限が必須 |

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
- /Users/neon/Desktop/utab/PLAN.md
- /Users/neon/Desktop/utab/docs/task11-validation.md

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
- /Users/neon/Desktop/utab/packages/server/src/models/user.ts
- /Users/neon/Desktop/utab/packages/server/src/models/tournament.ts
- /Users/neon/Desktop/utab/packages/server/src/models/tournament-member.ts (新規)
- /Users/neon/Desktop/utab/packages/server/src/middleware/auth.ts
- /Users/neon/Desktop/utab/packages/server/src/controllers/auth.ts
- /Users/neon/Desktop/utab/packages/server/src/controllers/tournament-users.ts
- /Users/neon/Desktop/utab/packages/server/src/routes/auth.ts
- /Users/neon/Desktop/utab/packages/server/src/routes/tournaments.ts

**テスト更新**
- /Users/neon/Desktop/utab/packages/server/test/integration.test.ts

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
- /Users/neon/Desktop/utab/packages/server/src/models/tournament.ts
- /Users/neon/Desktop/utab/packages/server/src/types/express-session.d.ts
- /Users/neon/Desktop/utab/packages/server/src/controllers/tournaments.ts
- /Users/neon/Desktop/utab/packages/server/src/routes/tournaments.ts
- /Users/neon/Desktop/utab/packages/server/src/middleware/auth.ts

**テスト更新**
- /Users/neon/Desktop/utab/packages/server/test/integration.test.ts

## Phase 3: APIアクセス制御の置換
**目標**
- 未認証ユーザーのDB書き込みを最小化する。
- 結果送信系は「大会アクセス必須」に統一。

**主要タスク**
- requireTournamentRole を廃止し、以下の判定に分離。
- requireTournamentView: 閲覧権限
- requireTournamentAccess: 結果送信権限
- requireTournamentAdmin: 管理者権限

**進捗（2026-02-08）**
- [x] `requireTournamentRole` を廃止し、`requireTournamentView` を追加。
- [x] 閲覧系ルート（teams/speakers/adjudicators/venues/institutions/rounds/draws/results/compiled/tournaments）を `requireTournamentView` に置換。
- [x] `raw-results` の GET を `requireTournamentAccess` に置換し、提出系と同じアクセス判定へ統一。
- [x] `pnpm -C packages/server test` で統合テストを実行し、回帰がないことを確認。

**編集候補ファイル**
- /Users/neon/Desktop/utab/packages/server/src/middleware/auth.ts
- /Users/neon/Desktop/utab/packages/server/src/routes/teams.ts
- /Users/neon/Desktop/utab/packages/server/src/routes/speakers.ts
- /Users/neon/Desktop/utab/packages/server/src/routes/adjudicators.ts
- /Users/neon/Desktop/utab/packages/server/src/routes/venues.ts
- /Users/neon/Desktop/utab/packages/server/src/routes/institutions.ts
- /Users/neon/Desktop/utab/packages/server/src/routes/rounds.ts
- /Users/neon/Desktop/utab/packages/server/src/routes/draws.ts
- /Users/neon/Desktop/utab/packages/server/src/routes/results.ts
- /Users/neon/Desktop/utab/packages/server/src/routes/compiled.ts
- /Users/neon/Desktop/utab/packages/server/src/routes/raw-results.ts
- /Users/neon/Desktop/utab/packages/server/src/routes/submissions.ts

**テスト更新**
- /Users/neon/Desktop/utab/packages/server/test/integration.test.ts

## Phase 4: 公開レスポンスの制限
**目標**
- 公開APIのレスポンスを安全な最小限に制限する。
- createdBy / submittedBy / userDefinedData 等の内部情報を遮断。

**主要タスク**
- 公開レスポンス用のサニタイズ関数を導入。
- コントローラの list/get 応答を DTO 化。

**進捗（2026-02-08）**
- [x] `packages/server/src/services/response-sanitizer.ts` を追加し、公開用 allowlist/sanitize を実装。
- [x] `tournaments/teams/speakers/adjudicators/venues/institutions/rounds/results/compiled/raw-results` の list/get を「非admin時のみ」公開DTOへ変換。
- [x] `draws` の公開レスポンスも DTO 化し、`drawOpened=false` 時の allocation 非公開と `allocationOpened=false` 時の配席隠蔽を実装。
- [x] 統合テストを更新し、公開レスポンスで内部フィールドが除去されることを検証。

**編集候補ファイル**
- /Users/neon/Desktop/utab/packages/server/src/services/response-sanitizer.ts (新規)
- /Users/neon/Desktop/utab/packages/server/src/controllers/teams.ts
- /Users/neon/Desktop/utab/packages/server/src/controllers/speakers.ts
- /Users/neon/Desktop/utab/packages/server/src/controllers/adjudicators.ts
- /Users/neon/Desktop/utab/packages/server/src/controllers/venues.ts
- /Users/neon/Desktop/utab/packages/server/src/controllers/institutions.ts
- /Users/neon/Desktop/utab/packages/server/src/controllers/rounds.ts
- /Users/neon/Desktop/utab/packages/server/src/controllers/results.ts
- /Users/neon/Desktop/utab/packages/server/src/controllers/compiled.ts
- /Users/neon/Desktop/utab/packages/server/src/controllers/raw-results.ts

**テスト更新**
- /Users/neon/Desktop/utab/packages/server/test/integration.test.ts

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
- /Users/neon/Desktop/utab/packages/server/src/app.ts
- /Users/neon/Desktop/utab/packages/server/src/config/environment.ts

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

**編集候補ファイル**
- /Users/neon/Desktop/utab/packages/server/src/app.ts
- /Users/neon/Desktop/utab/packages/server/src/routes/*.ts

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

**編集候補ファイル**
- /Users/neon/Desktop/utab/packages/server/src/models/audit-log.ts (新規)
- /Users/neon/Desktop/utab/packages/server/src/controllers/audit-logs.ts (新規)
- /Users/neon/Desktop/utab/packages/server/src/routes/audit-logs.ts (新規)
- /Users/neon/Desktop/utab/packages/server/src/controllers/*

**テスト更新**
- /Users/neon/Desktop/utab/packages/server/test/integration.test.ts

## Phase 8: 移行と回帰テスト
**目標**
- 既存大会データを安全に移行。
- 主要フローのリグレッションを防止。

**主要タスク**
- 大会パスワード未設定は「不要」扱いで移行。
- 既存ユーザーの大会メンバーシップを生成。
- 統合テストの更新と追加。

**進捗（2026-02-08）**
- [x] `packages/server/src/scripts/migrate-security-phase8.ts` を追加し、`migrate-security-phase8` コマンドを実装。
- [x] 旧形式 `auth.access.password` を `passwordHash` に移行し、パスワード未設定大会の `required` を `false` に補正。
- [x] `User.tournaments` と `Tournament.createdBy` から `TournamentMember` をバックフィル。
- [x] 統合テストに「Phase 8 移行（アクセス補正・パスワードハッシュ化・メンバーシップ移行・冪等性）」を追加。

**編集候補ファイル**
- /Users/neon/Desktop/utab/packages/server/test/integration.test.ts
- /Users/neon/Desktop/utab/README.md
- /Users/neon/Desktop/utab/PLAN.md
- /Users/neon/Desktop/utab/packages/server/src/scripts/migrate-security-phase8.ts (新規)
