# T6NetWork Addon 組み込みAPI

このアドオンはプレイヤー転送などは行わず、**指定したサーバーのPing・バージョン・人数を返すだけ**の読み取り専用APIです。`scripts/api/index.js` の1ファイルだけで完結します。
呼び出し方法は2種類あります。

- **import経由**（JavaScriptパック向け・推奨。`scripts/api/index.js`を自分のパックにコピーして`import`します）
- **scriptevent経由**（`.mcfunction`やコマンドブロックなど、JavaScript以外からも呼べるリクエスト/レスポンス方式）

Minecraft Bedrockは別のBehavior Packのスクリプトを`import`で直接参照できないため、`scripts/api/index.js`を呼び出したい側のパックの`scripts`フォルダにコピーし、通常のJavaScriptと同じように`import`して使います。

## Ping取得元（フォールバック対応）

サーバーステータスの取得には [mcstatus.io](https://mcstatus.io/) を第一候補として使い、失敗した場合（タイムアウト・エラー応答など）は自動的に [mcsrvstat.us](https://api.mcsrvstat.us/) にフォールバックします。どちらか片方が落ちていても動作し続けるようにするための仕組みです。両方とも失敗した場合のみ `{ online: false, version: null, players: { online: 0, max: 0 } }` を返します。

## 動作要件

このアドオンは **Bedrock Dedicated Server（統合版専用サーバー）専用** です。HTTP通信に使う `@minecraft/server-net` はBDS上でしか動作しないため、シングルプレイ／フレンドとのLAN接続／Realms／統合版クライアントでホストしたワールドでは動作しません。

また、BDS側で `@minecraft/server-net` の使用を許可する必要があります。サーバー実行ファイルと同じ階層にある `config/default/permissions.json` を、次の内容にしてください（存在しない場合は新規作成してください）。この設定がないと、このアドオンが依存する `@minecraft/server-net` の読み込みに失敗し、APIが機能しません。

```json
{
  "allowed_modules": [
    "@minecraft/server-gametest",
    "@minecraft/server",
    "@minecraft/server-ui",
    "@minecraft/server-admin",
    "@minecraft/server-editor",
    "@minecraft/debug-utilities",
    "@minecraft/server-net"
  ]
}
```

## 1. import経由の呼び出し（JavaScriptパック向け）

`scripts/api/index.js` を、呼び出したい側のBehavior Packの `scripts` フォルダにコピーしてください（配置場所は自由です。以下は `scripts/api/index.js` にコピーした場合の例）。

```js
import { getServerStatus, canJoin } from "./api/index.js";

// サーバーの稼働状況・バージョン・人数をまとめて取得
const status = await getServerStatus("play.example.com", 19132);
// => { online: true, version: "1.26.4", players: { online: 5, max: 20 } }

// 単純に「今すぐ入れるか」だけを真偽値で取得（稼働中 かつ 満員でない）
const joinable = await canJoin("play.example.com", 19132);
// => true / false
```

### 公開されている関数

| 関数 | 説明 |
| --- | --- |
| `apiVersion` | APIのバージョン文字列 |
| `getServerStatus(ip, port)` | 稼働状況・バージョン・人数をJSONで返す。`Promise<{ online, version, players: { online, max } }>` |
| `canJoin(ip, port)` | 稼働中かつ満員でなければ`true`を返す。`Promise<boolean>` |

## 2. scriptevent経由の呼び出し（`.mcfunction`・コマンドブロックからも可）

`.mcfunction` からは `globalThis` に触れないため、代わりに `scriptevent` を使ったリクエスト/レスポンス方式を用意しています。
リクエストには任意の `id` を含めておくと、対応するレスポンスに同じ `id` が返るので、どのリクエストへの返答か判別できます（`id`を省略すると応答は送信されません）。

```
/scriptevent t6:api_status {"id":"req1","ip":"play.example.com","port":19132}
/scriptevent t6:api_canJoin {"id":"req2","ip":"play.example.com","port":19132}
```

このアドオン側が処理を終えると、`t6:api_status_result` / `t6:api_canJoin_result` というscripteventを発火します（`system.sendScriptEvent`で送信されるため、受け取るには自分のパック側で `scriptEventReceive` を購読してください）。

```js
import { system } from "@minecraft/server";

system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id === "t6:api_status_result") {
        const { id, result } = JSON.parse(ev.message);
        // result => { online, version, players: { online, max } }
        console.warn(`request ${id}:`, JSON.stringify(result));
    }

    if (ev.id === "t6:api_canJoin_result") {
        const { id, result } = JSON.parse(ev.message);
        // result => true / false
        console.warn(`request ${id}:`, result);
    }
});
```

### 使えるscriptevent一覧

| 送信ID | メッセージ(JSON) | 応答ID | 応答内容 |
| --- | --- | --- | --- |
| `t6:api_status` | `{id, ip, port}` | `t6:api_status_result` | `{id, result: { online, version, players: { online, max } }}` |
| `t6:api_canJoin` | `{id, ip, port}` | `t6:api_canJoin_result` | `{id, result: true / false}` |
