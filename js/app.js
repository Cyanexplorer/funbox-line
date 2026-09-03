/**
 * Funbox LINE 抽選工具 主應用程式 (App Manager)
 * 負責動態渲染門市列表、抽選活動列表、分頁切換與地區/關鍵字篩選互動
 */
(function (window) {
    "use strict";

    var currentTab = "draws"; // 'draws' | 'stores'
    var currentDrawRegion = "all";
    var currentStoreRegion = "all";
    var currentKeyword = "";
    var geoEnabled = false; // 由近而遠排序是否開啟
    var geoLat = null;      // 使用者目前緯度
    var geoLng = null;      // 使用者目前經度

    function $id(id) { return document.getElementById(id); }

    // 渲染「加門市好友」區域
    function renderStoreFriends() {
        var grid = $id("storeGrid");
        var filterGroup = $id("storeFilterBtnGroup");
        if (!grid || typeof STORE_FRIENDS_DATA === "undefined") return;

        // 統計各區域門市數量
        var regionCounts = {};
        STORE_FRIENDS_DATA.forEach(function (s) {
            regionCounts[s.region] = (regionCounts[s.region] || 0) + 1;
        });

        // 渲染篩選按鈕
        if (filterGroup) {
            var buttonsHtml = '<button class="filter-btn active" data-region="all" onclick="App.filterStoreRegion(\'all\', this)">全部 (' + STORE_FRIENDS_DATA.length + ')</button>';
            for (var region in regionCounts) {
                buttonsHtml += '<button class="filter-btn" data-region="' + region + '" onclick="App.filterStoreRegion(\'' + region + '\', this)">' + region + ' (' + regionCounts[region] + ')</button>';
            }
            filterGroup.innerHTML = buttonsHtml;
        }

        // 渲染門市卡片
        var cardsHtml = "";
        STORE_FRIENDS_DATA.forEach(function (s) {
            cardsHtml += '<div class="card" data-region="' + s.region + '">' +
                '<div class="card-info">' +
                '<div class="store-name">' + s.name + '</div>' +
                '<span class="line-id">' + s.lineId + '</span>' +
                '</div>' +
                '<a class="add-btn" href="' + s.link + '" id="btn-' + s.id + '" onclick="App.markStoreVisited(\'' + s.id + '\')" rel="noopener" target="_blank">＋ 加好友</a>' +
                '</div>';
        });
        grid.innerHTML = cardsHtml;
    }

    // 取得目前有效的抽獎項目清單（優先採用 Catalog 匯入覆蓋，其次內建 DRAWS_DATA）
    function currentDrawData() {
        if (window.Catalog && typeof window.Catalog.read === "function") {
            var catalogData = window.Catalog.read();
            if (Array.isArray(catalogData) && catalogData.length) return catalogData;
        }
        if (typeof DRAWS_DATA !== "undefined" && Array.isArray(DRAWS_DATA)) return DRAWS_DATA;
        return [];
    }

    // 開啟「由近而遠」時，回傳依距離排序過的清單；否則回傳原始順序
    function effectiveDrawData() {
        var data = currentDrawData();
        if (geoEnabled && typeof geoLat === "number" && typeof geoLng === "number" &&
                window.Geo && window.Geo.nearestCompare) {
            return data.slice().sort(window.Geo.nearestCompare(geoLat, geoLng));
        }
        return data;
    }

    // 渲染「抽獎連結」清單區域
    function renderDrawList() {
        var container = $id("drawListContainer");
        var filterGroup = $id("drawFilterBtnGroup");
        var data = effectiveDrawData();
        if (!container || !data.length) return;

        // 統計各縣市門市數量
        var cityStores = {};
        var totalStores = data.length;
        data.forEach(function (store) {
            if (!cityStores[store.city]) cityStores[store.city] = [];
            cityStores[store.city].push(store);
        });

        // 渲染抽獎頁地區篩選按鈕
        if (filterGroup) {
            var filterHtml = '<button class="filter-btn active" data-region="all" onclick="App.filterDrawRegion(\'all\', this)">全部 (' + totalStores + ')</button>';
            filterHtml += '<button class="filter-btn fav-filter-btn" data-region="fav" onclick="App.filterDrawRegion(\'fav\', this)">⭐ 我的最愛</button>';
            for (var city in cityStores) {
                filterHtml += '<button class="filter-btn" data-region="' + city + '" onclick="App.filterDrawRegion(\'' + city + '\', this)">' + city + ' (' + cityStores[city].length + ')</button>';
            }
            filterGroup.innerHTML = filterHtml;
        }

        // 渲染抽獎門市清單
        var listHtml = "";
        for (var city in cityStores) {
            listHtml += '<div class="draw-city-group" data-draw-city-group="' + city + '">';
            listHtml += '<div class="draw-city">' + city + '</div>';

            cityStores[city].forEach(function (store) {
                listHtml += '<div class="draw-store" data-draw-city="' + city + '">';
                listHtml += '<div class="draw-store-header">';
                listHtml += '<div class="draw-store-name">' + store.name + '</div>';
                listHtml += '</div>';
                if (store.startTime) {
                    listHtml += '<div class="draw-start">' + store.startTime + '</div>';
                }

                store.items.forEach(function (item) {
                    var itemId = item.id || ('draw-item-' + Math.random().toString(36).substr(2, 9));
                    var isStarred = window.Favorites && window.Favorites.isFavItem(item.link);
                    var starClass = isStarred ? " active" : "";

                    listHtml += '<div class="draw-item" data-draw-id="' + itemId + '" data-draw-url="' + item.link + '">';
                    listHtml += '<div class="draw-item-left">';
                    listHtml += '<button type="button" class="star-btn' + starClass + '" title="點擊切換最愛收藏" onclick="App.toggleFavItem(\'' + item.link + '\', this)">★</button>';
                    listHtml += '<div class="draw-product">' + item.product + '</div>';
                    listHtml += '</div>';
                    listHtml += '<a class="draw-link" href="' + item.link + '" id="' + itemId + '" onclick="App.markDrawVisited(\'' + itemId + '\')" rel="noopener" target="_blank">＋ 參加抽獎</a>';
                    listHtml += '</div>';
                });

                listHtml += '</div>'; // end draw-store
            });

            listHtml += '</div>'; // end draw-city-group
        }
        container.innerHTML = listHtml;
        bindSearchInput();
    }

    // 關鍵字搜尋綁定
    function bindSearchInput() {
        var searchInput = $id("drawSearchInput");
        var clearBtn = $id("searchClearBtn");
        if (!searchInput) return;

        searchInput.oninput = function () {
            currentKeyword = this.value.trim().toLowerCase();
            if (clearBtn) {
                clearBtn.style.display = currentKeyword ? "flex" : "none";
            }
            applyFilters();
        };

        if (clearBtn) {
            clearBtn.onclick = function () {
                searchInput.value = "";
                currentKeyword = "";
                clearBtn.style.display = "none";
                applyFilters();
                searchInput.focus();
            };
        }
    }

    // 分頁切換
    function showPage(page, btnElement) {
        currentTab = page;
        document.querySelectorAll(".page-tab").forEach(function (btn) {
            btn.classList.remove("active");
        });
        if (btnElement) btnElement.classList.add("active");

        var storesTitle = $id("stores-title");
        var storesSubtitle = $id("stores-subtitle");
        var storeFilter = $id("storeFilterBtnGroup");
        var storeGrid = $id("storeGrid");
        var pageDraws = $id("page-draws");

        if (page === "draws") {
            if (storesTitle) storesTitle.style.display = "none";
            if (storesSubtitle) storesSubtitle.style.display = "none";
            if (storeFilter) storeFilter.style.display = "none";
            if (storeGrid) storeGrid.style.display = "none";
            if (pageDraws) pageDraws.style.display = "block";
        } else {
            if (storesTitle) storesTitle.style.display = "";
            if (storesSubtitle) storesSubtitle.style.display = "";
            if (storeFilter) storeFilter.style.display = "";
            if (storeGrid) storeGrid.style.display = "";
            if (pageDraws) pageDraws.style.display = "none";
        }
    }

    // 抽獎區域篩選
    function filterDrawRegion(region, btnElement) {
        currentDrawRegion = region;
        document.querySelectorAll("#drawFilterBtnGroup .filter-btn").forEach(function (btn) {
            btn.classList.remove("active");
        });
        if (btnElement) btnElement.classList.add("active");

        applyFilters();
    }

    // 執行過濾 (地區 + 關鍵字)
    function applyFilters() {
        var isFavFilter = (currentDrawRegion === "fav");
        var totalMatchedItems = 0;
        var totalMatchedStores = 0;

        document.querySelectorAll("#page-draws .draw-city-group").forEach(function (group) {
            var city = group.getAttribute("data-draw-city-group");
            var cityMatches = (currentDrawRegion === "all" || currentDrawRegion === "fav" || currentDrawRegion === city);
            var hasVisibleStoreInCity = false;

            group.querySelectorAll(".draw-store").forEach(function (storeEl) {
                var storeName = storeEl.querySelector(".draw-store-name") ? storeEl.querySelector(".draw-store-name").textContent : "";
                var visibleItemCountInStore = 0;

                storeEl.querySelectorAll(".draw-item").forEach(function (itemEl) {
                    var url = itemEl.getAttribute("data-draw-url");
                    var prodText = itemEl.querySelector(".draw-product") ? itemEl.querySelector(".draw-product").textContent : "";
                    
                    // 1. 地區與最愛判定
                    var matchRegion = false;
                    if (isFavFilter) {
                        matchRegion = window.Favorites && window.Favorites.isFavItem(url);
                    } else {
                        matchRegion = cityMatches;
                    }

                    // 2. 關鍵字搜尋判定
                    var matchKeyword = true;
                    if (currentKeyword) {
                        var combinedText = (prodText + " " + storeName + " " + city).toLowerCase();
                        matchKeyword = combinedText.indexOf(currentKeyword) > -1;
                    }

                    var itemVisible = (matchRegion && matchKeyword);
                    if (itemVisible) {
                        itemEl.style.display = "";
                        visibleItemCountInStore++;
                        totalMatchedItems++;
                    } else {
                        itemEl.style.display = "none";
                    }
                });

                if (visibleItemCountInStore > 0) {
                    storeEl.style.display = "";
                    hasVisibleStoreInCity = true;
                    totalMatchedStores++;
                } else {
                    storeEl.style.display = "none";
                }
            });

            group.style.display = hasVisibleStoreInCity ? "" : "none";
        });

        // 更新狀態列
        updateFilterStatusBar(totalMatchedStores, totalMatchedItems);

        // 同步通知連續抽選引擎更新目標地區
        if (window.ContinuousDraw) {
            window.ContinuousDraw.setCity(currentDrawRegion);
        }
    }

    function updateFilterStatusBar(matchedStores, matchedItems) {
        var statusEl = $id("filterStatusText");
        if (!statusEl) return;

        var regionLabel = currentDrawRegion === "all" ? "全部" : (currentDrawRegion === "fav" ? "⭐ 我的最愛" : currentDrawRegion);
        var keywordLabel = currentKeyword ? (" ｜ 🔍 「" + currentKeyword + "」") : "";

        statusEl.innerHTML = "📍 目前篩選: <span class=\"highlight\">" + regionLabel + "</span>" + keywordLabel + " ｜ 共符合 <span class=\"highlight\">" + matchedStores + "</span> 間門市、<span class=\"highlight\">" + matchedItems + "</span> 個項目";
    }

    function resetFilters() {
        currentDrawRegion = "all";
        currentKeyword = "";

        var searchInput = $id("drawSearchInput");
        if (searchInput) searchInput.value = "";
        var clearBtn = $id("searchClearBtn");
        if (clearBtn) clearBtn.style.display = "none";

        document.querySelectorAll("#drawFilterBtnGroup .filter-btn").forEach(function (btn) {
            btn.classList.toggle("active", btn.getAttribute("data-region") === "all");
        });

        applyFilters();
    }

    // 加好友門市區域篩選
    function filterStoreRegion(region, btnElement) {
        currentStoreRegion = region;
        document.querySelectorAll("#storeFilterBtnGroup .filter-btn").forEach(function (btn) {
            btn.classList.remove("active");
        });
        if (btnElement) btnElement.classList.add("active");

        document.querySelectorAll("#storeGrid .card").forEach(function (card) {
            if (region === "all" || card.getAttribute("data-region") === region) {
                card.style.display = "flex";
            } else {
                card.style.display = "none";
            }
        });
    }

    // 標記加好友門市已造訪
    function markStoreVisited(id) {
        var btn = $id("btn-" + id);
        if (btn) btn.classList.add("clicked");
        var visited = JSON.parse(localStorage.getItem("visited_lines") || "[]");
        if (visited.indexOf(id) === -1) {
            visited.push(id);
            localStorage.setItem("visited_lines", JSON.stringify(visited));
        }
    }

    // 標記抽獎已造訪
    function markDrawVisited(id) {
        var btn = $id(id);
        if (btn) btn.classList.add("clicked");
        var visited = JSON.parse(localStorage.getItem("visited_draw_links") || "[]");
        if (visited.indexOf(id) === -1) {
            visited.push(id);
            localStorage.setItem("visited_draw_links", JSON.stringify(visited));
        }
    }

    // 還原造訪紀錄狀態
    function restoreVisitedStates() {
        var visitedStores = JSON.parse(localStorage.getItem("visited_lines") || "[]");
        visitedStores.forEach(function (id) {
            var btn = $id("btn-" + id);
            if (btn) btn.classList.add("clicked");
        });

        var visitedDraws = JSON.parse(localStorage.getItem("visited_draw_links") || "[]");
        visitedDraws.forEach(function (id) {
            var btn = $id(id);
            if (btn) btn.classList.add("clicked");
        });
    }

    // 星號收藏項目點擊
    function toggleFavItem(url, starBtn) {
        if (window.Favorites) {
            var willBeStarred = !window.Favorites.isFavItem(url);
            if (willBeStarred && window.ContinuousDraw) {
                window.ContinuousDraw.unmarkDrawn(url);
            }
            window.Favorites.toggleItem(url);
            if (starBtn) {
                starBtn.classList.toggle("active", willBeStarred);
            }
        }
    }

    /* ===== 資料管理：抽獎項目清單 匯入 / 匯出 ===== */

    // 匯入後整頁重新整理：重繪清單、重新載入連續抽選引擎資料並套用目前篩選
    function refreshAllViews() {
        renderDrawList();
        restoreVisitedStates();
        if (window.ContinuousDraw && window.ContinuousDraw.refreshStores) {
            window.ContinuousDraw.refreshStores();
        }
        updateCatalogStatus();
        applyFilters();
    }

    // 更新「目前資料來源」狀態列
    function updateCatalogStatus() {
        var statusEl = $id("catalogSourceStatus");
        var resetBtn = $id("catalogResetBtn");
        if (!statusEl) return;

        if (!window.Catalog) {
            statusEl.innerHTML = "";
            if (resetBtn) resetBtn.style.display = "none";
            return;
        }

        var data = currentDrawData();
        var itemsCount = data.reduce(function (n, s) {
            return n + (Array.isArray(s.items) ? s.items.length : 0);
        }, 0);
        var isOverride = window.Catalog.hasOverride();

        if (isOverride) {
            var meta = window.Catalog.readMeta ? window.Catalog.readMeta() : null;
            var when = meta && meta.importedAt ? new Date(meta.importedAt).toLocaleString("zh-TW") : "";
            statusEl.innerHTML = '<span class="badge badge-override">已使用「匯入資料」</span>　目前清單：' +
                data.length + ' 間門市、' + itemsCount + ' 個項目' +
                (when ? "（匯入於 " + when + "）" : "") +
                '<div class="catalog-hint">匯入內容僅儲存在此瀏覽器（localStorage），要讓所有訪客看到請點「匯出 draws.js」後更新 GitHub 上的 data/draws.js。</div>';
        } else {
            statusEl.innerHTML = '<span class="badge badge-builtin">目前使用內建資料</span>　內建清單：' +
                data.length + ' 間門市、' + itemsCount + ' 個項目';
        }
        if (resetBtn) resetBtn.style.display = isOverride ? "" : "none";
    }

    function showCatalogMsg(html, isError) {
        var el = $id("catalogMsg");
        if (!el) return;
        el.innerHTML = html;
        el.className = isError ? "catalog-msg err" : "catalog-msg ok";
    }

    // 取得目前選取的匯入模式（replace 取代全部 / merge 合併更新）
    function getCatalogImportMode() {
        var radios = document.querySelectorAll('input[name="catalogImportMode"]');
        for (var i = 0; i < radios.length; i++) {
            if (radios[i].checked) return radios[i].value;
        }
        return "replace";
    }

    function renderImportResult(result) {
        if (!result) return;
        var html = "";
        if (result.ok) {
            html = "✅ 匯入成功：目前共 " + result.storeCount + " 間門市、" + result.itemsCount + " 個項目";
            if (result.mode === "merge") {
                if (result.added.length) html += "；新增 " + result.added.length + " 間（" + result.added.join("、") + "）";
                if (result.updated.length) html += "；更新 " + result.updated.length + " 間（" + result.updated.join("、") + "）";
            }
        } else {
            html = "❌ 匯入失敗，未變更目前資料：<br/>";
            if (result.errors && result.errors.length) {
                html += "<ul class=\"catalog-err-list\">";
                result.errors.forEach(function (err) {
                    html += "<li>" + err + "</li>";
                });
                html += "</ul>";
            }
        }
        if (result.warnings && result.warnings.length) {
            html += '<div class="catalog-warn-list">⚠️ 提醒：' + result.warnings.join("；") + "</div>";
        }
        showCatalogMsg(html, !result.ok);
    }

    // 處理使用者選擇的匯入檔案
    function handleCatalogFile(file) {
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
            var result = window.Catalog.importFromText(reader.result, getCatalogImportMode());
            renderImportResult(result);
        };
        reader.onerror = function () {
            showCatalogMsg("讀取檔案失敗，請重試", true);
        };
        reader.readAsText(file);
    }

    // 綁定資料管理工具列事件
    function bindCatalogControls() {
        if (!window.Catalog) return;
        var importBtn = $id("catalogImportBtn");
        var importFile = $id("catalogImportFile");
        var exportBtn = $id("catalogExportBtn");
        var exportJsBtn = $id("catalogExportJsBtn");
        var resetBtn = $id("catalogResetBtn");

        if (importBtn && importFile) {
            importBtn.onclick = function () { importFile.click(); };
            importFile.onchange = function () {
                if (importFile.files && importFile.files.length) {
                    handleCatalogFile(importFile.files[0]);
                }
                importFile.value = "";
            };
        }
        if (exportBtn) {
            exportBtn.onclick = function () {
                window.Catalog.download("funbox-draws-data.json", window.Catalog.exportText(), "application/json");
            };
        }
        if (exportJsBtn) {
            exportJsBtn.onclick = function () {
                window.Catalog.download("draws.js", window.Catalog.exportDrawsJsText(), "application/javascript");
            };
        }
        if (resetBtn) {
            resetBtn.onclick = function () {
                window.Catalog.clearOverride();
                showCatalogMsg("已回復為內建資料。", false);
            };
        }

        // 資料變更（匯入 / 回復）後由這裡統一刷新畫面
        window.Catalog.onChange(refreshAllViews);
        updateCatalogStatus();
    }

    /* ===== 📡 依地理位置（由近而遠）排序 ===== */

    function isGeoActive() {
        return geoEnabled && typeof geoLat === "number" && typeof geoLng === "number";
    }

    // 開啟：給定使用者座標（由瀏覽器定位取得；測試可直接呼叫 enableGeoSort）
    function enableGeoSort(lat, lng) {
        if (typeof lat !== "number" || typeof lng !== "number") return;
        geoEnabled = true;
        geoLat = lat;
        geoLng = lng;
        if (window.ContinuousDraw && window.ContinuousDraw.setGeoLocation) {
            window.ContinuousDraw.setGeoLocation(lat, lng);
        }
        updateGeoUI();
        refreshAllViews();
    }

    // 關閉：回復原本（資料檔）順序
    function disableGeoSort() {
        geoEnabled = false;
        geoLat = null;
        geoLng = null;
        if (window.ContinuousDraw && window.ContinuousDraw.setGeoLocation) {
            window.ContinuousDraw.setGeoLocation(null, null);
        }
        updateGeoUI();
        refreshAllViews();
    }

    // 更新排序按鈕與狀態列
    function updateGeoUI() {
        var btn = $id("geoSortBtn");
        var statusEl = $id("geoSortStatus");
        if (btn) {
            btn.classList.toggle("active", geoEnabled);
        }
        if (!statusEl) return;
        if (!isGeoActive()) {
            statusEl.innerHTML = "點擊後需允許瀏覽器定位，門市將依距離由近而遠排列";
            return;
        }
        var nearest = effectiveDrawData()[0];
        if (nearest && window.Geo && typeof nearest.lat === "number") {
            var km = window.Geo.distanceMeters(geoLat, geoLng, nearest.lat, nearest.lng) / 1000;
            statusEl.innerHTML = "已開啟：離你最近「" + nearest.name + "」約 " + km.toFixed(1) + " 公里（再點一次關閉）";
        } else {
            statusEl.innerHTML = "已開啟由近而遠排序（再點一次關閉）";
        }
    }

    // 按鈕點擊：開啟時要求定位；開啟中再點一次即關閉
    function askGeoPermission() {
        if (geoEnabled) {
            disableGeoSort();
            return;
        }
        if (typeof navigator === "undefined" || !navigator.geolocation) {
            var statusEl = $id("geoSortStatus");
            if (statusEl) statusEl.innerHTML = "此瀏覽器不支援定位，無法依距離排序";
            return;
        }
        var statusEl = $id("geoSortStatus");
        if (statusEl) statusEl.innerHTML = "正在取得位置…";
        navigator.geolocation.getCurrentPosition(function (position) {
            enableGeoSort(position.coords.latitude, position.coords.longitude);
        }, function () {
            geoEnabled = false;
            if (statusEl) statusEl.innerHTML = "無法取得定位（權限被拒或逾時），維持原順序";
        }, { timeout: 10000, maximumAge: 300000 });
    }

    function bindGeoControls() {
        var btn = $id("geoSortBtn");
        if (btn) btn.onclick = askGeoPermission;
        updateGeoUI();
    }

    function init() {
        renderStoreFriends();
        renderDrawList();
        restoreVisitedStates();

        if (window.Favorites) {
            window.Favorites.onChange(function () {
                applyFilters();
            });
        }

        if (window.ContinuousDraw) {
            window.ContinuousDraw.init();
        }

        bindCatalogControls();
        bindGeoControls();
        showPage("draws", document.querySelectorAll(".page-tab")[0]);
        applyFilters();
    }

    // 暴露全域 API
    window.App = {
        init: init,
        showPage: showPage,
        filterDrawRegion: filterDrawRegion,
        filterStoreRegion: filterStoreRegion,
        resetFilters: resetFilters,
        markStoreVisited: markStoreVisited,
        markDrawVisited: markDrawVisited,
        toggleFavItem: toggleFavItem,
        refreshData: refreshAllViews,
        enableGeoSort: enableGeoSort,
        disableGeoSort: disableGeoSort,
        isGeoActive: isGeoActive
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})(window);
