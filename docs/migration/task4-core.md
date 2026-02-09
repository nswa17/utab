# Task 4: Core パッケージ移行（開始）

## 進捗

- `packages/core` を作成し、TypeScript ビルド前提のパッケージ設定を追加。
- 旧構造に対応するディレクトリとエントリーファイルを用意（allocations/controllers/results/general）。
- 依存関係は脆弱な旧パッケージを避け、暫定で `lodash-es`, `seedrandom`, `pino` を採用（今後ロジック移行時に精査）。
- general 配下を TypeScript へ移植: errors/loggers/math/tools を追加し、Pino ベースのロガーに置換。
- allocations 配下を TypeScript へ移植: sys, teams (filters/matchings/strict_matchings/checks), adjudicators (filters/matchings/traditional/checks), venues (checks) を反映。
- controllers 配下を移植: Mongoose スキーマと DBHandler を TypeScript 化し、Mongo コレクションへの依存を整理。
- results 配下を移植: checks と集計ロジック（speakers/teams/adjudicators）を TypeScript 化し、旧ロジックを踏襲。
- エントリ `TournamentHandler`/`CON` を TypeScript 化し、旧 `utab.js` の統合 API（draws/get, results.organize など）を移植。

## 現状のファイル

- パッケージ設定: [packages/core/package.json](packages/core/package.json)
- 共有 tsconfig 継承済み: [packages/core/tsconfig.json](packages/core/tsconfig.json)
- エントリ: [packages/core/src/index.ts](packages/core/src/index.ts)
- サブモジュール: allocations/controllers/results/general 各 index を実装
- 移植済みユーティリティ: [packages/core/src/general/errors.ts](packages/core/src/general/errors.ts), [packages/core/src/general/loggers.ts](packages/core/src/general/loggers.ts), [packages/core/src/general/math.ts](packages/core/src/general/math.ts), [packages/core/src/general/tools.ts](packages/core/src/general/tools.ts)
- 移植済みアロケーション: sys/teams/adjudicators/venues と各サブモジュール（filters, matchings, strict_matchings, checks, traditional_matchings）。
- 移植済みコントローラ: [packages/core/src/controllers/schemas.ts](packages/core/src/controllers/schemas.ts), [packages/core/src/controllers/handlers.ts](packages/core/src/controllers/handlers.ts)
- 移植済みリザルト: [packages/core/src/results/results.ts](packages/core/src/results/results.ts), [packages/core/src/results/checks.ts](packages/core/src/results/checks.ts)
- エントリ: [packages/core/src/index.ts](packages/core/src/index.ts)（TournamentHandler と公開 API 集約）、[packages/core/src/controllers/connection.ts](packages/core/src/controllers/connection.ts)

## 次のステップ案

1. results の周辺テスト（speakers/teams/adjudicators の集計・ランキング）を Vitest で追加。
2. controllers の Mongo 接続まわりを実環境の接続情報と合わせ、型定義を整理（必要なら `models/` ディレクトリ新設）。
3. 残る旧 `utab-core/src` からのロジック差分を洗い、型安全性を高めるリファクタを検討。
