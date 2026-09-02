"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers/harness");

const DRAW_CATALOG = [
    {
        city: "台北市",
        name: "甲店",
        items: [
            { id: "d1", product: "A1", link: "https://lin.ee/a1" },
            { id: "d2", product: "A2", link: "https://lin.ee/a2" }
        ]
    },
    {
        city: "高雄市",
        name: "乙店",
        items: [{ id: "d3", product: "B1", link: "https://lin.ee/b1" }]
    }
];

function bootEngine(seed, catalog) {
    const o = { draws: catalog || DRAW_CATALOG };
    if (seed) o.seed = seed;
    const env = h.bootModules(["js/catalog.js", "js/favorites.js", "js/continuous-draw.js"], o);
    // 載入資料（等同頁面 init 時的動作）
    env.ctx.ContinuousDraw.refreshStores();
    return env;
}

function nextUrl(ctx) {
    const candidate = ctx.ContinuousDraw._test.findNextItem();
    return candidate ? candidate.product.url : null;
}

/** 產生「保證在未來」的開始時間標註（10-12 月時改用明年 1/1，觸發跨年順延） */
function futureAnnotation() {
    const m = new Date().getMonth() + 1;
    if (m >= 10) return "（1/1 23:59才開始）";
    return "（" + (m + 3) + "/1 23:59才開始）";
}

test("時間解析: 全形括號與『才開始』", () => {
    const { ctx } = bootEngine();
    const t = ctx.ContinuousDraw._test;
    const start = t.getProductStartTime("UX-21 惡魔冥界改造組（8/29 11:00才開始）");
    assert.notEqual(start, null);
    assert.equal(start.getMonth() + 1, 8);
    assert.equal(start.getDate(), 29);
    assert.equal(start.getHours(), 11);
    assert.equal(start.getMinutes(), 0);
});

test("時間解析: 半形括號且無『才』也支援", () => {
    const { ctx } = bootEngine();
    const t = ctx.ContinuousDraw._test;
    const start = t.getProductStartTime("BX-1 龍神 (8/29 11:00開始)");
    assert.notEqual(start, null);
    assert.equal(start.getMonth() + 1, 8);
    assert.equal(start.getHours(), 11);
});

test("時間解析: 無括號時間標註回傳 null", () => {
    const { ctx } = bootEngine();
    const t = ctx.ContinuousDraw._test;
    assert.equal(t.getProductStartTime("普通商品名稱"), null);
});

test("時間判斷: 無標註→已開始；未來標註→尚未開始；過去標註→已開始", () => {
    const { ctx } = bootEngine();
    const t = ctx.ContinuousDraw._test;

    assert.equal(t.hasStarted({ product: "普通商品" }), true);

    assert.equal(t.hasStarted({ product: "未來商品" + futureAnnotation() }), false);

    const pastText = "（" + (new Date().getMonth() + 1) + "/1 00:00開始）";
    assert.equal(t.hasStarted({ product: "過去商品" + pastText }), true);
});

test("時間判斷: 跨年標註（1 月的日期在 8 月後會順延至明年）", () => {
    const { ctx } = bootEngine();
    const t = ctx.ContinuousDraw._test;
    const start = t.getProductStartTime("（1/1 00:00開始）");
    const now = new Date();
    const nowMonthNum = now.getMonth() + 1;
    const expectedYear = nowMonthNum >= 8 ? now.getFullYear() + 1 : now.getFullYear();
    assert.equal(start.getFullYear(), expectedYear);
});

test("抽選排序: 預設 fav-first，無最愛時照原始順序", () => {
    const { ctx } = bootEngine();
    assert.equal(nextUrl(ctx), "https://lin.ee/a1");
    ctx.ContinuousDraw.markDrawn({ url: "https://lin.ee/a1" });
    assert.equal(nextUrl(ctx), "https://lin.ee/a2");
    ctx.ContinuousDraw.markDrawn({ url: "https://lin.ee/a2" });
    assert.equal(nextUrl(ctx), "https://lin.ee/b1");
    ctx.ContinuousDraw.markDrawn({ url: "https://lin.ee/b1" });
    assert.equal(nextUrl(ctx), null);
});

