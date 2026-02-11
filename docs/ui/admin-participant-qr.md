# Admin Participant QR

## 概要

- 管理ダッシュボード（`/admin`）には QR を表示しない。
- 各大会の管理ページ（`/admin/:tournamentId`）に、参加者向けアクセス QR を表示する。
- 管理者が複数大会を運用する前提で、大会ごとに QR を切り替えず自動で対象大会 URL を生成する。

## 表示位置

- 画面: `packages/web/src/views/admin/AdminTournament.vue`
- 表示ブロック: 重複提出警告・大会お知らせの下、タブナビゲーションの上

## URL 生成仕様

- 生成先: `/user/:tournamentId/home`
- ベース URL: `window.location.origin`（管理者が実際にアクセスしている URL をそのまま使用）
  - 例: 管理者が `https://tab.pdpda.org` でアクセスしていれば、配布URLも `https://tab.pdpda.org/user/:tournamentId/home`

## 操作

- QR 画像表示（クライアントサイド生成）
- URL のコピー
- 参加者画面を新規タブで開く

## 既存仕様との関係

- 大会アクセスパスワードが有効な大会でも、遷移先は従来どおり `UserTournamentHome` がパスワード入力を処理する。
