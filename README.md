# T6NetWork API

Minecraft Bedrock Dedicated Server（統合版専用サーバー）向けの、**読み取り専用のサーバーステータス確認アドオン**です。

指定したIPとポートに対して、

- サーバーが起動しているか（Ping / online-offline）
- バージョン
- 人数（現在の人数 / 最大人数）

を取得できます。プレイヤーの転送などの機能は持たず、**状態の取得だけ**を行います。

内部の仕組み（フォールバックの詳細やレスポンス形式など）は [API.md](API.md) を参照してください。このREADMEは「使い方」に絞って説明します。

## 動作要件

- **Bedrock Dedicated Server（統合版専用サーバー）専用**です。シングルプレイ／フレンドとのLAN接続／Realms／統合版クライアントでホストしたワールドでは動作しません。
- サーバー実行ファイルと同じ階層にある `config/default/permissions.json` に `@minecraft/server-net` を許可しておく必要があります（[サンプル](config/default/permissions.json) を参照、または以下をコピー）。

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

## 導入方法

1. このリポジトリ一式（`manifest.json` / `scripts` フォルダ）をBehavior Packとしてワールドにコピーします。
2. ワールドの `world_behavior_packs.json` にこのパックの `manifest.json` に書かれている `uuid` と `version` を追加し、有効化します。
3. 上記の `config/default/permissions.json` を設定し、サーバーを再起動します。

これだけで、このワールド上では **`.mcfunction` やコマンドブロックから `scriptevent` で呼び出せる状態**になります（後述）。

他のBehavior Packの開発者で「自分のパックのJavaScriptから直接関数として呼びたい」場合は、`scripts/api/index.js` を自分のパックの `scripts` フォルダにコピーして `import` してください（後述の方法1）。

## 使い方

呼び出し方法は2つあります。用途に応じて使い分けてください。

| 方法 | 向いている場面 |
| --- | --- |
| 1. import | 自分でJavaScriptのBehavior Packを書いていて、コード内から直接呼びたい場合 |
| 2. scriptevent | `.mcfunction` やコマンドブロックから呼びたい場合。JS側で受け口を書かなくても、このアドオンを入れるだけで使えます |

### 1. importで呼び出す（JavaScriptパック向け）

`scripts/api/index.js` を自分のパックの `scripts` フォルダにコピーして、`import`します。

```js
import { getServerStatus, canJoin } from "./api/index.js";

const TARGET_IP = "play.example.com";
const TARGET_PORT = 19132;

// サーバーの稼働状況・バージョン・人数をまとめて取得
async function checkStatus(player) {
    const status = await getServerStatus(TARGET_IP, TARGET_PORT);
    // status => { online: true, version: "1.26.4", players: { online: 5, max: 20 } }

    if (status.online) {
        player.sendMessage(`Online\nVersion：${status.version}\nPlayer：${status.players.online}/${status.players.max}`);
    } else {
        player.sendMessage("Offline...");
    }
}

// 単純に「今すぐ入れるか」だけを真偽値で取得
async function checkJoin(player) {
    const joinable = await canJoin(TARGET_IP, TARGET_PORT);

    if (joinable) {
        player.sendMessage("This Server is Opening!");
    } else {
        player.sendMessage("This Server is Closing...");
    }
}
```

動く完全なサンプルは [scripts/example.js](scripts/example.js) を見てください。

#### 関数一覧

| 関数 | 戻り値 |
| --- | --- |
| `getServerStatus(ip, port)` | `Promise<{ online, version, players: { online, max } }>` |
| `canJoin(ip, port)` | `Promise<boolean>`（稼働中 かつ 満員でなければ `true`） |
| `apiVersion` | APIのバージョン文字列 |

### 2. scripteventで呼び出す（`.mcfunction`・コマンドブロックから）

`.mcfunction` からは `import` できないため、代わりに `/scriptevent` でリクエストを送り、結果を別の `scriptevent` で受け取ります。リクエストの `id` はレスポンスにそのまま返ってくるので、複数のリクエストを区別したいときに使えます（不要なら省略できます＝その場合レスポンスは送信されません）。

```
scriptevent t6:api_status {"id":"req1","ip":"play.example.com","port":19132}
scriptevent t6:api_canJoin {"id":"req2","ip":"play.example.com","port":19132}
```

結果は `t6:api_status_result` / `t6:api_canJoin_result` という `scriptevent` で返ってきます。結果を受け取るには、自分のパック側で購読する必要があります。

```js
import { system } from "@minecraft/server";

system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id === "t6:api_status_result") {
        const { id, result } = JSON.parse(ev.message);
        // result => { online, version, players: { online, max } }
    }

    if (ev.id === "t6:api_canJoin_result") {
        const { id, result } = JSON.parse(ev.message);
        // result => true / false
    }
});
```

scriptevent一覧の詳細は [API.md](API.md) にまとめています。

## ファイル構成

| ファイル | 役割 |
| --- | --- |
| `manifest.json` | このBehavior Packのサンプルマニフェスト |
| `scripts/api/index.js` | API本体（Ping取得・`import`公開・`scriptevent`受け口） |
| `scripts/example.js` | importで呼び出す場合の使用例 |
| `config/default/permissions.json` | BDS側に必要な権限設定のサンプル |
| `API.md` | 内部の仕組み（フォールバックの流れ・レスポンス形式など） |
