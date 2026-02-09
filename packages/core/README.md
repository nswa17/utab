# @utab/core

UTab のコアロジックパッケージです。

## 主要機能

- チーム・ジャッジアロケーション
- ドロー生成アルゴリズム
- 結果集計
- Mongoose モデル

## 使用例

```ts
import { TournamentHandler } from '@utab/core'

const tournament = new TournamentHandler('mongodb://localhost:27017/utab', {
  name: 'Test Tournament',
})

const teams = await tournament.teams.read()
console.log(teams.length)
```
