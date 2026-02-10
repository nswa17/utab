# UTab PLAN

この PLAN は、ロードマップ実行のためのチェックリストです。
旧 tab-update ロードマップの内容は本ファイルに統合済みです。

## 0. 進捗サマリ

- [x] v2 モノレポ移行（基盤移行）
- [x] セキュリティロードマップ Phase 1-8
- [x] Tab 更新 先行実装 T01-T06
- [ ] 運用安定化 T07
- [ ] 追加ロードマップ T18-T22

## 1. 先行実装（完了済み）

- [x] T01 序数表記統一（R02）
- [x] T02 allocation 待機リスト表示切替（R14）
- [x] T03 allocation 公開前プレビュー（R15）
- [x] T04 Result/Submissions 表示改善（R06, R09, R10）
- [x] T05 表彰者コピー形式追加（R17）
- [x] T06 事前CSV拡張（availability/conflict 基本列）（R12）

## 2. 直近実装（P0）

### T07 負荷試験と閾値調整（R21）

- [ ] `scripts/load/submissions.k6.js` を用意
- [ ] submissions 集中時の許容値を測定（学校内 NAT 想定）
- [ ] `rate-limit` 設定値を実測ベースで再調整
- [ ] 再現手順と運用判断をドキュメント化

### T18 上書き修正 PIN（ラウンド別）

- [ ] 上書き時のみ `overwritePin` 必須化（初回提出は不要）
- [ ] `Round.userDefinedData.submission_overwrite_pin` 実装
- [ ] public API で PIN が露出しないことを確認
- [ ] ballot/feedback 双方の統合テスト追加

### T19 予選/アウトラウンド区分

- [ ] `Round.userDefinedData.stage` (`prelim|out`) を導入
- [ ] out 開始ラウンド以降の自動伝搬を実装
- [ ] 管理画面に stage 指定と表示バッジ追加
- [ ] 集計画面に stage フィルタ追加

### T20 `by_bubble` UI 露出停止

- [ ] allocation UI から `by_bubble` を除外
- [ ] デフォルト filter 設定から除外
- [ ] 回帰（既存 allocation 生成）を手動確認

## 3. 中期（P1）

### T08 提出済みバロット編集（R05）

- [ ] Submission 更新 API を追加
- [ ] 管理画面に編集導線を追加
- [ ] 監査ログ要件を満たす

### T09 ジャッジ組み合わせインポート（R13）

- [ ] ラウンド別取り込み UI/API を追加
- [ ] 不正データ時のエラー表示を統一

### T10 引き分け許容の集計仕様（R04）

- [ ] tie 時の勝敗点仕様を確定
- [ ] 仕様に沿って compiled を更新
- [ ] 回帰テスト追加

### T11 同名二重入力時の正規化（R07）

- [ ] 平均化ルールを確定
- [ ] compile 変換に実装
- [ ] 回帰テスト追加

### T12 内容/表現の分離入力・修正（R08）

- [ ] UI と API のデータ契約を確定
- [ ] 入力・編集画面を更新
- [ ] 既存データとの互換性確認

### T21 大会スナップショット export/import

- [ ] export API（JSON, schemaVersion 付き）
- [ ] import（clone 復元）API
- [ ] 管理画面導線（export/import）
- [ ] 互換性エラー（schema mismatch）テスト

## 4. 要検討（P2, コア変更含む）

### T13 ランキング優先度設定（R03）
- [ ] プリセット方式か完全可変方式か決定
- [ ] コア比較ロジックの変更範囲を確定

### T14 conflict 種別/優先度モデル（R11）
- [ ] データモデル（チーム/学校/地域）設計
- [ ] allocation フィルタ反映方式を決定

### T15 auto allocation 新要素（R16）
- [ ] 要件（同校分散/地域分散/履歴回避）を確定
- [ ] 性能影響を評価

### T22 順位優先度プリセット（集計）
- [ ] preset A/B/C の仕様確定
- [ ] UI/API/export まで一貫反映する設計

## 5. 運用チェック

- [ ] 主要導線の E2E スモーク（管理/参加者）
- [ ] セキュリティ回帰（アクセス制御、公開レスポンス）
- [ ] 負荷時の受け入れ基準を明文化
- [ ] リリース判定チェックリストを更新
