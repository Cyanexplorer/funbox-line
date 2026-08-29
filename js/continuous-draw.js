/**
 * Funbox 連續抽選引擎 (Continuous Draw Engine)
 * 自動優先抽取您加星標記的「我的最愛 (⭐)」項目，抽完後依序接續抽選
 */
(function (window) {
    "use strict";

    var DRAWN_KEY = "funbox_continuous_draw_v9_drawn";
    var stores = [];
    var currentCity = "all";
    var currentItem = null;
    var skippedUrls = {};

    function $id(id) { return document.getElementById(id); }

    function readJson(key) {
        try { return JSON.parse(localStorage.getItem(key) || "{}"); }
        catch (e) { return {}; }
    }

    function writeJson(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    }

    function drawnMap() {
        return readJson(DRAWN_KEY);
    }

    function markDrawn(product) {
        if (!product || !product.url) return;
        var map = drawnMap();
        map[product.url] = true;
        writeJson(DRAWN_KEY, map);

        if (product.link) {
            product.link.classList.add("clicked");
        }
        if (product.element) {
            product.element.classList.add("quick-drawn");
        }
    }

    function isDrawn(product) {
        if (!product || !product.url) return false;
        return !!drawnMap()[product.url];
    }

    function syncDrawnRows() {
        var map = drawnMap();

        stores.forEach(function (store) {
            store.products.forEach(function (product) {
                if (map[product.url]) {
                    if (product.element) product.element.classList.add("quick-drawn");
                    if (product.link) product.link.classList.add("clicked");
                } else {
                    if (product.element) product.element.classList.remove("quick-drawn");
                }
            });
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

    function collectStores() {
        var result = [];

        document.querySelectorAll("#page-draws .draw-store").forEach(function (storeEl) {
            var city = storeEl.getAttribute("data-draw-city") || "未分類";
            var nameEl = storeEl.querySelector(".draw-store-name");
            var name = nameEl ? nameEl.textContent.trim() : "";
            var products = [];

            storeEl.querySelectorAll(".draw-item").forEach(function (itemEl) {
                var productEl = itemEl.querySelector(".draw-product");
                var linkEl = itemEl.querySelector(".draw-link");
                if (!productEl || !linkEl || !linkEl.href) return;

                products.push({
                    product: productEl.textContent.trim(),
                    url: linkEl.href,
                    element: itemEl,
                    link: linkEl
                });
            });

            if (name && products.length) {
                result.push({
                    city: city,
                    name: name,
                    products: products,
                    element: storeEl
                });
            }
        });

        return result;
    }

    function filteredStores() {
        if (currentCity === "all") return stores;
        if (currentCity === "fav") {
            return stores.filter(function (store) {
                if (window.Favorites) {
                    for (var i = 0; i < store.products.length; i++) {
                        if (window.Favorites.isFavItem(store.products[i].url)) {
                            return true;
                        }
                    }
                }
                return false;
            });
        }
        return stores.filter(function (store) {
            return store.city === currentCity;
        });
    }

    /**
     * 尋找下一個候選抽獎項目（有 ⭐ 加星的最愛項目最優先）
     */
    function findNextItem() {
        var list = filteredStores();
        var candidates = [];

        for (var s = 0; s < list.length; s++) {
            var store = list[s];

            for (var p = 0; p < store.products.length; p++) {
                var product = store.products[p];

                if (isDrawn(product)) continue;
                if (skippedUrls[product.url]) continue;
                if (!hasStarted(product)) continue;

                // 若篩選為「⭐ 我的最愛」，且該項目未加星，則略過
                var isStarred = window.Favorites ? window.Favorites.isFavItem(product.url) : false;
                if (currentCity === "fav" && !isStarred) {
                    continue;
                }

                candidates.push({
                    store: store,
                    product: product,
                    storeIndex: s,
                    productIndex: p,
                    isStarred: isStarred,
                    priority: isStarred ? 1 : 0,
                    order: candidates.length
                });
            }
        }

        if (!candidates.length) return null;

        // 依星號最愛優先度排序 (1 > 0)，相同者依預設順序
        candidates.sort(function (a, b) {
            if (b.priority !== a.priority) {
                return b.priority - a.priority;
            }
            return a.order - b.order;
        });

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

        var list = filteredStores();
        var candidate = findNextItem();
        currentItem = candidate;

        if (!list.length) {
            progress.textContent = "目前篩選條件下沒有抽選資料";
            storeEl.textContent = "";
            productEl.textContent = "";
            open.disabled = true;
            next.disabled = true;
            if (skip) skip.disabled = true;
            return;
        }

        if (!candidate) {
            progress.textContent = "🎉 目前沒有已開始且尚未抽取的項目";
            storeEl.textContent = "之後開始的項目會在開始時間到達後自動加入連續抽選";
            productEl.textContent = "";
            open.disabled = true;
            next.disabled = true;
            if (skip) skip.disabled = true;
            return;
        }

        // 標籤提示
        var badgeHtml = candidate.isStarred ? '<span class="draw-tag-badge badge-fav-both">⭐ 我的最愛</span>' : '';

        progress.innerHTML = "門市進度：第 " + (candidate.storeIndex + 1) + " / " + list.length + " 家" + badgeHtml;
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

    function init() {
        stores = collectStores();
        currentCity = "all";

        syncDrawnRows();
        render();

        var openBtn = $id("continuousDrawOpen");
        var nextBtn = $id("continuousDrawNext");
        var skipBtn = $id("continuousDrawSkip");

        if (openBtn) openBtn.onclick = openCurrent;
        if (nextBtn) nextBtn.onclick = completeAndOpenNext;
        if (skipBtn) skipBtn.onclick = skipCurrent;

        // 監聽 Favorites 變更事件自動重繪
        if (window.Favorites) {
            window.Favorites.onChange(function () {
                render();
            });
        }
    }

    var ContinuousDraw = {
        init: init,
        render: render,
        setCity: setCityFromTopFilter,
        syncDrawnRows: syncDrawnRows,
        markDrawn: markDrawn,
        refreshStores: function () {
            stores = collectStores();
            render();
        }
    };

    window.ContinuousDraw = ContinuousDraw;

})(window);
