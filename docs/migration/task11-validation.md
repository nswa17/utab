# Task 11: 動作確認と最終調整

## 1. 統合テストシナリオ（手動）

- [x] 管理者ユーザー作成・ログイン
- [x] 大会作成
- [x] チーム登録（スピーカー含む）
- [x] ジャッジ登録
- [x] ラウンド作成 / ドロー保存
- [x] 参加者バロット提出
- [x] 参加者フィードバック提出
- [x] 集計（Compiled Results）作成・確認
- [ ] 大会パスワード必須時、未認証の閲覧が拒否される
- [ ] 大会アクセス取得後のみ、結果送信が許可される
- [ ] 大会パスワード不要時、閲覧は許可されるが結果送信はアクセス必須
- [ ] organizer が所属大会以外を操作できない（403）
- [ ] register で superuser が作成できない
- [ ] 公開レスポンスから内部フィールドが除去される
- [ ] 監査ログが記録され、検索条件で取得できる

## 2. 自動テスト

```bash
# Core
pnpm -C packages/core test

# Server
pnpm -C packages/server test

# Web（テストが無い場合でも pass になる設定）
pnpm -C packages/web test
```

## 3. Docker 起動確認

```bash
docker-compose up -d --build
```

### ヘルスチェック

- Web: http://localhost:8080
- API: http://localhost:3000/api/health

## 4. セキュリティ / 依存監査

```bash
pnpm audit
```

> **注意**: `vue-template-compiler` の脆弱性が `vue-tsc` 経由で残る場合があります。  
> Vue 2 系の依存でパッチ版が存在しないため、現時点では **開発時のみの依存** として許容しています。

## 5. セキュリティ検証（アクセス制御）

- [ ] public view で `createdBy` / `submittedBy` / `userDefinedData` / `user_defined_data` が返らない
- [ ] `/api/tournaments/:id/access` でアクセスセッションが付与される
- [ ] access セッション無しで結果送信が拒否される
- [ ] audit log に `tournament.access.grant` が残る

## 6. パフォーマンス（簡易）

必要であれば `autocannon` や `k6` で API の簡易負荷テストを実施。

```bash
npx autocannon -c 20 -d 10 http://localhost:3000/api/health
```

---

### チェックリスト

- [x] 全パッケージの build 成功（`pnpm build`）
- [x] 全テストパス（core/server/web）
- [x] Docker で起動できる
- [x] API / Web が表示される
- [x] 認証フローが動く
- [x] データが永続化される
- [x] Lint/Format（`pnpm lint` / `pnpm format`）
- [x] Web の型チェック（`tsc -p packages/web/tsconfig.lint.json --noEmit` / Node 20.11.0）
