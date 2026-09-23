# HANDOFF：Funbox 自動下單系統（下一個 session 專用）

> 目的：把「Funbox / 來玩聚 LINE 抽獎連結」專案的現況與已知事實交接給下一個
> session，用來設計與實作 **自動下單（自動參加抽選）** 系統。
> 請先讀 `AGENTS.md`（尤其 Catalog「正確用途 / 鐵律」段落）再動工。

---

## 1. 專案現況（已完成、可直接沿用的基礎）

| 項目 | 內容 |
|---|---|
| Repo | `Cyanexplorer/funbox-line`（fork，parent = `UXUX11/funbox-line`），remote `origin` = `git@github.com:Cyanexplorer/funbox-line.git` |
| 部署分支 | **`feature/modular-favorites`**（GitHub Pages 由此分支建置，非 `main`） |
| 線上頁面 | https://cyanexplorer.github.io/funbox-line/ （push 後約 40 秒生效；驗證方式見 §7） |
| 最新 commit | `09ca468`（feat: by-distance sorting）；前序：`eb310c8` docs、`6bd29db` 9/4 場次資料、`86c4d98` links dump、`70e1d7b` 好友清單同步、`0cf5b5b` catalog import/export + tests |
| 技術限制 | 純靜態、**無建置流程**、無 package.json、ES5（`var`、IIFE 掛 `window.*`）、零依賴 |
| 模組 | `window.App`（渲染/篩選/分頁）、`window.Favorites`（⭐最愛）、`window.ContinuousDraw`（連續抽選引擎）、`window.Catalog`（清單匯入/匯出/覆蓋）、`window.Geo`（Haversine + 由近而遠） |
| 測試 | `node --test test/*.test.js`（39 cases；`test/helpers/harness.js` 用 vm + localStorage/DOM stub 載入**真實模組**）；CI：`.github/workflows/test.yml` |
| 資料檔 | `data/draws.js`（抽獎清單，頁面載入）、`data/stores.js`（加好友門市，頁面載入）、`data/line-links.js`（**不載入頁面**，僅參考備份） |

### 資料規模（現行 2026/09/04 場次）
- `DRAWS_DATA`：**45 家門市 / 327 個商品**，每店欄位 `city, name, lat, lng, startTime, items[]`。
- `items[]`：`{ id: "draw-xxxxxxxxxxxx", product, link: "https://lin.ee/XXXX" }`；`id` 與 `link` 皆唯一。
- `STORE_FRIENDS_DATA`：76 筆門市 LINE 好友連結 `https://line.me/ti/p/~@xxxx`。
- `data/line-links.js`：`friends`(76) + `draws`(327) 全 link 清單（含 city/store/product 對照），供批次取用。

---

## 2. 自動下單直接相關的機制（務必理解）

1. **下單目標 = `items[].link`（`lin.ee` 連結）**，每個商品一個連結、代表該門市該商品的 LINE 官方帳號抽選入口。
2. **狀態以 url 為 key**：⭐最愛 `funbox_starred_items_v1`、已抽 `funbox_continuous_draw_v9_drawn`（`{link: true}`）、點擊紀錄 `visited_draw_links`。
3. **順序邏輯**（下單順序可直接沿用）：
   - 資料檔順序（原始）
   - 連續抽選模式：`fav-first`（最愛優先，預設）、`fav-only`、`all`
   - 📡 **由近而遠**：`lat/lng` + `Geo.nearestCompare`（`App.enableGeoSort(lat,lng)` / `ContinuousDraw.setGeoLocation(lat,lng)`）
4. **開始時間門檻**：商品名稱含 `（8/29 11:00才開始）` 這類標註時，未到時間會被引擎排除（`hasStarted`）。目前 9/4 場次資料無此標註。
5. **資料更新流程（鐵律，勿再犯）**：頁面只渲染 `index.html` 有載入的 `data/draws.js` / `data/stores.js`。
   流程：匯入 JSON 預覽 → 「📄 匯出 draws.js」→ 覆蓋 `data/draws.js` → commit → push → **比對部署檔** → 叫人強制重新整理。
   **不要**把抓來的資料丟進 sidecar 檔就宣稱「頁面已更新」（`data/line-links.js` 就是純參考檔，訪客看不到）。

---

## 3. 要監控什麼（Monitoring 清單）

