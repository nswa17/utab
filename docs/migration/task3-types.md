# Task 3: TypeScript基盤と型定義方針

## tsconfig.base.json 方針

- Node 20 想定で ES2022 ターゲット、module/moduleResolution は NodeNext を採用。
- strict 系を有効化し、`types` に node を指定してグローバル型を提供。
- JSON import を許可し、JS ファイルはデフォルトで無効（必要なら各パッケージ側で上書き）。

## パッケージ別 tsconfig ひな型

- `packages/core/tsconfig.json`: declaration/declarationMap を有効にし、ライブラリ出力を想定。
- `packages/server/tsconfig.json`: 実行アプリケーション用。declaration 出力は無効。
- `packages/web/tsconfig.json`: フロントエンド用。declaration 出力は無効（Vite で別途設定予定）。

## 型定義戦略

- ルートに TypeScript ツールチェーン（typescript, @types/node, @types/underscore）を devDependencies 追加済み。
- 共有型は将来的に `@utab/types` パッケージまたは `packages/core` 内に `types/` ディレクトリを設けて集約する方針。
- パスエイリアス（例: `@utab/core` -> `packages/core/src`）は各パッケージの tsconfig で `paths` を設定予定。

## 次のアクション候補

1. `pnpm install` でツールチェーンを取得。（実施済み）
2. packages/core, packages/server, packages/web に個別の tsconfig.json を配置し、`extends`: "../../tsconfig.base.json" を設定。（実施済み）
3. 共有型パッケージを設計（Tournament/Team/Adjudicator などのドメイン型を定義）。
