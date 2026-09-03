/**
 * 測試共用工具：以 vm 建立「瀏覽器沙箱」，讓瀏覽器專用模組可在 Node 中載入測試。
 *
 * 原理：
 * - 每個測試建立全新的 vm context，並注入 window/document/localStorage/DRAWS_DATA 等
 *   全域物件（window 指向沙箱自身，模組以 IIFE 掛載屬性到 window 上，跨 script 保留）。
 * - localStorage 為純記憶體實作，可跨「重新載入」模擬（snapshot → 新沙箱 seed）。
 * - document 為極簡 stub：預設 getElementById 回傳 null（render 會安全略過）；
 *   lazy=true 時會「隨取隨建」元素，供 App 層級整合測試直接渲染。
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");

function src(relPath) {
    return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

/** 純記憶體 localStorage（key → string） */
function makeStorage(seed) {
    const data = Object.assign({}, seed || {});
    return {
        data: data,
        getItem: function (k) {
            return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null;
        },
        setItem: function (k, v) {
            data[k] = String(v);
        },
        removeItem: function (k) {
            delete data[k];
        },
        snapshot: function () {
            return Object.assign({}, data);
        }
    };
}

function makeElement(id) {
    return {
        id: id || "",
        style: {},
        attrs: {},
        dataset: {},
        classList: {
            _set: new Set(),
            add: function (c) { this._set.add(c); },
            remove: function (c) { this._set.delete(c); },
            toggle: function (c) {
                if (this._set.has(c)) { this._set.delete(c); return false; }
                this._set.add(c); return true;
            },
            contains: function (c) { return this._set.has(c); }
        },
        setAttribute: function (k, v) { this.attrs[k] = String(v); },
        getAttribute: function (k) {
            return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null;
        },
        textContent: "",
        innerHTML: "",
        disabled: false,
        value: "",
        files: [],
        onclick: null,
        onchange: null,
        oninput: null,
        appendChild: function () {},
        removeChild: function () {},
        querySelector: function () { return null; },
        querySelectorAll: function () { return []; },
        children: []
    };
}

/** 極簡 document stub；lazy=true 時 getElementById 會隨取隨建元素並暫存 */
function makeDocument(opts) {
    const options = opts || {};
    const elements = new Map();
    return {
        elements: elements,
        getElementById: function (id) {
            if (options.lazy !== false && !elements.has(id)) {
                elements.set(id, makeElement(id));
            }
            return elements.get(id) || null;
        },
        querySelectorAll: function () { return []; },
        querySelector: function () { return null; },
        createElement: function (tag) { return makeElement(tag); },
        body: makeElement("body"),
        readyState: "complete",
        addEventListener: function () {}
    };
}

function createSandbox(opts) {
    const sandbox = {
        console: console,
        localStorage: opts.storage || makeStorage(),
        document: opts.document || makeDocument(),
        DRAWS_DATA: opts.draws || [],
        STORE_FRIENDS_DATA: opts.storeFriends || []
    };
    sandbox.window = sandbox; // 讓模組的 (function(window){...})(window) 寫入沙箱本身
    return vm.createContext(sandbox);
}

/** 載入指定模組（依序執行） */
function loadModules(ctx, relPaths) {
    relPaths.forEach(function (rel) {
        vm.runInContext(src(rel), ctx, { filename: rel });
    });
}

/** 只載入指定模組的輕量沙箱（無自動 init） */
function bootModules(relPaths, opts) {
    const o = opts || {};
    const storage = makeStorage(o.seed);
    const document = o.document || makeDocument({ lazy: false });
    const ctx = createSandbox({
        storage: storage,
        document: document,
        draws: o.draws,
        storeFriends: o.storeFriends
    });
    loadModules(ctx, relPaths);
    return { ctx: ctx, storage: storage, document: document };
}

/** 完整啟動 App（含 app.js 自動 init） */
function bootApp(opts) {
    const o = opts || {};
    const storage = makeStorage(o.seed);
    const document = makeDocument({ lazy: true });
    const ctx = createSandbox({
        storage: storage,
        document: document,
        draws: o.draws || [],
        storeFriends: o.storeFriends || []
    });
    loadModules(ctx, [
        "js/catalog.js",
        "js/geo.js",
        "js/favorites.js",
        "js/continuous-draw.js",
        "js/app.js"
    ]);
    return { ctx: ctx, storage: storage, document: document };
}

/** 抓取沙箱元素（等同 document.getElementById 結果） */
function el(documentStub, id) {
    return documentStub.getElementById(id);
}

module.exports = {
    ROOT: ROOT,
    src: src,
    makeStorage: makeStorage,
    makeDocument: makeDocument,
    makeElement: makeElement,
    bootModules: bootModules,
    bootApp: bootApp,
    el: el
};
