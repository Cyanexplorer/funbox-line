/**
 * 我的最愛管理模組 (Favorites Manager)
 * 負責單品/門市星號收藏 (⭐) 狀態管理與 LocalStorage 存取
 */
(function (window) {
    "use strict";

    var ITEMS_KEY = "funbox_starred_items_v1";

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
            if (!urlOrId) return false;
            var items = this.getItems();
            return !!items[urlOrId];
        },
        count: function () {
            return Object.keys(this.getItems()).length;
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
        }
    };

    window.Favorites = Favorites;
})(window);
