/**
 * Funbox 抽獎資料目錄管理模組 (Catalog Manager)
 *
 * 負責「抽獎項目清單」(DRAWS_DATA) 的匯入 / 匯出與本地覆蓋：
 * - 匯入：接受 JSON（原始陣列 / { stores: [...] } / data/draws.js 原始檔文字），
 *   結構驗證通過後以 localStorage 覆蓋內建資料（取代全部 或 依縣市+店名合併更新）。
 * - 匯出：可下載「資料 JSON」或「可直接覆蓋 data/draws.js 的 .js 原始檔」。
 *
 * 重要：頁面內所有讀取「抽獎項目清單」的地方（App 清單渲染、ContinuousDraw 抽選引擎）
 * 都應統一改由 Catalog.read() 取得，才能反映匯入後的覆蓋資料。
 */
(function (window) {
    "use strict";

    var STORAGE_KEY = "funbox_catalog_override_v1";
    var META_KEY = "funbox_catalog_override_meta_v1";
    var listeners = [];

    function readJson(key, defaultVal) {
        try {
            var data = localStorage.getItem(key);
            return data ? JSON.parse(data) : defaultVal;
        } catch (e) {
            return defaultVal;
        }
    }

    function writeJson(key, val) {
        try {
            localStorage.setItem(key, JSON.stringify(val));
        } catch (e) {}
    }

    function isNonEmptyString(v) {
        return typeof v === "string" && v.trim().length > 0;
    }

    /** 讀取儲存在 localStorage 的覆蓋清單（僅當其為非空陣列時回傳） */
    function readStored() {
        var list = readJson(STORAGE_KEY, null);
        return (Array.isArray(list) && list.length) ? list : null;
    }

    /**
     * 取得「目前有效的抽獎項目清單」：
     * 有匯入覆蓋 → 回傳覆蓋資料；否則回傳內建 DRAWS_DATA。
     * App / ContinuousDraw 應一律使用此方法讀取資料。
     */
    function read() {
        var override = readStored();
        if (override) return override;
        if (typeof DRAWS_DATA !== "undefined" && Array.isArray(DRAWS_DATA)) return DRAWS_DATA;
        return [];
    }

    function hasOverride() {
        return !!readStored();
    }

    /**
     * 彈性解析匯入文字：
     * 1) 直接 JSON.parse；
     * 2) 若失敗，容忍「const DRAWS_DATA = [...]」等 JS 包裝文字，取出陣列/物件後再解析。
     */
    function parseCatalogText(text) {
        var raw = String(text == null ? "" : text).replace(/^\uFEFF/, "").trim();
        if (!raw) {
            return { list: null, error: "檔案內容為空白，無法匯入" };
        }

        var value = null;
        try {
            value = JSON.parse(raw);
        } catch (e1) {
            // 尋找第一個 [ 或 { 的位置，截取到最後一個對應結束符號
            var firstBracket = raw.indexOf("[");
            var firstBrace = raw.indexOf("{");
            var start = -1;
            if (firstBracket >= 0 && (firstBrace < 0 || firstBracket < firstBrace)) {
                start = firstBracket;
            } else if (firstBrace >= 0) {
                start = firstBrace;
            }
            if (start >= 0) {
                var close = raw.charAt(start) === "[" ? "]" : "}";
                var end = raw.lastIndexOf(close);
                if (end > start) {
                    try {
                        value = JSON.parse(raw.substring(start, end + 1));
                    } catch (e2) {
                        value = null;
                    }
                }
            }
            if (value === null) {
                return { list: null, error: "無法解析 JSON，請確認檔案格式是否正確" };
            }
        }

        var list = null;
        if (Array.isArray(value)) {
            list = value;
        } else if (value && typeof value === "object" && Array.isArray(value.stores)) {
            list = value.stores;
        }
        if (!list) {
            return { list: null, error: "JSON 格式不符：需為「門市陣列」或「{ stores: [...] }」結構" };
        }
        return { list: list, error: null };
    }

    /** 結構驗證：回傳 { ok, errors, warnings, storeCount, itemsCount }；errors 非空則不可匯入 */
    function validateCatalog(list) {
        var errors = [];
        var warnings = [];
        var storeCount = 0;
        var itemsCount = 0;
        var duplicateLinks = 0;
        var duplicateIds = 0;
        var seenLinks = {};
        var seenIds = {};
        var weirdLinkShown = 0;

        if (!Array.isArray(list) || !list.length) {
            return { ok: false, errors: ["資料內容不含任何門市項目"], warnings: warnings, storeCount: 0, itemsCount: 0 };
        }

        list.forEach(function (store, si) {
            var label = "第 " + (si + 1) + " 筆門市";
            if (!store || typeof store !== "object") {
                errors.push(label + " 不是有效的門市物件");
                return;
            }
            storeCount++;
            if (!isNonEmptyString(store.city)) errors.push(label + "（" + (store.name || "?") + "）缺少 city（縣市）欄位");
            if (!isNonEmptyString(store.name)) errors.push(label + " 缺少 name（門市名稱）欄位");

            if (!Array.isArray(store.items)) {
                errors.push(label + "（" + (store.name || "?") + "）缺少 items 陣列");
                return;
            }
            if (!store.items.length) {
                warnings.push(label + "（" + (store.name || "?") + "）沒有任何商品項目");
            }
            store.items.forEach(function (item) {
                if (!item || typeof item !== "object") {
                    errors.push(label + " 內含無效的商品項目");
                    return;
                }
                itemsCount++;
                if (!isNonEmptyString(item.product)) {
                    errors.push(label + " 的商品缺少 product（商品名稱）欄位");
                }
                var link = typeof item.link === "string" ? item.link.trim() : "";
                if (!link) {
                    errors.push(label + " 的商品「" + (item.product || "?") + "」缺少 link（連結）欄位");
                } else {
                    if (!/^https?:\/\//i.test(link)) {
                        if (weirdLinkShown < 3) {
                            warnings.push(label + " 的商品「" + item.product + "」的 link 不是 http(s) 開頭：" + link);
                        }
                        weirdLinkShown++;
                    }
                    if (seenLinks[link]) {
                        duplicateLinks++;
                    } else {
                        seenLinks[link] = true;
                    }
                }
                var id = typeof item.id === "string" ? item.id.trim() : "";
                if (id) {
                    if (seenIds[id]) duplicateIds++;
                    else seenIds[id] = true;
                }
            });
        });

        if (weirdLinkShown > 3) warnings.push("另有 " + (weirdLinkShown - 3) + " 個非 http(s) 開頭的連結");
        if (duplicateLinks) warnings.push("發現 " + duplicateLinks + " 個重複的 link（相同連結會共用最愛 / 已抽狀態）");
        if (duplicateIds) warnings.push("發現 " + duplicateIds + " 個重複的 id");

        return { ok: errors.length === 0, errors: errors, warnings: warnings, storeCount: storeCount, itemsCount: itemsCount };
    }

    /** 複製清單並確保每個項目都有唯一 id（缺少 id 時自動補上） */
    var idSeq = 0;
    function cloneWithIds(list) {
        var seen = {};
        return list.map(function (store) {
            var s = {};
            for (var k in store) {
                if (Object.prototype.hasOwnProperty.call(store, k)) s[k] = store[k];
            }
            s.items = [];
            (store.items || []).forEach(function (item) {
                var copy = {};
                for (var k2 in item) {
                    if (Object.prototype.hasOwnProperty.call(item, k2)) copy[k2] = item[k2];
                }
                var id = typeof item.id === "string" ? item.id.trim() : "";
                if (!id || seen[id]) {
                    id = "draw-" + (++idSeq);
                }
                while (seen[id]) {
                    id = "draw-" + (++idSeq);
                }
                seen[id] = true;
                copy.id = id;
                s.items.push(copy);
            });
            return s;
        });
    }

    /** 合併：以 city + name 配對；已存在 → 以匯入內容整筆取代；不存在 → 新增 */
    function mergeLists(current, incoming) {
        var added = [];
        var updated = [];
        var keyOf = function (s) { return String(s.city || "") + "\u0001" + String(s.name || ""); };
        var index = {};
        var out = [];

        current.forEach(function (s, idx) {
            index[keyOf(s)] = idx;
            out.push(s);
        });
        incoming.forEach(function (s) {
            var key = keyOf(s);
            if (index[key] !== undefined) {
                out[index[key]] = s;
                updated.push(s.name);
            } else {
                index[key] = out.length;
                out.push(s);
                added.push(s.name);
            }
        });
        return { list: out, added: added, updated: updated };
    }

    function storeMeta(mode, added, updated) {
        writeJson(META_KEY, {
            importedAt: new Date().toISOString(),
            mode: mode,
            addedCount: added.length,
            updatedCount: updated.length
        });
    }

    function readMeta() {
        return readJson(META_KEY, null);
    }

    /**
     * 匯入清單（以文字傳入）。mode: 'replace'（取代全部）| 'merge'（合併更新）。
     * 成功時寫入 localStorage 並通知監聽者（觸發頁面重新整理）。
     */
    function importFromText(text, mode) {
        var parsed = parseCatalogText(text);
        if (parsed.error) {
            return { ok: false, errors: [parsed.error], warnings: [], storeCount: 0, itemsCount: 0 };
        }
        var checked = validateCatalog(parsed.list);
        if (!checked.ok) {
            return { ok: false, errors: checked.errors, warnings: checked.warnings, storeCount: 0, itemsCount: 0 };
        }

        var normalized = cloneWithIds(parsed.list);
        var list = normalized;
        var added = [];
        var updated = [];
        var modeName = mode === "merge" ? "merge" : "replace";

        if (modeName === "merge") {
            var merged = mergeLists(read(), normalized);
            list = merged.list;
            added = merged.added;
            updated = merged.updated;
        }

        writeJson(STORAGE_KEY, list);
        storeMeta(modeName, added, updated);
        notify();
        return {
            ok: true,
            errors: [],
            warnings: checked.warnings,
            mode: modeName,
            storeCount: list.length,
            itemsCount: list.reduce(function (n, s) { return n + (Array.isArray(s.items) ? s.items.length : 0); }, 0),
            added: added,
            updated: updated
        };
    }

    /** 清除覆蓋，回復內建資料 */
    function clearOverride() {
        try {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(META_KEY);
        } catch (e) {}
        notify();
    }

    /** 匯出「資料 JSON」文字（含標頭中繼資料） */
    function exportText() {
        var list = read();
        return JSON.stringify({
            app: "funbox-line-catalog",
            formatVersion: 1,
            exportedAt: new Date().toISOString(),
            storeCount: list.length,
            itemsCount: list.reduce(function (n, s) { return n + (Array.isArray(s.items) ? s.items.length : 0); }, 0),
            stores: list
        }, null, 2);
    }

    /** 匯出「可直接覆蓋 data/draws.js」的 JS 原始檔文字 */
    function exportDrawsJsText() {
        return "/**\n" +
            " * Funbox 抽獎活動門市與商品連結資料（由頁面「匯出 draws.js」產生）\n" +
            " * 可將下方內容整份覆蓋至 data/draws.js 後重新部署。\n" +
            " */\n" +
            "const DRAWS_DATA = " + JSON.stringify(read(), null, 2) + ";\n";
    }

    /** 瀏覽器端觸發下載 */
    function download(filename, text, mimeType) {
        if (typeof Blob === "undefined" || typeof URL === "undefined" || typeof document === "undefined") {
            return;
        }
        var blob = new Blob([text], { type: mimeType || "application/octet-stream" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function onChange(callback) {
        if (typeof callback === "function") listeners.push(callback);
    }

    function notify() {
        for (var i = 0; i < listeners.length; i++) {
            try {
                listeners[i]();
            } catch (e) {
                console.error("Catalog listener error:", e);
            }
        }
    }

    var Catalog = {
        STORAGE_KEY: STORAGE_KEY,
        read: read,
        hasOverride: hasOverride,
        parseCatalogText: parseCatalogText,
        validateCatalog: validateCatalog,
        importFromText: importFromText,
        clearOverride: clearOverride,
        exportText: exportText,
        exportDrawsJsText: exportDrawsJsText,
        download: download,
        readMeta: readMeta,
        onChange: onChange
    };

    window.Catalog = Catalog;
})(window);
