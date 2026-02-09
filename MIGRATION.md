# 移行ガイド（v1 → v2）

## 破壊的変更

### 認証

- **旧**: MD5（脆弱）
- **新**: bcrypt

既存ユーザーは再ログイン時に再ハッシュ化が必要です。

### 実行環境

- Node.js: 20.11.0 以上
- MongoDB: 8.0 以上

## 移行手順

### 1. データベースバックアップ

```bash
mongodump --uri="mongodb://localhost:27017/your-db" --out=./backup
```

### 2. MongoDB アップグレード

```bash
docker-compose down
# docker-compose.yml の mongo:8.0 を利用
docker-compose up -d
```

### 3. 新バージョン起動

```bash
pnpm install
pnpm build
pnpm -C packages/server start
```

### 4. Phase 8 セキュリティ移行の実行（必須）

既存データに対して、以下を一括で移行します。

- `auth.access.required=true` かつパスワード未設定の大会を `required=false` に補正
- 旧形式 `auth.access.password` を `passwordHash` に変換し、平文パスワードを削除
- `User.tournaments` と `Tournament.createdBy` から `TournamentMember` をバックフィル

```bash
pnpm -C packages/server migrate-security-phase8
```

### 5. スタイルの再seed（既存スタイルを更新したい場合）

既存の `Style` コレクションを一度削除してから seed し直します。
カスタムスタイルがある場合は上書きされるため、必要ならバックアップしてください。

```bash
pnpm -C packages/server reset-styles
```

## API互換性

v2 は API 仕様を刷新しています。v1 クライアントは互換性がありません。
既存クライアントは v2 API に合わせてエンドポイントとリクエスト形式を更新してください。

## アロケーションの補足

- **審判が不足している場合**: `/api/draws/generate` と `/api/allocations/adjudicators` は
  チームのドロー／アロケーションを返しつつ、審判配席のみスキップします。
  返却される `allocation` 内の `chairs` / `panels` / `trainees` は空配列になります。
