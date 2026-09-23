# HANDOFF：Funbox 自動下單系統（shop.funbox.com.tw 的 APP 兌換票券）

> **範圍**：本文件只涵蓋 **Funbox 商店（Cyberbiz）的 APP 兌換大獎票券：監看上架 → 一鍵進車 + 序號 → 結帳**。
> **與 uxux11 的 LINE 抽獎連結頁（另一個 repo／另一個專案）無關**，請勿混用。
> 現有工具在 `tools/prize-watch/`（**尚未納入版控**）；調查紀錄見 `tools/prize-watch/FINDINGS.md`。
> ⚠️ 本文件與 repo 內一律**遮蔽完整序號**，真碼只留在本機 `watch3.py` 的 MAP 或環境變數。

---

## 1. 目標與背景

- 標的站台：`https://shop.funbox.com.tw`（Cyberbiz 平台；**購物車與結帳為會員制**，需用「你本人已登入的 Chrome」）。
- 標的商品：**【APP兌換】戰鬥陀螺票券**（期間限定，時間到就下架；下架後前台 404，**且已下架品項無法加入購物車**）。
- 目標流程：開賣瞬間偵測上架 → 取得 `variant_id` → 產生帶序號的一鍵連結 → 進車 → 套用優惠序號 → 結帳。
- 目前卡點：**全站結帳功能關閉**，付款方式取不到 → 即使商品在架也無法完成下單。

## 2. 標的商品與序號對應（完整序號請見 `watch3.py` MAP／對話紀錄）

| handle | 商品名 | 2026-09-22 狀態 | 對應序號（遮蔽） | coupon_id |
|---|---|---|---|---|
| `bbpr07730` | 【APP兌換】CX-00 黃蜂要塞R7-60T 金屬塗裝：黃 | 404（已下架） | `2EQJ-****-JPW3` | 361585995 |
| `bbpr07736` | 【APP兌換】CX-00 雄鹿戰角B2-60D 金屬塗裝：橘 | 404（已下架） | `2EZJ-****-KG7D` | 360958493 |
| `bbpr07733` | （標題被 404 蓋掉，推測為藍／海怪那支） | 404（已下架） | `2EBE-****-KR8Q` | 361195965 |
| `bbpr07739` | 【APP兌換】購買票券_龍神勇氣G4-70I | 404（已下架） | （無序號，一併監看） | — |
| `bbpr08914` | 【APP兌換】交換票券_龍神勇氣G4-70I 金屬塗裝：水藍 | **200（目前唯一在架）** | — | — |

另有兩組已驗證但尚未配對到 handle 的券：`2EQN-****-WE62`（361585996，黃蜂要塞R7-60T_2439）、
`8HJE-****-T833`（361241486，海怪扭擺S3-70O_40119）。

## 3. 已知事實（2026-09-22/23 實測，三重實證）

1. **14 個歷史購物車 token 全部失效**：用已登入 Chrome 逐一開啟，全部導向 `/account/index`、購物車 0 項 → 伺服器端已無紀錄。
2. **已下架商品無法進車**：以 Wayback 取回舊款式 ID 實測 `/cart/replace?products=<舊ID>:1` → 仍 0 項；混測只有在架那項進得去。
3. **全站結帳功能關閉**：開啟 `/checkout` 顯示「網站結帳功能已關閉…請聯絡商家／管理員登入後台選擇合適方案繳費」→ **這是「無法結帳」的直接原因**，與 token／購物車無關。
4. **序號 5 組全部有效**（以真實鍵入 + `POST /carts/<token>/apply_coupon` 驗證，回傳含 `coupon_id`/`title`），但同時回「**此訂單內商品不可使用此優惠券**」→ 因為券**綁定各自商品**，必須把**對應票券**放進購物車再輸入該序號。
5. **尚未按下「立即結帳」** → 沒有任何訂單成立、**序號未被消耗**。

## 4. 現有工具（`tools/prize-watch/`，皆未納版控）