> 自動下單不是「跑一次就結束」：它依賴**外部資料變動**（新場次）、**時間**（開抽）
> 與**外部服務狀態**（LINE 連結、登入）。以下是必須監控的項目、訊號與觸發動作。
> 註：工作區目前已有一個雛型 `tools/prize-watch/`（未 commit，含 `watch_app_prize.py`、
> `watch3.py`、`checkout_one.js`、`FINDINGS.md` 等），動工前先讀該目錄並決定是否收斂進 repo。

### A. 資料來源變動（換檔 / 新場次）— 最高優先
- **對象**：上游頁面 `https://uxux11.github.io/funbox-line/`、本 repo `data/draws.js`。
- **訊號**：抽出的 link 集合雜湊、`storeCount/itemsCount`、`startTime` 字串、新增/消失的 `id`、商品名（含價格）。
- **觸發**：有 diff → 產出變更報告 → 走 §2.5 的更新流程（匯入 → 匯出 draws.js → 覆蓋 → commit/push → 驗證部署）。
- **頻率建議**：活動期間每 1 小時；非活動期每日 1 次。

### B. 開抽時間（下單觸發點）
- **訊號**：`items[].product` 內的 `（M/D HH:MM才開始）` 標註、`startTime`（`抽選時間：YYYY/MM/DD HH:MM~YYYY/MM/DD HH:MM`）。
- **觸發**：倒數到點 → 將該批商品排入下單佇列（而非整天輪詢）。
- **注意**：時間是「人工文字」，解析要容錯（`js/continuous-draw.js` 已有一組 regex 可重用）。

### C. 連結健康度（下單前必查）
- **對象**：每個 `lin.ee` link，以及好友清單的 `line.me/ti/p/~@` link。
- **訊號**：HTTP 狀態（200/3xx/404/410）、最終導向 URL、是否導到「活動已結束 / 已下架」頁、回應時間。
- **觸發**：失效 → 標記該商品為 `dead-link`，**不要重試下單**，列入報告。

### D. 下單執行結果（每筆任務）
- **每筆紀錄**：`{ id, link, store, city, product, scheduledAt, executedAt, result, attempts, durationMs, errorType, errorMessage }`
- **result 值域**：`success` / `failed` / `skipped_already_drawn` / `skipped_dead_link` / `skipped_not_started`
- **聚合指標**：成功率、剩餘待下單數、**連續失敗次數**（> 3 次 → 暫停並告警）、平均耗時。
- **冪等**：以 link 對照 `funbox_continuous_draw_v9_drawn`，避免重複下單。

### E. 帳號 / Session 狀態
- 是否仍登入 LINE、session 是否過期（被導到登入頁＝失敗，不重試直到人工重新登入）。
- 若活動有「每帳號每日次數上限 / 冷卻」，記錄並在達到上限時停止。

### F. 抽選結果 / 中獎通知
- LINE 官方帳號聊天室新訊息（中獎、領獎期限、需回填資料）。
- 觸發：到期提醒 / 待辦清單 —— 這才是最終目的，別只監控「有沒有送出」。

### G. 系統與部署健康
- 本 repo Pages：`https://cyanexplorer.github.io/funbox-line/` 的 `index.html` 與資源皆 200；**部署檔內容是否等於 repo**（§7 比對腳本）。
- CI `.github/workflows/test.yml` 是否綠燈；`node --test` 是否仍 39/39。
- 若以自動化跑頁面：收集 console error / 例外。

### H. 告警與節流
- **輸出**：`logs/auto-order-YYYYMMDD.jsonl`（逐筆）+ 每日彙總（成功/失敗/失效連結）。
- **告警管道**（請使用者選）：GitHub Issue、Email、或 LINE 官方帳號訊息。
- **節流**：每筆間隔 N 秒、每日上限、失敗指數退避；**不要高頻輪詢上游頁面**（會被打擋也可能違反條款）。

### I. 建議實作方式
- GitHub Actions `schedule:`（cron）跑 Node 腳本：檢查資料 diff → 連結健康 → 到點執行下單 → 上傳 log artifact，失敗自動開 Issue。
- 或本機 `launchd` / `cron`（若下單必須用你本人已登入的瀏覽器 session）。

---

## 4. 動工前必須先跟使用者確認（不要自行假設）

1. 「**自動下單**」的精確定義？
   - (a) 自動依序開啟／點擊每個 `lin.ee` 完成抽選？
   - (b) 需要登入 LINE 帳號或手機驗證？
   - (c) 連結內還有表單（選商品/數量/門市）需要填？
   - (d) 需要排程（例如開抽時間 11:00 自動執行）或只做單次批次？
