# UI Inventory (UTab)

## 共通コンポーネント（現状）
| コンポーネント | ファイル | 使用箇所 | 備考 |
| --- | --- | --- | --- |
| AppHeader | `packages/web/src/components/common/AppHeader.vue` | `packages/web/src/App.vue` | 管理/参加者リンク、言語切替、ログイン状態表示。
| LoadingState | `packages/web/src/components/common/LoadingState.vue` | 管理・参加者の複数画面 | ローディング表示はこのコンポーネントに集約。
| ResultsEditor | `packages/web/src/components/results/ResultsEditor.vue` | `AdminTournamentResults.vue`, `UserTournamentResults.vue` | JSON 直接編集 UI。タイトルは props で指定。
| Slides | `packages/web/src/components/slides/Slides.vue` | `AdminTournamentCompiled.vue` | 結果スライド表示の入口。
| SlideShow | `packages/web/src/components/slides/SlideShow.vue` | `Slides.vue` | スライド操作 UI。左右ボタン/閉じる。
| mstat チャート群 | `packages/web/src/components/mstat/*` | `AdminTournamentCompiled.vue` | Highcharts で統計表示。
| 未使用コンポーネント | `DraggableList.vue`, `FlexibleInput.vue`, `InputLabel.vue`, `LinkList.vue`, `LinkListItem.vue`, `LoadingContainer.vue`, `NumberBox.vue` | 参照なし（`components.d.ts` のみ） | 共通部品が未利用の状態。統合候補。

## グローバル CSS ユーティリティ
| クラス | 定義 | 使用傾向 |
| --- | --- | --- |
| `.card` | `packages/web/src/styles.css` | ほぼ全画面でカード枠に使用。
| `.stack` | `packages/web/src/styles.css` | 縦積みの余白用。
| `.row` | `packages/web/src/styles.css` | 横並びの基本。
| `.muted` | `packages/web/src/styles.css` | 補助文・弱い文字色。
| `.primary` | `packages/web/src/styles.css` | 主要ボタン。各画面で上書き定義あり。
| `.ghost` | `packages/web/src/styles.css` | サブボタン/リンク。AppHeader で別定義。

## ボタン
| 使用箇所 | 実装パターン | 差分・備考 |
| --- | --- | --- |
| Login/Signup | `.primary`（ローカル定義） | `padding`/`radius` が他画面と重複定義。
| Admin 系 | `.primary` + `.ghost` + `.danger` | `AdminHome.vue`, `AdminTournamentHome.vue`, `AdminTournamentRounds.vue` など。`.danger` のみ色差し替え。
| AppHeader | `.ghost`（pill 形状） | `border-radius: 999px` / `padding` が他と不一致。
| User 系 | `.ghost` ボタン/リンク | `UserTournament.vue`, `UserParticipantHome.vue` などで「戻る」「タブ」用途。

## 入力/フォーム
| 使用箇所 | 実装パターン | 差分・備考 |
| --- | --- | --- |
| Login/Signup | `label.field > input` | `input` スタイルはページ内で定義。
| AdminHome | `label.field > input/select` + `form.stack` | `.field`/`input`/`select` をローカル定義。
| AdminTournamentHome | `form.grid` + `input`（プレースホルダ主体） | エンティティ作成はラベルなし入力が多い。
| AdminTournamentRounds | `form.grid` + `label.field` + `input` | チェックボックスも多数。
| ResultsEditor | `input` + `textarea` | JSON 直接入力。モノスペース指定。
| Participant Ballot/Feedback | `label.stack` + `input/select/textarea` | 大量の入力行があり、レイアウト/余白はページ固有。

## カード/レイアウト
| 使用箇所 | 実装パターン | 差分・備考 |
| --- | --- | --- |
| 主要画面 | `.card` + `.stack` | グローバル `card` に依存。
| ロールカード | `.card.stack.soft` | `UserTournamentHome.vue` と `AdminTournamentHome.vue` で `soft` を個別定義。
| ルートレイアウト | `App.vue` で `main.content` | 余白は 24px 固定。

## 一覧/リスト
| 使用箇所 | 実装パターン | 差分・備考 |
| --- | --- | --- |
| AdminHome | `.list` / `.list-item` | `grid` レイアウト。`list-main` など個別定義。
| AdminTournamentHome | `.list` / `.list-item` | 複数セクションで再定義。内容密度が高い。
| AdminTournamentRounds | `.list` / `.list-item` | ラウンド一覧。スタイルは画面固有。
| AdminTournamentSubmissions | `.list` / `.list-item` | `pre.payload` で JSON 表示。
| UserHome | `.list` / `.list-item` | 参加者向け大会一覧。
| UserRoundBallotHome / FeedbackHome | `.list` / `.list-item` | ラウンド内の一覧 UI。

## ナビゲーション
| 使用箇所 | 実装パターン | 差分・備考 |
| --- | --- | --- |
| AppHeader | `RouterLink` + `.ghost` | 現在地の明示なし。レスポンシブ対応なし。
| AdminTournament/UserTournament | `.subnav` + `router-link-active` | 管理/参加者でほぼ同パターンだが別実装。
| Participant 内ナビ | `RouterLink` を `.ghost` として並べる | ラウンド単位のタブ/戻るリンクに使用。

## 表
| 使用箇所 | 実装パターン | 差分・備考 |
| --- | --- | --- |
| AdminTournamentCompiled | `<table class="table">` | `.table` は当該ビュー内の scoped CSS のみ。

## チャート/可視化
| 使用箇所 | 実装パターン | 差分・備考 |
| --- | --- | --- |
| AdminTournamentSubmissions | `highcharts`（提出数） | `useHighcharts` で描画。
| AdminTournamentCompiled | `components/mstat/*` | タイトルや軸ラベルは英語の固定文言が混在。

## スライド
| 使用箇所 | 実装パターン | 差分・備考 |
| --- | --- | --- |
| AdminTournamentCompiled | `Slides.vue` + `SlideShow.vue` | スライドはボタン操作中心。キーボード対応は未実装。
