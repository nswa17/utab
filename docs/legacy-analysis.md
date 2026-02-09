# 現状分析レポート

## 🏗️ 旧アーキテクチャ概要

### utab-core（コアロジック）

- **言語**: JavaScript (ES6 with Babel)
- **Node.js**: 未指定（package.jsonには記載なし。utab-serverは8.9.1）
- **エントリポイント**: `utab.js`（`package.json`の`main`は`main.js`となっているが誤り）
- **主要機能**:
  - ディベート大会のドロー（対戦組み合わせ）アルゴリズム
  - チーム・ジャッジ・会場のアロケーション
  - 結果集計とランキング計算
  - Mongooseベースのデータベースハンドラー
- **依存パッケージ**:
  - mongoose: 4.6.8 → **重大な脆弱性あり**
  - babel-preset-es2015: 6.18.0 → **非推奨**
  - underscore: 1.8.3 → **古い**
  - winston: 2.3.0 → **古い**

### utab-server（APIサーバー）

- **言語**: JavaScript (CommonJS)
- **Node.js**: 8.9.1（EOL: 2019年12月） → **サポート終了**
- **フレームワーク**: Express 4.16.2
- **主要機能**:
  - RESTful API提供
  - 認証・セッション管理
  - 大会データCRUD操作
  - マルチテナント対応（大会ごとのDB分離）
  - `lib/utab-core`にコアロジックをコピーして保持（二重管理）
- **依存パッケージ**:
  - mongodb: 3.6.3 → **古い**
  - mongoose: 5.10.15 → **古い**
  - express-session: 1.15.6
  - blueimp-md5: 2.10.0（セキュリティ懸念）
- **課題**:
  - `app.js`内にDB名（`heroku_zm (一部Flowの設定ファイルあり)37jwvt`等）やURLがハードコードされている

### utab-view-future（フロントエンド）

- **言語**: JavaScript + Vue 2
- **Node.js**: >= 6（非常に古い）
- **フレームワーク**: Vue 2.5.2
- **ビルドツール**: Webpack 2.7.0
- **主要機能**:
  - 大会管理UI（管理者向け）
  - 投票・フィードバック入力（参加者向け）
  - リアルタイムドロー表示
  - 統計・グラフ表示（Highcharts）
- **依存パッケージ**:
  - element-ui: 2.0.5 → **Vue 2専用、Element Plusへ移行必要**
  - vue-router: 2.8.1 → **古い**
  - vuex: 2.5.0 → **古い**
  - webpack: 2.7.0 → **非常に古い**

## 🔍 主要な技術的問題点

1. **セキュリティリスク**
   - Node.js 8.9.1のサポート終了
   - MongoDB 3.x系の脆弱性
   - 古いmongooseバージョンの脆弱性
   - MD5ハッシュの使用（セキュリティ強度不足）

2. **保守性の問題**
   - JavaScriptのため型安全性がない
   - 3つの独立したリポジトリで依存関係管理が複雑
   - 古いビルドツールチェーン
   - テストカバレッジ不足

3. **開発体験の問題**
   - Webpack 2の遅いビルド速度
   - Vue 2の制限（Composition API未対応）
   - IDE補完の不足（型定義なし）