2. **執行環境**：瀏覽器擴充 / userscript（沿用既有頁面與 localStorage）？或 Node + Playwright（headless，需處理登入 session）？或純前端頁面內新模組？
3. **合規**：自動化可能違反 LINE 官方帳號或活動條款；使用者是否接受？是否需要節流與人工確認步驟？
4. **輸出需求**：結果紀錄（JSON/CSV）、失敗重試、通知、可中斷續跑？

---

## 5. 建議實作方向（供評估，非最終決定）

- **方案 A：頁面內模組（最貼近現況）**
  新增 `js/auto-order.js`（`window.AutoOrder`），沿用 `Catalog.read()` 取清單、`Favorites` 判斷最愛、`Geo` 決定順序、`funbox_continuous_draw_v9_drawn` 跳過已抽；UI 加在「抽獎連結」頁。
  優點：零安裝、沿用既有狀態與手機使用情境。缺點：瀏覽器會阻擋自動開多個分頁／需要使用者保持登入。
- **方案 B：Node + Playwright 腳本**
  讀 `data/draws.js`（或從線上抓），依距離/最愛排序後逐一前往 `lin.ee` 並記錄結果；需處理登入/session 保存。
- **共通需求**：節流（避免高頻請求）、跳過已抽、逐筆結果紀錄、失敗重試、可中斷續跑、清楚 log。
- 若做頁面內模組：測試比照現有模式（`test/*.test.js` + harness vm），並在 `AGENTS.md` 補上該模組的用途與 API。

---

## 6. 已知風險 / 地雷

- **部署分支是 `feature/modular-favorites`**（不是 `main`）；push 錯分支＝線上不會更新。
- **不要**用 `uxux11.github.io/funbox-line`（別人的 repo）當驗收對象；我們的站是 `cyanexplorer.github.io/funbox-line`。
- `data/draws.js` 的 `lat/lng` 為**近似值**，其中 16 家待人工複查：
  嘉義三越店、台北三越南西店、遠百信義A13、南港潤泰、天母三越店、台南遠百、台中麗寶一期、
  桃園站前三越、板橋遠東、新店誠品、新竹巨城、新竹遠東、**新竹遠雄（查不到，暫用市中心）**、
  彰化員林、彰化家樂福、高雄來玩聚-新楠店。若距離會影響下單順序，先請使用者校正。
- 改動 `data/draws.js` 後務必跑 `node --test test/*.test.js`（目前 39/39 綠燈）。

---

## 7. 快速上手 / 驗證指令

```bash
# 測試
node --test test/*.test.js

# 本機開頁（localStorage 需 http(s) origin）
python3 -m http.server 8123   # 開 http://127.0.0.1:8123

# 讀取清單統計
node -e "eval(require('fs').readFileSync('data/draws.js','utf8').replace('const DRAWS_DATA','var DRAWS_DATA'));console.log(DRAWS_DATA.length,'stores',DRAWS_DATA.reduce((n,s)=>n+s.items.length,0),'items')"

# 驗證線上部署是否等於 repo（各檔案比對）
for f in index.html data/draws.js data/stores.js js/app.js js/geo.js js/catalog.js; do
  a=$(shasum "$f" | cut -d' ' -f1)
  b=$(curl -s "https://cyanexplorer.github.io/funbox-line/$f" | shasum | cut -d' ' -f1)
  [ "$a" = "$b" ] && echo "一致 $f" || echo "不同 $f"
done
```

---

## 8. 參考檔案

- `AGENTS.md` — 專案總覽、模組 API、catalog 正確用途與鐵律、測試與部署說明（**先讀這份**）
- `data/draws.js`（45 店 / 327 商品 + lat/lng）、`data/line-links.js`（全 link 備份）、`data/stores.js`（76 好友門市）
- `js/app.js`、`js/continuous-draw.js`、`js/catalog.js`、`js/geo.js`、`js/favorites.js`
- `test/*.test.js`、`test/helpers/harness.js`
- `tools/prize-watch/`（**工作區未追蹤、非 repo 歷史**）— 後續 session 建立的監控/結帳雛型：
  `watch_app_prize.py`、`watch3.py`（監控）、`cdp.js`、`probe_tokens.js`、`checkout_one.js`、
  `coupon_*.js`、`diag_*.js`、`shot.js`、`FINDINGS.md`
