"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers/harness");

const MODULES = ["js/catalog.js"];

const BASE_CATALOG = [
    {
        city: "台北市",
        name: "內建店一",
        items: [
            { id: "i1", product: "商品甲", link: "https://lin.ee/p1" },
            { id: "i2", product: "商品乙", link: "https://lin.ee/p2" }
        ]
    },
    {
        city: "高雄市",
        name: "內建店二",
        items: [{ id: "i3", product: "商品丙", link: "https://lin.ee/p3" }]
    }
];

const IMPORT_CATALOG = [
    {
        city: "台中市",
        name: "匯入店一",
        items: [
            { id: "a1", product: "新商品一", link: "https://lin.ee/a1" },
            { id: "a2", product: "新商品二", link: "https://lin.ee/a2" }
        ]
    },
    {
        city: "台南市",
        name: "匯入店二",
        items: [{ id: "a3", product: "新商品三", link: "https://lin.ee/a3" }]
    }
];

function boot(seed) {
    const o = { draws: BASE_CATALOG };
    if (seed) o.seed = seed;
    return h.bootModules(MODULES, o);
}

function counts(list) {
    const stores = list.length;
    const items = list.reduce(function (n, s) {
        return n + (Array.isArray(s.items) ? s.items.length : 0);
    }, 0);
    return { stores: stores, items: items };
}

test("Catalog: 未匯入時 read() 回傳內建資料", () => {
    const { ctx } = boot();
    assert.equal(ctx.Catalog.hasOverride(), false);
    assert.deepEqual(counts(ctx.Catalog.read()), { stores: 2, items: 3 });
});

test("Catalog: 匯入原始陣列 JSON（取代全部）", () => {
    const { ctx } = boot();
    const result = ctx.Catalog.importFromText(JSON.stringify(IMPORT_CATALOG), "replace");

    assert.equal(result.ok, true);
    assert.deepEqual(counts(ctx.Catalog.read()), { stores: 2, items: 3 });
    assert.equal(ctx.Catalog.read()[0].name, "匯入店一");
    assert.equal(ctx.Catalog.hasOverride(), true);
});

test("Catalog: 匯入 { stores: [...] } 包裝結構", () => {
    const { ctx } = boot();
    const result = ctx.Catalog.importFromText(JSON.stringify({ stores: IMPORT_CATALOG }), "replace");
    assert.equal(result.ok, true);
    assert.equal(ctx.Catalog.read()[1].name, "匯入店二");
});

test("Catalog: 匯入 data/draws.js 原始檔文字（const DRAWS_DATA = [...]）", () => {
    const { ctx } = boot();
    const raw = "const DRAWS_DATA = " + JSON.stringify(IMPORT_CATALOG) + ";\n";
    const result = ctx.Catalog.importFromText(raw, "replace");
    assert.equal(result.ok, true);
    assert.equal(ctx.Catalog.read().length, 2);
});

test("Catalog: 匯出 draws.js 可被再次匯入（round-trip）", () => {
    const { ctx } = boot();
    const first = ctx.Catalog.importFromText(JSON.stringify(IMPORT_CATALOG), "replace");
    assert.equal(first.ok, true);

    const jsText = ctx.Catalog.exportDrawsJsText();
    assert.ok(jsText.indexOf("const DRAWS_DATA = ") >= 0);

    ctx.Catalog.clearOverride();
    const again = ctx.Catalog.importFromText(jsText, "replace");
    assert.equal(again.ok, true);
    assert.equal(ctx.Catalog.read().length, 2);
    assert.equal(ctx.Catalog.read()[0].items.length, 2);
});

test("Catalog: 匯出 JSON 內容與目前清單一致", () => {
    const { ctx } = boot();
    ctx.Catalog.importFromText(JSON.stringify(IMPORT_CATALOG), "replace");
    const parsed = JSON.parse(ctx.Catalog.exportText());
    assert.equal(parsed.app, "funbox-line-catalog");
    assert.equal(parsed.stores.length, 2);
    assert.equal(parsed.stores[1].name, "匯入店二");
});

