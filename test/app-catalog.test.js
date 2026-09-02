"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers/harness");

const BUILTIN = [
    {
        city: "台北市",
        name: "內建甲店",
        items: [
            { id: "i1", product: "內建商品一", link: "https://lin.ee/i1" },
            { id: "i2", product: "內建商品二", link: "https://lin.ee/i2" }
        ]
    },
    {
        city: "高雄市",
        name: "內建乙店",
        items: [{ id: "i3", product: "內建商品三", link: "https://lin.ee/i3" }]
    }
];

const IMPORT = [
    {
        city: "台中市",
        name: "匯入丙店",
        items: [{ id: "j1", product: "匯入商品一", link: "https://lin.ee/j1" }]
    }
];

function boot() {
    return h.bootApp({ draws: BUILTIN });
}

test("整合: 初始以內建資料渲染抽獎清單與抽選引擎", () => {
    const { ctx, document } = boot();
    const listEl = h.el(document, "drawListContainer");

    assert.ok(listEl.innerHTML.indexOf("內建甲店") >= 0);
    assert.ok(listEl.innerHTML.indexOf("內建商品一") >= 0);
    assert.equal(ctx.Catalog.hasOverride(), false);
    // 連續抽選引擎載入的是同一份清單
    assert.equal(ctx.ContinuousDraw._test.getStores().length, 2);
});

test("整合: 匯入後整頁改用覆蓋資料（清單 + 抽選引擎 + 狀態列）", () => {
    const { ctx, document } = boot();

    const result = ctx.Catalog.importFromText(JSON.stringify(IMPORT), "replace");
    assert.equal(result.ok, true);

    const listEl = h.el(document, "drawListContainer");
    assert.ok(listEl.innerHTML.indexOf("匯入丙店") >= 0);
    assert.ok(listEl.innerHTML.indexOf("匯入商品一") >= 0);
    assert.ok(listEl.innerHTML.indexOf("內建甲店") < 0);

    // 狀態列顯示「已使用匯入資料」
    const statusEl = h.el(document, "catalogSourceStatus");
    assert.ok(statusEl.innerHTML.indexOf("badge-override") >= 0);

    // 連續抽選引擎已改用匯入清單，並選出匯入門市的商品
    assert.equal(ctx.ContinuousDraw._test.getStores().length, 1);
    assert.ok(h.el(document, "continuousDrawStore").textContent.indexOf("匯入丙店") >= 0);

    // 「回復內建資料」按鈕應出現
    assert.equal(h.el(document, "catalogResetBtn").style.display, "");

    // 匯出內容與匯入清單一致
    const exported = JSON.parse(ctx.Catalog.exportText());
    assert.equal(exported.stores.length, 1);
    assert.equal(exported.stores[0].name, "匯入丙店");
});

test("整合: 回復內建資料按鈕可還原", () => {
    const { ctx, document } = boot();
    ctx.Catalog.importFromText(JSON.stringify(IMPORT), "replace");

    // 直接觸發「回復內建資料」按鈕的 click handler
    h.el(document, "catalogResetBtn").onclick();

    assert.equal(ctx.Catalog.hasOverride(), false);
    const listEl = h.el(document, "drawListContainer");
    assert.ok(listEl.innerHTML.indexOf("內建甲店") >= 0);
    assert.equal(h.el(document, "catalogResetBtn").style.display, "none");
    assert.ok(h.el(document, "catalogSourceStatus").innerHTML.indexOf("badge-builtin") >= 0);
    assert.equal(ctx.ContinuousDraw._test.getStores().length, 2);
});

test("整合: 工具列按鈕與檔案輸入已綁定", () => {
    const { document } = boot();

    const importBtn = h.el(document, "catalogImportBtn");
    const importFile = h.el(document, "catalogImportFile");
    const exportBtn = h.el(document, "catalogExportBtn");
    const exportJsBtn = h.el(document, "catalogExportJsBtn");

    assert.equal(typeof importBtn.onclick, "function");
    assert.equal(typeof importFile.onchange, "function");
    assert.equal(typeof exportBtn.onclick, "function");
    assert.equal(typeof exportJsBtn.onclick, "function");

    // 點匯出按鈕不應拋錯（此測試環境無 Blob/URL，download 會安全略過）
    assert.doesNotThrow(function () { exportBtn.onclick(); });
    assert.doesNotThrow(function () { exportJsBtn.onclick(); });
});

test("整合: 重新整理後仍使用匯入資料（App 層級跨頁保留）", () => {
    const first = boot();
    first.ctx.Catalog.importFromText(JSON.stringify(IMPORT), "replace");

    const second = h.bootApp({ draws: BUILTIN, seed: first.storage.snapshot() });
    const listEl = h.el(second.document, "drawListContainer");
    assert.ok(listEl.innerHTML.indexOf("匯入丙店") >= 0);
    assert.equal(second.ctx.Catalog.hasOverride(), true);
});
