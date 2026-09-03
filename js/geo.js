/**
 * 地理距離工具 (Geo)
 *
 * 提供 Haversine 距離計算與「依目前位置由近而遠」的排序比較器，
 * 供 App（抽獎清單渲染）與 ContinuousDraw（連續抽選）共用。
 * 門市座標（lat/lng）存在 data/draws.js 每個 store 物件上。
 */
(function (window) {
    "use strict";

    function toRad(deg) {
        return deg * Math.PI / 180;
    }

    /** 兩點經緯度距離（公尺），使用 Haversine 公式 */
    function distanceMeters(lat1, lng1, lat2, lng2) {
        var R = 6371000; // 地球半徑（公尺）
        var dLat = toRad(lat2 - lat1);
        var dLng = toRad(lng2 - lng1);
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    /**
     * 產生「依離 (lat, lng) 由近而遠」的穩定排序比較器。
     * 比較對象需有數值 lat/lng；缺少座標者恆排最後，彼此維持原相對順序。
     */
    function nearestCompare(lat, lng) {
        return function (a, b) {
            var da = (typeof a.lat === "number" && typeof a.lng === "number")
                ? distanceMeters(lat, lng, a.lat, a.lng) : Infinity;
            var db = (typeof b.lat === "number" && typeof b.lng === "number")
                ? distanceMeters(lat, lng, b.lat, b.lng) : Infinity;
            return da - db;
        };
    }

    window.Geo = {
        distanceMeters: distanceMeters,
        nearestCompare: nearestCompare
    };
})(window);