test("Catalog: 合併模式（依 city+name 更新既有、新增缺漏）", () => {
    const { ctx } = boot();
    const patch = [
        {
            city: "台北市",
            name: "內建店一",
            items: [{ id: "x1", product: "更新後商品", link: "https://lin.ee/x1" }]
        },
        {
            city: "新竹市",
            name: "全新店",
            items: [{ id: "x2", product: "全新商品", link: "https://lin.ee/x2" }]
        }
    ];
    const result = ctx.Catalog.importFromText(JSON.stringify(patch), "merge");

    assert.equal(result.ok, true);
    assert.equal(result.added.length, 1);
    assert.equal(result.updated.length, 1);

    const list = ctx.Catalog.read();
    assert.equal(list.length, 3); // 內建店一(更新) + 內建店二(保留) + 全新店
    const tpeStore = list.filter(function (s) { return s.name === "內建店一"; })[0];
    assert.equal(tpeStore.items[0].product, "更新後商品");
    assert.equal(list[1].name, "內建店二"); // 未受影響的門市原封不動
});

test("Catalog: 無效內容會拒絕匯入且不影響現有資料", () => {
    const { ctx } = boot();
    ctx.Catalog.importFromText(JSON.stringify(IMPORT_CATALOG), "replace");

    // 空白
    let r = ctx.Catalog.importFromText("", "replace");
    assert.equal(r.ok, false);
    assert.ok(r.errors.length >= 1);

    // 非 JSON
    r = ctx.Catalog.importFromText("這不是 JSON", "replace");
    assert.equal(r.ok, false);

    // 結構不符（非陣列、無 stores）
    r = ctx.Catalog.importFromText(JSON.stringify({ foo: 1 }), "replace");
    assert.equal(r.ok, false);

    // 門市缺少必要欄位
    const bad = [{ city: "台北市", name: "", items: [{ product: "P", link: "https://lin.ee/p" }] }];
    r = ctx.Catalog.importFromText(JSON.stringify(bad), "replace");
    assert.equal(r.ok, false);
    assert.ok(r.errors.some(function (e) { return e.indexOf("name") >= 0; }));

    // 商品缺少 link
    const bad2 = [{ city: "台北市", name: "店", items: [{ product: "P" }] }];
    r = ctx.Catalog.importFromText(JSON.stringify(bad2), "replace");
    assert.equal(r.ok, false);

    // 上述失敗都不應覆蓋先前成功匯入的資料
    assert.equal(ctx.Catalog.hasOverride(), true);
    assert.equal(ctx.Catalog.read()[0].name, "匯入店一");
});

test("Catalog: 跨「重新整理」保留覆蓋資料", () => {
    const first = boot();
    first.ctx.Catalog.importFromText(JSON.stringify(IMPORT_CATALOG), "replace");

    const second = boot(first.storage.snapshot());
    assert.equal(second.ctx.Catalog.hasOverride(), true);
    assert.deepEqual(counts(second.ctx.Catalog.read()), { stores: 2, items: 3 });
});

test("Catalog: clearOverride 回復內建資料並通知監聽者", () => {
    const { ctx } = boot();
    let notified = 0;
    ctx.Catalog.onChange(function () { notified++; });

    ctx.Catalog.importFromText(JSON.stringify(IMPORT_CATALOG), "replace");
    assert.equal(notified, 1);

    ctx.Catalog.clearOverride();
    assert.equal(notified, 2);
    assert.equal(ctx.Catalog.hasOverride(), false);
    assert.equal(ctx.Catalog.read()[0].name, "內建店一");
});

test("Catalog: 缺少 id 的項目在匯入後會被自動補上唯一 id", () => {
    const { ctx } = boot();
    const noIds = [
        { city: "台北市", name: "無ID店", items: [{ product: "P1", link: "https://lin.ee/p1" }] }
    ];
    const r = ctx.Catalog.importFromText(JSON.stringify(noIds), "replace");
    assert.equal(r.ok, true);
    const item = ctx.Catalog.read()[0].items[0];
    assert.ok(typeof item.id === "string" && item.id.length > 0);
});