| 檔案 | 用途 |
|---|---|
| `watch_app_prize.py` | **零依賴**（Python 標準庫）監看上架：盯 handle 或 `--keyword` 掃站內搜尋；命中即抓 `variant_id`、產生 `/cart/replace?...` 一鍵連結，`--open` 可直接開瀏覽器；`--interval` 預設 30 秒；**只 GET 公開頁、不登入、不下單** |
| `watch3.py` | 盯 4 支票券（handle→序號 `MAP`，可用環境變數覆寫）；命中就組 `…?products=<vid>:1&coupon=<序號>`，寫入 `/tmp/pw/LINKS.txt` 並記 `watch3.log` |
| `cdp.js` | 透過 `127.0.0.1:9222` 操作**你已登入的 Chrome**：`eval`/`keep`/`tabs`（開頁、執行 JS、列分頁） |
| `checkout_one.js` | 單筆「票券＋序號」結帳前置：開 replace 連結 → 讀 `/cart.json` 驗證（項數=1、序號已套用、折扣、總額）→ 取 `get_payment_methods` →（`--select`）自動選物流/付款 → **`--submit` 才真的按下單（預設不按）** |
| `coupon_apply.js` / `coupon_apply2.js` / `coupon_test.js` / `coupon_final.js` / `coupon_verify_all.js` | 優惠碼流程摸索與驗證（真實鍵入 → 使用 → 確認；擷取 `apply_coupon` payload/回應）；`coupon_verify_all.js` 可一次驗多組、**不結帳故不消耗序號** |
| `probe_tokens.js` | 讀 `/tmp/pw/tokens.txt` 逐一測歷史購物車 token（唯讀） |
| `diag_checkout.js` / `diag_payment2.js` | 診斷「付款方式載入失敗／0 種付款方式」：抓 `get_payment_methods` 請求與回應、付款區塊 DOM、Console/Log |
| `shot.js` | CDP 截圖（`node shot.js <url> <out.png> [--full]`） |
| `FINDINGS.md` | 上述調查紀錄（序號已遮蔽） |

環境：macOS；需以 `--remote-debugging-port=9222` 啟動 Chrome（用你已登入的 profile）；工作檔在 `/tmp/pw/`
（`tokens.txt`、`LINK(S).txt`、`watch3.log`）。

## 5. 要監控什麼（Monitoring）

- **A. 商品上架／下架（核心觸發）**
  訊號：`/products/<handle>` 的 HTTP（200 vs 404）、`var productData = [...]` 是否可解析、
  `name`/`price`/`variant_id`、`inventory_quantity_status`（`empty`＝售完，進車可能被靜默跳過）。
  觸發：200 且可解析 → 產出一鍵連結並通知（可 `--open`）。
- **B. 結帳功能是否開通（能否下單的前提）**
  訊號：`/checkout` 文案是否仍為「網站結帳功能已關閉」；`/carts/<token>/get_payment_methods` 是否回非空。
  觸發：一恢復就立刻走一次完整下單流程（先驗證、不自動送出）。
- **C. 付款方式／物流可選性**
  訊號：付款方式清單（目前 0 種）、物流選項、`order[payment_id]`。
  工具：`diag_checkout.js`、`diag_payment2.js`。
- **D. 序號狀態與配對**
  訊號：`apply_coupon` 回應的 `coupon_id` / `title` / `msg`（「不可使用此優惠券」＝放錯商品）、
  是否已使用／失效、效期。
  **紅線：驗證可以，結帳前不要送出，避免序號被消耗。**
- **E. 購物車驗證（送出前必查）**
  訊號：`/cart.json` → `items.length == 1`、`coupon_codes` 含該序號、`coupon_amount`、`total_price`。
- **F. 登入／Session**
  訊號：被導向 `/account/index`、`cart.json` 為空 → cookie/session 失效，需人工重新登入後再跑。
- **G. 下單結果與後續**
  訊號：訂單成立頁/編號、序號是否被消耗、取貨與付款狀態；之後的兌換／出貨通知。
- **H. 排程與節流**
  建議：平時每 60 秒、開賣前後 10 分鐘加密到 15–30 秒；命中即停；避免長時間高頻（可能被打擋或違反條款）。
