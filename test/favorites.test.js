"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers/harness");

function boot() {
    return h.bootModules(["js/favorites.js"], {});
}

test("Favorites: 加星/取消加星與 count", () => {
    const { ctx } = boot();
    const F = ctx.Favorites;
    const url = "https://lin.ee/abc";

    assert.equal(F.count(), 0);
    F.toggleItem(url);
    assert.equal(F.isFavItem(url), true);
    assert.equal(F.count(), 1);

    F.toggleItem(url);
    assert.equal(F.isFavItem(url), false);
    assert.equal(F.count(), 0);
});

test("Favorites: 結尾斜線視為同一鍵（normalize）", () => {
    const { ctx } = boot();
    const F = ctx.Favorites;

    F.toggleItem("https://lin.ee/abc/");
    assert.equal(F.isFavItem("https://lin.ee/abc"), true);
    assert.equal(F.count(), 1);

    F.toggleItem("https://lin.ee/abc");
    assert.equal(F.isFavItem("https://lin.ee/abc"), false);
    assert.equal(F.count(), 0);
});

test("Favorites: 跨「重新整理」仍保留（localStorage 持久化）", () => {
    const first = boot();
    first.ctx.Favorites.toggleItem("https://lin.ee/persist-me");

    // 模擬重新整理：以相同 storage 內容開啟新沙箱
    const second = h.bootModules(["js/favorites.js"], { seed: first.storage.snapshot() });
    assert.equal(second.ctx.Favorites.isFavItem("https://lin.ee/persist-me"), true);
    assert.equal(second.ctx.Favorites.count(), 1);
});

test("Favorites: onChange 監聽器在變更時被呼叫", () => {
    const { ctx } = boot();
    const F = ctx.Favorites;
    let calls = 0;
    F.onChange(function () { calls++; });

    F.toggleItem("https://lin.ee/x");
    F.toggleItem("https://lin.ee/y");
    assert.equal(calls, 2);
});
