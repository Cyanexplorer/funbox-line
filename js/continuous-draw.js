/**
 * Funbox 連續抽選引擎 (Continuous Draw Engine)
 * 支援「依商品開始時間自動判斷」與「🌟 優先抽我的最愛」、「🎯 只抽我的最愛」、「📋 全部依序」三種模式
 * 直接依據清單就地標記的星號 (⭐) 進行最愛判斷
 */
(function (window) {
    "use strict";

    var DRAWN_KEY = "funbox_continuous_draw_v9_drawn";
    var DRAW_MODE_KEY = "funbox_continuous_draw_mode_v1";

    var stores = [];
    var currentCity = "all";
    var currentItem = null;
    var skippedUrls = {};

    function $id(id) { return document.getElementById(id); }

    function readJson(key, defaultVal) {
        try {
            var data = localStorage.getItem(key);
            return data ? JSON.parse(data) : defaultVal;
        } catch (e) {
            return defaultVal;
        }
    }

    function writeJson(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    }

    function getDrawMode() {
        return localStorage.getItem(DRAW_MODE_KEY) || "fav-first";
    }

    function setDrawMode(mode) {
        localStorage.setItem(DRAW_MODE_KEY, mode);
        skippedUrls = {};
        render();
    }

    function drawnMap() {
        return readJson(DRAWN_KEY, {});
    }

    function markDrawn(product) {
        if (!product || !product.url) return;
        var map = drawnMap();
        map[product.url] = true;
        writeJson(DRAWN_KEY, map);

        syncDrawnRows();
    }

    function unmarkDrawn(url) {
        if (!url) return;
        var map = drawnMap();
        delete map[url];
        writeJson(DRAWN_KEY, map);

        var visited = readJson("visited_draw_links", []);
        var idx = visited.indexOf(url);
        if (idx > -1) {
            visited.splice(idx, 1);
            writeJson("visited_draw_links", visited);
        }

        syncDrawnRows();
    }

    function resetDrawn() {
        localStorage.removeItem(DRAWN_KEY);
        localStorage.removeItem("visited_draw_links");
        skippedUrls = {};
        syncDrawnRows();
        render();
    }

    function isDrawn(product) {
        if (!product || !product.url) return false;
        return !!drawnMap()[product.url];
    }

    function syncDrawnRows() {
        var map = drawnMap();

        document.querySelectorAll("#page-draws .draw-item").forEach(function (itemEl) {
            var url = itemEl.getAttribute("data-draw-url");
            var linkEl = itemEl.querySelector(".draw-link");
            if (url && map[url]) {
                itemEl.classList.add("quick-drawn");
                if (linkEl) linkEl.classList.add("clicked");
            } else {
                itemEl.classList.remove("quick-drawn");
                if (linkEl) linkEl.classList.remove("clicked");
            }
        });
    }

    /**
     * 支援商品名稱內的開始時間判斷：
     * （8/29 11:00才開始）
     * （8/29 11:00開始）
     * (8/29 11:00才開始)
     */
    function getProductStartTime(productText) {
        if (!productText) return null;
        var match = productText.match(
            /[（(]\s*(\d{1,2})\s*\/\s*(\d{1,2})\s+([01]?\d|2[0-3]):([0-5]\d)\s*(?:才)?開始\s*[）)]/
        );

        if (!match) return null;

        var now = new Date();
        var year = now.getFullYear();
        var month = parseInt(match[1], 10);
        var day = parseInt(match[2], 10);
        var hour = parseInt(match[3], 10);
        var minute = parseInt(match[4], 10);

        var start = new Date(year, month - 1, day, hour, minute, 0, 0);

        // 跨年情況處理
        if (start.getTime() < now.getTime() && month < (now.getMonth() + 1) - 6) {
            start.setFullYear(year + 1);
        }

        return start;
    }

    function hasStarted(product) {
        var start = getProductStartTime(product.product);
        return !start || new Date() >= start;
    }

    function loadStores() {
        if (typeof DRAWS_DATA !== "undefined" && Array.isArray(DRAWS_DATA) && DRAWS_DATA.length > 0) {
            return DRAWS_DATA.map(function (store) {
                return {
                    city: store.city,
                    name: store.name,
                    startTime: store.startTime,
                    products: store.items.map(function (item) {
                        return {
                            id: item.id,
                            product: item.product,
                            url: item.link
                        };
                    })
                };
            });
        }
        return [];
    }

    function filteredStores() {
        if (currentCity === "all" || currentCity === "fav") return stores;
        return stores.filter(function (store) {
            return store.city === currentCity;
        });
    }

    /**
     * 從目前縣市中，找「尚未抽 + 已經開始」的商品
     * 支援最愛優先排序
     */
    function findNextItem() {
        var list = filteredStores();
        var mode = getDrawMode();
        var candidates = [];

        for (var s = 0; s < list.length; s++) {
            var store = list[s];

            for (var p = 0; p < store.products.length; p++) {
                var product = store.products[p];

                if (isDrawn(product)) continue;
                if (skippedUrls[product.url]) continue;
                if (!hasStarted(product)) continue;

                var isStarred = window.Favorites ? (window.Favorites.isFavItem(product.url) || window.Favorites.isFavItem(product.id)) : false;

                // 若模式為「只抽我的最愛」，非加星項目直接略過
                if (mode === "fav-only" && !isStarred) {
                    continue;
                }

                var priority = 0;
                if (mode === "fav-first" || mode === "fav-only") {
                    priority = isStarred ? 1 : 0;
                }

                candidates.push({
                    store: store,
                    product: product,
                    storeIndex: s,
                    productIndex: p,
                    isStarred: isStarred,
                    priority: priority,
                    order: candidates.length
                });
            }
        }

        if (!candidates.length) return null;

        if (mode === "fav-first" || mode === "fav-only") {
            // 依星號最愛優先度排序 (1 > 0)，相同者依預設順序
            candidates.sort(function (a, b) {
                if (b.priority !== a.priority) {
                    return b.priority - a.priority;
                }
                return a.order - b.order;
            });
        }

        return candidates[0];
    }

    function render() {
        var progress = $id("continuousDrawProgress");
        var storeEl = $id("continuousDrawStore");
        var productEl = $id("continuousDrawProduct");
        var open = $id("continuousDrawOpen");
        var next = $id("continuousDrawNext");
        var skip = $id("continuousDrawSkip");

        if (!progress || !storeEl || !productEl || !open || !next) return;

        if (!stores.length) {
            stores = loadStores();
        }

        var list = filteredStores();
        var candidate = findNextItem();
        var currentMode = getDrawMode();
        currentItem = candidate;

        // 同步模式按鈕狀態
        document.querySelectorAll(".draw-mode-btn").forEach(function (btn) {
            btn.classList.toggle("active", btn.getAttribute("data-mode") === currentMode);
        });

        if (!list.length) {
            progress.textContent = "目前篩選條件下沒有抽選門市資料";
            storeEl.textContent = "";
            productEl.textContent = "";
            open.disabled = true;
            next.disabled = true;
            if (skip) skip.disabled = true;
            return;
        }

        if (!candidate) {
            if (currentMode === "fav-only") {
                var favCount = window.Favorites ? window.Favorites.count() : 0;
                if (favCount === 0) {
                    progress.textContent = "⭐ 目前尚未加入任何最愛項目";
                    storeEl.textContent = "請在下方清單中點擊 ★ 加入最愛，將自動在此處優先連續抽選！";
                    productEl.textContent = "";
                } else {
                    progress.innerHTML = "目前沒有已開始且尚未抽取的「最愛」項目 <button type=\"button\" class=\"btn-reset-drawn\" onclick=\"ContinuousDraw.resetDrawn()\">🔄 重設已抽</button>";
                    storeEl.textContent = "若包含未開始的商品（如 11:00 開抽），會在到達開始時間後自動加入抽選";
                    productEl.textContent = "";
                }
            } else {
                progress.innerHTML = "目前沒有已開始且尚未抽取的抽選 <button type=\"button\" class=\"btn-reset-drawn\" onclick=\"ContinuousDraw.resetDrawn()\">🔄 重設已抽</button>";
                storeEl.textContent = "之後開始的項目會在開始時間到達後自動加入連續抽選";
                productEl.textContent = "";
            }
            open.disabled = true;
            next.disabled = true;
            if (skip) skip.disabled = true;
            return;
        }

        // 標籤提示
        var badgeHtml = candidate.isStarred ? '<span class="draw-tag-badge badge-fav-both">⭐ 我的最愛</span>' : '';

        progress.innerHTML = "門市進度：第 " + (candidate.storeIndex + 1) + " / " + list.length + " 家 " + badgeHtml + " <button type=\"button\" class=\"btn-reset-drawn\" onclick=\"ContinuousDraw.resetDrawn()\">🔄 重設已抽</button>";
        storeEl.textContent = candidate.store.city + " · " + candidate.store.name + "　（" + candidate.store.products.length + " 個商品）";
        productEl.textContent = candidate.product.product;

        open.disabled = false;
        next.disabled = false;
        if (skip) skip.disabled = false;
        open.setAttribute("data-url", candidate.product.url);
    }

    function setCityFromTopFilter(region) {
        currentCity = region || "all";
        skippedUrls = {};
        render();
    }

    function openCurrent() {
        if (!currentItem || !currentItem.product) return;
        if (!hasStarted(currentItem.product)) {
            render();
            return;
        }
        window.open(currentItem.product.url, "_blank");
    }

    function completeAndOpenNext() {
        if (!currentItem || !currentItem.product) {
            render();
            return;
        }

        if (!hasStarted(currentItem.product)) {
            render();
            return;
        }

        markDrawn(currentItem.product);

        var nextItem = findNextItem();
        currentItem = nextItem;
        render();

        if (nextItem && nextItem.product) {
            window.open(nextItem.product.url, "_blank");
        }
    }

    function skipCurrent() {
        if (!currentItem || !currentItem.product) return;
        skippedUrls[currentItem.product.url] = true;
        render();
    }

    var initialized = false;

    function init() {
        stores = loadStores();
        currentCity = "all";

        syncDrawnRows();
        render();

        if (!initialized) {
            initialized = true;

            var openBtn = $id("continuousDrawOpen");
            var nextBtn = $id("continuousDrawNext");
            var skipBtn = $id("continuousDrawSkip");

            if (openBtn) openBtn.onclick = openCurrent;
            if (nextBtn) nextBtn.onclick = completeAndOpenNext;
            if (skipBtn) skipBtn.onclick = skipCurrent;

            // 綁定連續抽選模式切換按鈕
            document.querySelectorAll(".draw-mode-btn").forEach(function (btn) {
                btn.onclick = function () {
                    var mode = btn.getAttribute("data-mode");
                    setDrawMode(mode);
                };
            });

            // 監聽 Favorites 變更事件自動重繪
            if (window.Favorites) {
                window.Favorites.onChange(function () {
                    render();
                });
            }
        }
    }

    var ContinuousDraw = {
        init: init,
        render: render,
        setCity: setCityFromTopFilter,
        setDrawMode: setDrawMode,
        getDrawMode: getDrawMode,
        syncDrawnRows: syncDrawnRows,
        markDrawn: markDrawn,
        unmarkDrawn: unmarkDrawn,
        resetDrawn: resetDrawn,
        refreshStores: function () {
            stores = loadStores();
            render();
        }
    };

    window.ContinuousDraw = ContinuousDraw;

})(window);