- **I. 輸出／告警**
  目前：`/tmp/pw/LINKS.txt`、`/tmp/pw/watch3.log`、console。
  建議：改成 `logs/prize-watch-YYYYMMDD.jsonl`（逐筆：時間、handle、狀態、variant_id、payload 摘要）＋每日彙總；告警管道待你選。
- **J. 憑證與隱私（必須遵守）**
  完整序號、cookie、購物車 token、`.env` 一律**不進版控、不貼給任何 session/雲端**；文件與程式碼只放遮蔽版。

## 6. 下一輪開賣時的流程

1. 監看命中 → 取得該票券 `variant_id`（`watch_app_prize.py` / `watch3.py`）。
2. 組一鍵連結：`https://shop.funbox.com.tw/cart/replace?products=<variant_id>:1&coupon=<你的序號>`。
3. 在**已登入的瀏覽器**開啟 → 票券進車 → 於結帳頁輸入/確認優惠碼。
4. `node tools/prize-watch/checkout_one.js --product <handle|variant_id> --code <序號> [--select]` 檢查金額與付款方式，**確認無誤後才由人按下「立即結帳」**。
5. **前提：`/checkout` 必須已重新開通**（否則第 3 步之後無法完成）。

## 7. 待確認（需向 Funbox 詢問或你決定）

1. 官網結帳功能何時恢復？（目前全站關閉，這是最大 blocker）
2. APP 兌換序號（黃×2、藍×2、橘×1）的效期、是否已使用、各自對應哪支商品？
3. 下一輪 APP 兌換票券的上架時間與商品編號（`bbpr*`）？
4. 你要的「自動化程度」：只到「一鍵進車 + 自動套序號 + 檢查」，還是要**自動按下結帳**？（目前刻意預設不按）
5. 告警管道與可接受的輪詢頻率。

## 8. 風險與紅線

- 自動化下單可能違反平台條款；`--submit` 是危險開關，**預設關閉**，且沒有自動付款。
- **序號一旦被結帳消耗就沒了**：驗證階段不要送單；測試一律用假碼（`ZZZZ-TEST-9999` 慣例）。
- Cookie/token 等同帳號權限，不要外流；文件中只保留遮蔽序號。
- 商品 404 期間**無法**用購物車或舊 token 還原，別浪費時間重試舊 token。

## 9. 快速上手指令

```bash
# 0) 以除錯埠啟動你自己的 Chrome（已登入 shop.funbox.com.tw）
open -na "Google Chrome" --args --remote-debugging-port=9222

# 1) 監看上架（已知代號）
python3 tools/prize-watch/watch_app_prize.py --watch --open bbpr07730 bbpr07733 bbpr07736 bbpr07739
#    不知道代號時用關鍵字掃
python3 tools/prize-watch/watch_app_prize.py --watch --keyword 兌換 --keyword 票券

# 2) 盯 4 支票券並產出「票券+序號」連結（寫入 /tmp/pw/LINKS.txt）
python3 tools/prize-watch/watch3.py

# 3) 單筆結帳前置檢查（不會送出）
node tools/prize-watch/checkout_one.js --product bbpr07730 --code 2EQJ-****-JPW3 --select

# 4) 診斷結帳／付款
node tools/prize-watch/diag_checkout.js
node tools/prize-watch/diag_payment2.js

# 5) 只想看某頁／截圖
node tools/prize-watch/cdp.js eval "https://shop.funbox.com.tw/cart" "location.pathname"
node tools/prize-watch/shot.js "https://shop.funbox.com.tw/cart" /tmp/cart.png
```

## 10. 檔案與後續整理建議

- 工具目前為**未納版控**的 `tools/prize-watch/`；若要交給別的 session，建議：
  把腳本搬進獨立 repo（例如 `funbox-prize-watch`），**只納入不含真序號的版本**（序號走環境變數或本機 `secrets`），
  並加上：上架監看（本文件 §5A）＋結帳開通監控（§5B）＋逐筆 JSONL 紀錄（§5I）。
- 相關檔案：`tools/prize-watch/{watch_app_prize.py,watch3.py,cdp.js,checkout_one.js,probe_tokens.js,coupon_*.js,diag_*.js,shot.js,FINDINGS.md}`
