/*
  T6NetWork Addon API の使い方サンプルです。
  このファイル自体はT6NetWork Addonの一部ではなく、使い方の例を示すものです。

  事前準備:
  1. scripts/api/index.js をアドオンの scripts 内に配置してください。
  2. BDS(統合版専用サーバー)の config/default/permissions.json に
     "@minecraft/server-net" が allowed_modules として許可されている必要があります。
*/

import { getServerStatus, canJoin } from "./api/index.js";

const TARGET_IP = "play.example.com";
const TARGET_PORT = 19132;

async function sampleA (player) {
    const status = await canJoin(TARGET_IP, TARGET_PORT);

    if(status) {
        player.sendMessage("This Server is Opening!");
    } else {
        player.sendMessage("This Server is Closing...");
    }
};

async function sampleB (player) {
    const status = await getServerStatus(TARGET_IP, TARGET_PORT);

    const Oline = status.online;
    const Version = status.version;
    const MaxPlayer = status.players.max;
    const OlinePlayer = status.players.online;

    if(Oline) {
        player.sendMessage(` Online\n Version：${Version}\n Player：${OlinePlayer}/${MaxPlayer}`);
    } else {
        player.sendMessage(`Offline...`);
    }
}