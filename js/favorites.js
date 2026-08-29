/**
 * 我的最愛管理模組 (Favorites Manager)
 * 支援地區、商品型號、單一項目收藏與連續抽選優先度計算
 */
(function (window) {
    "use strict";

    var REGIONS_KEY = "funbox_fav_regions_v1";
    var PRODUCTS_KEY = "funbox_fav_products_v1";
    var ITEMS_KEY = "funbox_fav_items_v1";
    var DRAW_MODE_KEY = "funbox_draw_mode_v1";

    function readJson(key, defaultVal) {
        try {
            var data = localStorage.getItem(key);
            return data ? JSON.parse(data) : defaultVal;
        } catch (e) {
            return defaultVal;
        }
    }

    function writeJson(key, val) {
        try {
            localStorage.setItem(key, JSON.stringify(val));
        } catch (e) {}
    }

    var listeners = [];

    var Favorites = {
        getRegions: function () {
            return readJson(REGIONS_KEY, []);
        },
        setRegions: function (regions) {
            writeJson(REGIONS_KEY, Array.from(new Set(regions)));
            this.notify();
        },
        toggleRegion: function (region) {
            var list = this.getRegions();
            var idx = list.indexOf(region);
            if (idx > -1) {
                list.splice(idx, 1);
            } else {
                list.push(region);
            }
            this.setRegions(list);
        },
        isFavRegion: function (region) {
            return this.getRegions().indexOf(region) > -1;
        },

        getProducts: function () {
            return readJson(PRODUCTS_KEY, []);
        },
        setProducts: function (products) {
            writeJson(PRODUCTS_KEY, Array.from(new Set(products)));
            this.notify();
        },
        toggleProduct: function (productTag) {
            var list = this.getProducts();
            var idx = list.indexOf(productTag);
            if (idx > -1) {
                list.splice(idx, 1);
            } else {
                list.push(productTag);
            }
            this.setProducts(list);
        },
        isFavProduct: function (productName) {
            var favs = this.getProducts();
            if (!favs || !favs.length) return false;
            for (var i = 0; i < favs.length; i++) {
                if (productName.indexOf(favs[i]) > -1) {
                    return true;
                }
            }
            return false;
        },

        getItems: function () {
            return readJson(ITEMS_KEY, {});
        },
        toggleItem: function (urlOrId) {
            var items = this.getItems();
            if (items[urlOrId]) {
                delete items[urlOrId];
            } else {
                items[urlOrId] = true;
            }
            writeJson(ITEMS_KEY, items);
            this.notify();
        },
        isFavItem: function (urlOrId) {
            var items = this.getItems();
            return !!items[urlOrId];
        },

        getDrawMode: function () {
            return localStorage.getItem(DRAW_MODE_KEY) || "fav-first";
        },
        setDrawMode: function (mode) {
            localStorage.setItem(DRAW_MODE_KEY, mode);
            this.notify();
        },

        /**
         * 計算項目的優先度評分
         * 3 = 雙重命中 (最愛商品 + 最愛地區) 或 直接收藏星號
         * 2 = 最愛商品
         * 1 = 最愛地區
         * 0 = 一般
         */
        getPriorityScore: function (productName, city, url) {
            var isItemFav = url ? this.isFavItem(url) : false;
            var isProdFav = this.isFavProduct(productName);
            var isCityFav = this.isFavRegion(city);

            if (isItemFav) return 3;
            if (isProdFav && isCityFav) return 3;
            if (isProdFav) return 2;
            if (isCityFav) return 1;
            return 0;
        },

        onChange: function (callback) {
            if (typeof callback === "function") {
                listeners.push(callback);
            }
        },
        notify: function () {
            for (var i = 0; i < listeners.length; i++) {
                try {
                    listeners[i]();
                } catch (e) {
                    console.error("Favorites listener error:", e);
                }
            }
        },

        /**
         * 初始化設定彈窗
         */
        initModal: function () {
            var backdrop = document.getElementById("favModalBackdrop");
            var closeBtn = document.getElementById("favModalClose");
            var saveBtn = document.getElementById("favModalSave");
            var openBtn = document.getElementById("btnOpenFavSettings");

            if (!backdrop) return;

            var self = this;

            if (openBtn) {
                openBtn.onclick = function () {
                    self.openModal();
                };
            }

            if (closeBtn) {
                closeBtn.onclick = function () {
                    self.closeModal();
                };
            }

            backdrop.onclick = function (e) {
                if (e.target === backdrop) {
                    self.closeModal();
                }
            };

            if (saveBtn) {
                saveBtn.onclick = function () {
                    self.saveModalSelections();
                    self.closeModal();
                };
            }

            // 全部選取 / 清除 按鈕
            var selectAllRegions = document.getElementById("btnSelectAllRegions");
            var clearAllRegions = document.getElementById("btnClearAllRegions");
            var selectAllProducts = document.getElementById("btnSelectAllProducts");
            var clearAllProducts = document.getElementById("btnClearAllProducts");

            if (selectAllRegions) {
                selectAllRegions.onclick = function () {
                    document.querySelectorAll("#favRegionChips .fav-chip").forEach(function (c) {
                        c.classList.add("selected");
                    });
                };
            }
            if (clearAllRegions) {
                clearAllRegions.onclick = function () {
                    document.querySelectorAll("#favRegionChips .fav-chip").forEach(function (c) {
                        c.classList.remove("selected");
                    });
                };
            }

            if (selectAllProducts) {
                selectAllProducts.onclick = function () {
                    document.querySelectorAll("#favProductChips .fav-chip").forEach(function (c) {
                        c.classList.add("selected");
                    });
                };
            }
            if (clearAllProducts) {
                clearAllProducts.onclick = function () {
                    document.querySelectorAll("#favProductChips .fav-chip").forEach(function (c) {
                        c.classList.remove("selected");
                    });
                };
            }
        },

        openModal: function () {
            this.renderModalChips();
            var backdrop = document.getElementById("favModalBackdrop");
            if (backdrop) backdrop.classList.add("show");
        },

        closeModal: function () {
            var backdrop = document.getElementById("favModalBackdrop");
            if (backdrop) backdrop.classList.remove("show");
        },

        renderModalChips: function () {
            var regionContainer = document.getElementById("favRegionChips");
            var productContainer = document.getElementById("favProductChips");

            if (!regionContainer || !productContainer) return;

            // 1. 渲染地區 Chips
            var allRegions = [
                "台北市", "新北市", "桃園市", "新竹市", "新竹縣", "苗栗縣",
                "台中市", "彰化縣", "雲林縣", "嘉義市", "台南市", "高雄市",
                "屏東縣", "宜蘭縣", "花蓮縣", "台東縣", "澎湖縣"
            ];
            var favRegions = this.getRegions();
            regionContainer.innerHTML = "";
            allRegions.forEach(function (region) {
                var chip = document.createElement("button");
                chip.type = "button";
                chip.className = "fav-chip" + (favRegions.indexOf(region) > -1 ? " selected" : "");
                chip.setAttribute("data-region", region);
                chip.textContent = region;
                chip.onclick = function () {
                    chip.classList.toggle("selected");
                };
                regionContainer.appendChild(chip);
            });

            // 2. 渲染商品型號 Chips
            var tags = (typeof PRODUCT_MODEL_TAGS !== "undefined") ? PRODUCT_MODEL_TAGS : [
                "UX-11", "UX-20", "UX-21", "UX-01", "UX-02", "UX-03", "UX-04", "UX-15", "UX-19",
                "BX-00", "BX-10", "BX-18", "BX-20", "BX-25", "BX-26", "BX-30", "BX-32", "BX-33",
                "BX-35", "BX-37", "BX-40", "BX-45", "BX-50", "BX-51", "BX-57", "BXG-01", "BXG-04",
                "CX-00", "CX-13", "CX-18"
            ];
            var favProducts = this.getProducts();
            productContainer.innerHTML = "";
            tags.forEach(function (tag) {
                var chip = document.createElement("button");
                chip.type = "button";
                chip.className = "fav-chip" + (favProducts.indexOf(tag) > -1 ? " selected" : "");
                chip.setAttribute("data-product", tag);
                chip.textContent = tag;
                chip.onclick = function () {
                    chip.classList.toggle("selected");
                };
                productContainer.appendChild(chip);
            });
        },

        saveModalSelections: function () {
            var selectedRegions = [];
            document.querySelectorAll("#favRegionChips .fav-chip.selected").forEach(function (c) {
                selectedRegions.push(c.getAttribute("data-region"));
            });
            this.setRegions(selectedRegions);

            var selectedProducts = [];
            document.querySelectorAll("#favProductChips .fav-chip.selected").forEach(function (c) {
                selectedProducts.push(c.getAttribute("data-product"));
            });
            this.setProducts(selectedProducts);
        }
    };

    window.Favorites = Favorites;
})(window);
