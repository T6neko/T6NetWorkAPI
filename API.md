# T6NetWork API 仕組み

使い方（導入方法・呼び出し方のコード例）は [README.md](README.md) を参照してください。
ここでは、内部でどう動いているかをまとめます。

## 全体像

`scripts/api/index.js` はこの3つの役割を1ファイルで持っています。

1. 外部ステータスAPIへの問い合わせ（フォールバック込み）
2. 問い合わせ結果を`export`関数として公開（`import`する側向け）
3. `scriptevent`のリクエストを受けて、同じ関数を呼び出し、結果を別の`scriptevent`で返す（JS以外から呼ぶ側向け）

```
呼び出し側
  ├─ import { getServerStatus, canJoin } from "./api/index.js"  … 直接関数呼び出し
  └─ /scriptevent t6:api_status / t6:api_canJoin                … リクエスト/レスポンス
                          │
                          ▼
              scripts/api/index.js
                          │
              fetchStatus(ip, port)
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
        mcstatus.io              失敗したら
       （第一候補）          mcsrvstat.us にフォールバック
```

## Online/Offline判定のフォールバック

サーバーのOnline/Offline状態・バージョン・人数は、外部の無料ステータスAPIに問い合わせて取得しています（BDS自体には他サーバーの状態を調べる標準機能が無いため）。

1. まず [mcstatus.io](https://mcstatus.io/) の `https://api.mcstatus.io/v2/status/bedrock/<ip>:<port>` に問い合わせます。
2. タイムアウト（7秒）・接続エラー・HTTPエラーのいずれかが起きた場合のみ、[mcsrvstat.us](https://api.mcsrvstat.us/) の `https://api.mcsrvstat.us/bedrock/3/<ip>:<port>` にフォールバックします（このAPIは`User-Agent`ヘッダーが必須のため付与しています）。
3. 両方とも失敗した場合は、対象サーバーが本当にオフラインなのか判別できないため、安全側に倒して `{ online: false, version: null, players: { online: 0, max: 0 } }` を返します。

2つのAPIはレスポンスの形が微妙に違います（`version`が文字列で返るか`{ name: "..." }`のようなオブジェクトで返るか）。この差は`normalizeStatus()`で吸収し、呼び出し側には常に同じ形のオブジェクトを返しています。

「稼働中だが応答が無い」ことと「サービス自体が落ちていて判定できない」ことを区別するため、フォールバックが発生するのは**問い合わせ自体が失敗したとき**だけで、片方のAPIが「正常にオフラインと答えた」場合はそのまま`online: false`として扱い、もう片方には問い合わせません（本当にオフラインなサーバーへ余計なリクエストを送らないため）。

## レスポンス形式

`getServerStatus(ip, port)` が返す形（`canJoin`の内部でも同じ形を使っています）。

```ts
{
  online: boolean,
  version: string | null,
  players: {
    online: number,
    max: number
  }
}
```

`canJoin(ip, port)` は上記を取得した上で、`online && players.online < players.max` を計算して真偽値だけを返しているだけの薄いラッパーです。

## import経由の公開方法

Minecraft Bedrockでは、別のBehavior Packのスクリプトを`import`で直接参照する仕組みが無いため、`scripts/api/index.js`は「呼び出したい側のパックにファイルごとコピーしてもらい、通常のES Modulesとして`import`してもらう」という前提で作られています。`globalThis`に登録するような特別な処理は行っていません。

## scriptevent経由の公開方法

`.mcfunction`やコマンドブロックはJavaScriptの`import`に触れないため、`system.afterEvents.scriptEventReceive`を購読し、`t6:api_`で始まるIDのイベントだけを処理しています。

- リクエストの`message`はJSON文字列（`{ id, ip, port }`）として解釈されます。
- 処理が終わると、`system.sendScriptEvent("<受け取ったID>_result", JSON.stringify({ id, result }))`で応答を送り返します。
- リクエストに`id`を含めなかった場合は、応答が必要ないものとみなして何も送信しません（`respond()`内で`requestId === undefined`のときに早期return）。

対応しているイベントIDは以下の2つです。

| 送信ID | メッセージ(JSON) | 応答ID | 応答内容 |
| --- | --- | --- | --- |
| `t6:api_status` | `{id, ip, port}` | `t6:api_status_result` | `{id, result: { online, version, players: { online, max } }}` |
| `t6:api_canJoin` | `{id, ip, port}` | `t6:api_canJoin_result` | `{id, result: true / false}` |

`port`を省略した場合は`19132`（Bedrockのデフォルトポート）が使われます。

## なぜBedrock Dedicated Server限定なのか

Online/Offline状態の取得に使っている `@minecraft/server-net`（HTTPリクエスト）は、BDS上でのみ動作するAPIです。シングルプレイ／フレンドとのLAN接続／Realms／統合版クライアントでホストしたワールドには存在しないため、このアドオンはBDS専用になっています。