test("抽選排序: 最愛優先（fav-first）", () => {
    const { ctx } = bootEngine();
    ctx.Favorites.toggleItem("https://lin.ee/b1"); // 加星乙店商品

    assert.equal(nextUrl(ctx), "https://lin.ee/b1");
    ctx.ContinuousDraw.markDrawn({ url: "https://lin.ee/b1" });
    // 之後才輪到未加星項目（照原始順序）
    assert.equal(nextUrl(ctx), "https://lin.ee/a1");
});

test("抽選排序: 只抽最愛（fav-only）", () => {
    const { ctx } = bootEngine();
    ctx.Favorites.toggleItem("https://lin.ee/b1");
    ctx.ContinuousDraw.setDrawMode("fav-only");

    assert.equal(nextUrl(ctx), "https://lin.ee/b1");
    ctx.ContinuousDraw.markDrawn({ url: "https://lin.ee/b1" });
    assert.equal(nextUrl(ctx), null); // 其餘未加星項目不會被抽
});

test("抽選排序: 全部依序（all）", () => {
    const { ctx } = bootEngine();
    ctx.ContinuousDraw.setDrawMode("all");
    assert.equal(nextUrl(ctx), "https://lin.ee/a1");
});

test("抽選範圍: 依照目前縣市篩選", () => {
    const { ctx } = bootEngine();
    ctx.ContinuousDraw._test.setCurrentCity("高雄市");
    assert.equal(ctx.ContinuousDraw._test.filteredStores().length, 1);
    assert.equal(nextUrl(ctx), "https://lin.ee/b1");
    ctx.ContinuousDraw.markDrawn({ url: "https://lin.ee/b1" });
    assert.equal(nextUrl(ctx), null);
});

test("抽選狀態: 略過（skip）只在本次有效且可清除", () => {
    const { ctx } = bootEngine();
    ctx.ContinuousDraw._test.skipUrl("https://lin.ee/a1");
    assert.equal(nextUrl(ctx), "https://lin.ee/a2");
    ctx.ContinuousDraw._test.skipUrl("https://lin.ee/a2");
    assert.equal(nextUrl(ctx), "https://lin.ee/b1");

    ctx.ContinuousDraw._test.clearSkipped();
    assert.equal(nextUrl(ctx), "https://lin.ee/a1"); // 清除後回到最前
});

test("抽選狀態: unmarkDrawn 會讓已抽項目重新可抽", () => {
    const { ctx } = bootEngine();
    ctx.ContinuousDraw.markDrawn({ url: "https://lin.ee/a1" });
    assert.equal(nextUrl(ctx), "https://lin.ee/a2");

    ctx.ContinuousDraw.unmarkDrawn("https://lin.ee/a1");
    assert.equal(nextUrl(ctx), "https://lin.ee/a1");
});

test("抽選狀態: resetDrawn 清除所有已抽紀錄", () => {
    const { ctx } = bootEngine();
    ctx.ContinuousDraw.markDrawn({ url: "https://lin.ee/a1" });
    ctx.ContinuousDraw.markDrawn({ url: "https://lin.ee/a2" });
    ctx.ContinuousDraw.markDrawn({ url: "https://lin.ee/b1" });
    assert.equal(nextUrl(ctx), null);

    ctx.ContinuousDraw.resetDrawn();
    assert.equal(nextUrl(ctx), "https://lin.ee/a1");
});

test("時間門檻: 尚未開始的商品不會被選中，已開始的會", () => {
    const catalog = [
        {
            city: "台北市",
            name: "限時店",
            items: [
                { id: "f1", product: "未來才開始" + futureAnnotation(), link: "https://lin.ee/f1" },
                { id: "f2", product: "立即開始", link: "https://lin.ee/f2" }
            ]
        }
    ];
    const { ctx } = bootEngine(null, catalog);

    // 只有「立即開始」會被選中
    assert.equal(nextUrl(ctx), "https://lin.ee/f2");
    ctx.ContinuousDraw.markDrawn({ url: "https://lin.ee/f2" });
    // 尚未開始者（f1）不會被抽 → 清單結束
    assert.equal(nextUrl(ctx), null);
});
