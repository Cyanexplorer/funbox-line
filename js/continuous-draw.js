/**
 * Funbox 連續抽選引擎 (Continuous Draw Engine)
 * 支援「依商品開始時間自動判斷」、「地區/商品篩選聯動」與「我的最愛優先抽選排序」
 */
(function (window) {
    "use strict";

    var DRAWN_KEY = "funbox_continuous_draw_v9_drawn";
    var stores = [];
    var currentCity = "all";
    var currentProduct = "all";
    var currentKeyword = "";
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
     * 支援商品名稱內的：
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
                if (window.Favorites && window.Favorites.isFavRegion(store.city)) return true;
                if (window.Favorites) {
                    for (var i = 0; i < store.products.length; i++) {
                        if (window.Favorites.isFavProduct(store.products[i].product) ||
                            window.Favorites.isFavItem(store.products[i].url)) {
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
     * 尋找下一個候選抽獎項目 (支援最愛優先排序與品相過濾)
     */
    function findNextItem() {
        var list = filteredStores();
        var mode = window.Favorites ? window.Favorites.getDrawMode() : "fav-first";
        var candidates = [];

        for (var s = 0; s < list.length; s++) {
            var store = list[s];

            for (var p = 0; p < store.products.length; p++) {
                var product = store.products[p];

                if (isDrawn(product)) continue;
                if (skippedUrls[product.url]) continue;
                if (!hasStarted(product)) continue;

                // 檢查是否符合商品品相篩選
                if (currentProduct !== "all" && product.product.indexOf(currentProduct) === -1) {
                    continue;
                }

                // 檢查關鍵字篩選
                if (currentKeyword) {
                    var combined = (product.product + " " + store.name + " " + store.city).toLowerCase();
                    if (combined.indexOf(currentKeyword) === -1) {
                        continue;
                    }
                }

                var priority = 0;
                if (window.Favorites) {
                    priority = window.Favorites.getPriorityScore(product.product, store.city, product.url);
                }

                // 若模式為「只抽最愛」，非最愛項目直接略過
                if (mode === "fav-only" && priority === 0) {
                    continue;
                }

                candidates.push({
                    store: store,
                    product: product,
                    storeIndex: s,
                    productIndex: p,
                    priority: priority,
                    order: candidates.length
                });
            }
        }

        if (!candidates.length) return null;

        if (mode === "fav-first" || mode === "fav-only") {
            // 依優先度由高至低排序，優先度相同者維持原始順序
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

        var list = filteredStores();
        var candidate = findNextItem();
        currentItem = candidate;

        // 更新模式按鈕 active 狀態
        var currentMode = window.Favorites ? window.Favorites.getDrawMode() : "fav-first";
        document.querySelectorAll(".draw-mode-btn").forEach(function (btn) {
            var mode = btn.getAttribute("data-mode");
            if (mode === currentMode) {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        });

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
            if (currentMode === "fav-only") {
                progress.textContent = "🎉 所有符合篩選與「我的最愛」的已開始項目均已抽選完成！";
                storeEl.textContent = "若要抽選其他項目，請切換至「優先抽選最愛」或「全部依序」";
            } else {
                progress.textContent = "🎉 目前篩選條件下沒有尚未抽取的已開始項目";
                storeEl.textContent = "您可以切換地區/品相篩選或等待開抽時間到達";
            }
            productEl.textContent = "";
            open.disabled = true;
            next.disabled = true;
            if (skip) skip.disabled = true;
            return;
        }

        // 標籤提示
        var badgeHtml = "";
        if (candidate.priority === 3) {
            badgeHtml = '<span class="draw-tag-badge badge-fav-both">⭐ 最愛品相 + 地區</span>';
        } else if (candidate.priority === 2) {
            badgeHtml = '<span class="draw-tag-badge badge-fav-product">⭐ 最愛品相</span>';
        } else if (candidate.priority === 1) {
            badgeHtml = '<span class="draw-tag-badge badge-fav-region">⭐ 最愛地區</span>';
        }

        progress.innerHTML = "門市進度：第 " + (candidate.storeIndex + 1) + " / " + list.length + " 家" + badgeHtml;
        storeEl.textContent = candidate.store.city + " · " + candidate.store.name + "　（" + candidate.store.products.length + " 個商品）";
        productEl.textContent = candidate.product.product;

        open.disabled = false;
        next.disabled = false;
        if (skip) skip.disabled = false;
        open.setAttribute("data-url", candidate.product.url);
    }

    function setFilters(region, product, keyword) {
        currentCity = region || "all";
        currentProduct = product || "all";
        currentKeyword = keyword || "";
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
        currentProduct = "all";
        currentKeyword = "";

        syncDrawnRows();
        render();

        var openBtn = $id("continuousDrawOpen");
        var nextBtn = $id("continuousDrawNext");
        var skipBtn = $id("continuousDrawSkip");

        if (openBtn) openBtn.onclick = openCurrent;
        if (nextBtn) nextBtn.onclick = completeAndOpenNext;
        if (skipBtn) skipBtn.onclick = skipCurrent;

        // 綁定模式切換按鈕
        document.querySelectorAll(".draw-mode-btn").forEach(function (btn) {
            btn.onclick = function () {
                var mode = btn.getAttribute("data-mode");
                if (window.Favorites) {
                    window.Favorites.setDrawMode(mode);
                }
                skippedUrls = {};
                render();
            };
        });

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
        setFilters: setFilters,
        setCity: function (region) {
            setFilters(region, currentProduct, currentKeyword);
        },
        syncDrawnRows: syncDrawnRows,
        markDrawn: markDrawn,
        refreshStores: function () {
            stores = collectStores();
            render();
        }
    };

    window.ContinuousDraw = ContinuousDraw;

})(window);
