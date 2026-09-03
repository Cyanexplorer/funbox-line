"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers/harness");

// 使用者位置固定（台北車站附近），三家店距離遠近分明
const USER = { lat: 25.0470, lng: 121.5170 };
const GEO_CATALOG = [
    {   // 資料順序第一，但最遠（台中）
        city: "台中市", name: "StoreFar", lat: 24.1552, lng: 120.6618,
        items: [{ id: "f1", product: "PF-1", link: "https://lin.ee/f1" }]
    },
    {   // 中間距離（桃園）
        city: "桃園市", name: "StoreMid", lat: 25.0012, lng: 121.2287,
        items: [{ id: "m1", product: "PM-1", link: "https://lin.ee/m1" }]
    },
    {   // 最近（台北）
        city: "台北市", name: "StoreNear", lat: 25.0526, lng: 121.5214,
        items: [{ id: "n1", product: "PN-1", link: "https://lin.ee/n1" }]
    }
];

function idx(listEl, text) {
    return listEl.innerHTML.indexOf(text);
}

test("Geo: Haversine 距離合理", () => {
    const env = h.bootModules(["js/geo.js"], {});
    const G = env.ctx.Geo;
    // 緯度差 1 度 ≈ 111 公里
    const d = G.distanceMeters(25, 121.5, 26, 121.5) / 1000;
    assert.ok(d > 105 && d < 117, "1 度緯度應約 111km，實際 " + d);
    // 同點為 0
    assert.equal(G.distanceMeters(25, 121.5, 25, 121.5), 0);
});

test("Geo: nearestCompare 由近而遠，缺座標者排最後", () => {
    const env = h.bootModules(["js/geo.js"], {});
    const cmp = env.ctx.Geo.nearestCompare(25.0470, 121.5170);
    const list = [
        { name: "far", lat: 24.1552, lng: 120.6618 },
        { name: "near", lat: 25.0526, lng: 121.5214 },
        { name: "nocoord" }
    ];
    list.sort(cmp);
    assert.deepEqual(list.map(function (s) { return s.name; }), ["near", "far", "nocoord"]);
});

test("整合: enableGeoSort 讓清單與連續抽選改為由近而遠", () => {
    const { ctx, document } = h.bootApp({ draws: GEO_CATALOG });
    const listEl = h.el(document, "drawListContainer");

    // 初始 = 資料順序（遠店在前）
    assert.ok(idx(listEl, "StoreFar") < idx(listEl, "StoreNear"));
    assert.equal(ctx.ContinuousDraw._test.getGeoLocation().lat, null);

    // 開啟由近而遠（直接注入座標，等同定位成功）
    ctx.App.enableGeoSort(USER.lat, USER.lng);
    assert.equal(ctx.App.isGeoActive(), true);
    assert.ok(idx(listEl, "StoreNear") < idx(listEl, "StoreMid"),
        "清單：近店應在遠店之前");
    assert.ok(idx(listEl, "StoreMid") < idx(listEl, "StoreFar"));

    // 連續抽選第一個候選應為最近店的商品
    const cand = ctx.ContinuousDraw._test.findNextItem();
    assert.equal(cand.product.url, "https://lin.ee/n1");
    assert.equal(cand.store.name, "StoreNear");
    const loc = ctx.ContinuousDraw._test.getGeoLocation();
    assert.equal(loc.lat, USER.lat);
    assert.equal(loc.lng, USER.lng);

    // 狀態列出現「離你最近」
    assert.ok(h.el(document, "geoSortStatus").innerHTML.indexOf("已開啟") >= 0);
    assert.ok(h.el(document, "geoSortStatus").innerHTML.indexOf("StoreNear") >= 0);
});

test("整合: disableGeoSort 回復原本順序", () => {
    const { ctx, document } = h.bootApp({ draws: GEO_CATALOG });
    const listEl = h.el(document, "drawListContainer");

    ctx.App.enableGeoSort(USER.lat, USER.lng);
    assert.ok(idx(listEl, "StoreNear") < idx(listEl, "StoreFar"));

    ctx.App.disableGeoSort();
    assert.equal(ctx.App.isGeoActive(), false);
    assert.ok(idx(listEl, "StoreFar") < idx(listEl, "StoreNear"), "應回復資料檔順序");
    assert.equal(ctx.ContinuousDraw._test.getGeoLocation().lat, null);
    const cand = ctx.ContinuousDraw._test.findNextItem();
    assert.equal(cand.product.url, "https://lin.ee/f1");
});

test("整合: 排序切換按鈕已綁定", () => {
    const { document } = h.bootApp({ draws: GEO_CATALOG });
    const btn = h.el(document, "geoSortBtn");
    assert.equal(typeof btn.onclick, "function");
    assert.equal(h.el(document, "geoSortStatus").innerHTML.indexOf("定位") >= 0, true);
});
