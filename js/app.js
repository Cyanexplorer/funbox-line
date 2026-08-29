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

    // 渲染「抽獎連結」清單區域
    function renderDrawList() {
        var container = $id("drawListContainer");
        var filterGroup = $id("drawFilterBtnGroup");
        if (!container || typeof DRAWS_DATA === "undefined") return;

        // 統計各縣市門市數量
        var cityStores = {};
        var totalStores = DRAWS_DATA.length;
        DRAWS_DATA.forEach(function (store) {
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
                    listHtml += '<button class="star-btn' + starClass + '" title="點擊切換最愛收藏" onclick="App.toggleFavItem(\'' + item.link + '\', this)">★</button>';
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
            window.Favorites.toggleItem(url);
            if (starBtn) {
                var isStarred = window.Favorites.isFavItem(url);
                starBtn.classList.toggle("active", isStarred);
            }
        }
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
        toggleFavItem: toggleFavItem
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})(window);
