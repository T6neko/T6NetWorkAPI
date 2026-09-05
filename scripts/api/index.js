import { system } from "@minecraft/server";
import * as net from "@minecraft/server-net";

const OFFLINE_STATUS = { online: false, version: null, players: { online: 0, max: 0 } };

// レスポンス形式の細かな違い（versionが文字列 or {name}）を吸収して共通の形に整える
function normalizeStatus(data) {
    if (!data.online) return { ...OFFLINE_STATUS };

    const version = typeof data.version === "string" ? data.version : (data.version?.name ?? "不明");

    return {
        online: true,
        version,
        players: {
            online: data.players?.online ?? 0,
            max: data.players?.max ?? 0
        }
    };
}

async function requestJson(url, headers) {
    const request = new net.HttpRequest(url);
    request.method = net.HttpRequestMethod.Get;
    request.setTimeout(7);
    if (headers) request.setHeaders(headers);

    const response = await net.http.request(request);
    if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}`);
    }

    return JSON.parse(response.body);
}

// mcstatus.io（第一候補）
async function fetchFromMcstatusIo(ip, port) {
    const url = `https://api.mcstatus.io/v2/status/bedrock/${encodeURIComponent(ip)}:${port}`;
    return normalizeStatus(await requestJson(url));
}

// mcsrvstat.us（mcstatus.ioが失敗した場合のフォールバック。User-Agentヘッダーが必須）
async function fetchFromMcsrvstatUs(ip, port) {
    const url = `https://api.mcsrvstat.us/bedrock/3/${encodeURIComponent(ip)}:${port}`;
    const headers = [new net.HttpHeader("User-Agent", "T6NetWorkAddon (Minecraft Bedrock Add-on)")];
    return normalizeStatus(await requestJson(url, headers));
}

async function fetchStatus(ip, port) {
    try {
        return await fetchFromMcstatusIo(ip, port);
    } catch (error) {
        console.warn(`[T6NetWork API] mcstatus.ioの取得に失敗したためmcsrvstat.usにフォールバックします: ${error}`);
    }

    try {
        return await fetchFromMcsrvstatUs(ip, port);
    } catch (error) {
        console.error(`[T6NetWork API] Ping Error（mcstatus.io / mcsrvstat.us 両方とも失敗）: ${error}`);
        return { ...OFFLINE_STATUS };
    }
}

export async function getServerStatus(ip, port) {
    return fetchStatus(ip, port);
}

export async function canJoin(ip, port) {
    const status = await fetchStatus(ip, port);
    return status.online && status.players.online < status.players.max;
}

export const apiVersion = "3.0.0";

function respond(requestEventId, requestId, result) {
    if (requestId === undefined) return;
    system.sendScriptEvent(`${requestEventId}_result`, JSON.stringify({ id: requestId, result }));
}

system.afterEvents.scriptEventReceive.subscribe(async (ev) => {
    if (!ev.id.startsWith("t6:api_")) return;

    let payload;
    try {
        payload = JSON.parse(ev.message || "{}");
    } catch {
        console.error(`[T6NetWork API] scriptevent "${ev.id}" のmessageがJSONとして解析できません: ${ev.message}`);
        return;
    }

    const requestId = payload.id;

    try {
        switch (ev.id) {
            case "t6:api_status": {
                const result = await getServerStatus(payload.ip, payload.port ?? 19132);
                respond(ev.id, requestId, result);
                break;
            }
            case "t6:api_canJoin": {
                const result = await canJoin(payload.ip, payload.port ?? 19132);
                respond(ev.id, requestId, result);
                break;
            }
        }
    } catch (error) {
        console.error(`[T6NetWork API] scriptevent "${ev.id}" の処理でエラーが発生しました: ${error}`);
    }
});
