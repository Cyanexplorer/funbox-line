# AGENTS.md — Funbox / 來玩聚 LINE 抽選工具

Guidance for AI coding agents working in this repository. Read this before
modifying code. UI text, comments, and content are in **Traditional Chinese
(zh-TW)**; keep user-facing strings and new comments in zh-TW to match.

## Project Overview

A **zero-dependency, static front-end web page** (no framework, no build step,
no package.json) that helps fans of Taiwanese toy-store chains **Funbox /
來玩聚** run LINE official-account lottery giveaways (LINE 官方帳號一鍵抽獎).

It does two things, switched by top tabs:

1. **抽獎連結 (Draw links)** — a searchable/filterable list of giveaway items
   per store, plus a "continuous draw" panel (連續抽選模式) that walks the user
   through items in order, opens each `lin.ee` link in a new tab, and tracks
   which items were already entered (已抽).
2. **加門市好友 (Add store friends)** — cards for each LINE store account,
   grouped/filterable by region (縣市), each with a one-tap "＋ 加好友" link.

All data is **hand-curated arrays** in `data/*.js`. All persistence is
**browser `localStorage`** (no backend). Works on desktop and mobile (RWD).

## Repository Layout

```
index.html                 Single page; both views are plain divs toggled by JS.
css/style.css              One global stylesheet incl. a <600px mobile media query.
data/stores.js             const STORE_FRIENDS_DATA — 76 LINE store accounts.
data/draws.js              const DRAWS_DATA — 45 stores / 327 giveaway items (2026/09/04 campaign).
js/catalog.js              Catalog manager: import/export/override of DRAWS_DATA.
js/geo.js                  Geo helpers: Haversine distance + 由近而遠 store comparator.
js/favorites.js            Favorites (⭐ 我的最愛) module, LocalStorage-backed.
js/continuous-draw.js      Continuous-draw engine (mode/ordering/start-time logic).
js/app.js                  App manager: rendering, tabs, filtering, visited marks.
test/                      Zero-dependency `node --test` unit tests (+ helpers/harness.js).
.github/workflows/test.yml CI that runs the tests on push/PR (does not touch Pages).
AGENTS.md                  This file.
```

Script load order in `index.html` is significant: `stores.js` → `draws.js` →
`catalog.js` → `favorites.js` → `continuous-draw.js` → `app.js`. `app.js`
bootstraps the UI on `DOMContentLoaded` (or immediately if already loaded).

## Data Model

### `STORE_FRIENDS_DATA` (data/stores.js)

```js
{
  region: "台北市",           // zh-TW county/city, free text, used as filter group
  name:   "台北地下街16號",    // display name
  lineId: "@453cqkyj",       // LINE ID shown on card
  id:     "453cqkyj",        // unique; also used for visited tracking
  link:   "https://line.me/ti/p/~@453cqkyj"
}
```

### `DRAWS_DATA` (data/draws.js)

```js
{
  city:      "台北市",                     // filter group key
  name:      "Fun box忠孝SOGO",            // store display name
  lat:       25.04210,                     // approx store coords for 📡 由近而遠 sort
  lng:       121.54489,                    // may be approximate — review when editing data
  startTime: "抽選時間：2026/08/28~2026/08/29", // free-text human label only
  items: [
    {
      id:      "draw-151f927ddd6c",        // unique stable id; also the visited-track key
      product: "UX-21 惡魔冥界改造組（8/29 11:00才開始）", // name; may embed a start-time
      link:    "https://lin.ee/QsQzRTL"    // LINE giveaway URL; favorites key
    }
  ]
}
```

**Editing data**: add/remove stores under a matching `city` or introduce a new
city name — the UI auto-derives filter buttons, counts, and the continuous-draw
city list from the data, so no other file needs touching for new content. Keep
`id` values unique and URL-safe and keep `link` values unique per item (they are
used as favorite/drawn map keys). Product names may carry a scheduled start-time
annotation like `（8/29 11:00才開始）` / `（8/29 11:00開始）` / `(8/29 11:00才開始)`
— see start-time parsing below. Store objects carry `lat`/`lng` (approximate,
geocoded from the hosting mall; user-reviewed list is the `data/draws.js` header
comment + geo-sort feature) — keep them present and sane whenever a store is
added or the campaign is re-imported, or distance sorting silently degrades.

## Module Architecture

Everything is an IIFE writing to `window`, ES5 (`var`, no arrow functions), with
double quotes, 4-space indentation, semicolons, and zh-TW comments.

### `window.App` (js/app.js) — shell / rendering / filtering

- Renders both views into containers by string-concatenated HTML with inline
  `onclick` handlers that call back into `window.*` globals (do not break these
  global names when refactoring).
- `init()` is the entry point: renders, restores visited marks, wires up
  `Favorites.onChange` and `ContinuousDraw.init()`, defaults to the draws tab.
- Filter state: `currentDrawRegion` (`"all"` | `"fav"` | city name), `currentKeyword`.
- Region/keyword filtering (`applyFilters`) toggles `display` per row and then
  pushes the current region into `ContinuousDraw.setCity(region)`.
- Reads the item list through `Catalog.read()` (with a `DRAWS_DATA` fallback), so
  an imported override renders everywhere the draws list appears.
- Public API: `init, showPage, filterDrawRegion, filterStoreRegion, resetFilters,
  markStoreVisited, markDrawVisited, toggleFavItem, refreshData, enableGeoSort,
  disableGeoSort, isGeoActive`.

### `window.Favorites` (js/favorites.js) — ⭐ starred items

- Storage key `funbox_starred_items_v1` → object map of `url -> true`.
- `toggleItem(urlOrId)`, `isFavItem(urlOrId)`, `count()`, `onChange(cb)`,
  `getItems()`. Keys are normalized (trim, strip trailing `/`) before lookup,
  so both the raw and normalized key are checked everywhere.
- `notify()` fans out to listeners; `App` and `ContinuousDraw` both subscribe to
  re-render on changes.

### `window.ContinuousDraw` (js/continuous-draw.js) — 連續抽選引擎

- Storage keys: `funbox_continuous_draw_v9_drawn` (url → true, items already
  entered) and `funbox_continuous_draw_mode_v1` (draw mode, default `fav-first`).
- Draw modes (must match `data-mode` on the mode buttons in index.html):
  - `fav-first` — starred items first, then the rest, in original order (default)
  - `fav-only` — only starred items
  - `all` — plain original order
- `findNextItem()` picks the next eligible product: not in the drawn map, not in
  the in-memory `skippedUrls` set, and **already started** (start-time gate),
  across the currently filtered city list.
- Public API: `init, render, setCity, setDrawMode, getDrawMode, setGeoLocation,
  syncDrawnRows, markDrawn, unmarkDrawn, resetDrawn, refreshStores`.
- `setGeoLocation(lat, lng)` (or nulls to clear) makes candidate order
  **由近而遠** using each store's `lat/lng`; engine store objects carry lat/lng
  copied from the catalog in `loadStores()`.
- `ContinuousDraw._test` exposes read-only internals for the unit tests
  (time parsing, candidate selection, skip state, data source) — keep it in sync
  when renaming internals, and do not rely on it from page code.

### `window.Catalog` (js/catalog.js) — 抽獎清單 匯入 / 匯出 / 覆蓋

The manager behind the "🗂 資料管理：匯入 / 匯出抽獎項目清單" toolbar
(`#catalogToolbar`, wired up by `App.bindCatalogControls`).

- `read()` returns the effective item list: the `localStorage` override when one
  exists, otherwise the built-in `DRAWS_DATA`. **All list consumers must go
  through this** (App's draws renderer and the ContinuousDraw engine do).
- `importFromText(text, mode)` accepts a raw JSON array, a `{ stores: [...] }`
  wrapper, or even the raw `data/draws.js` file text. `mode` is `"replace"`
  (default) or `"merge"` (match stores by `city` + `name`; update in place,
  append new ones). Input is structurally validated first (missing
  city/name/product/link → hard errors that block the import; duplicates and
  non-http links → non-blocking warnings); items without an `id` get one.
  Success persists the override, writes `readMeta()` metadata, then `notify()`s.
- `clearOverride()` removes the override and notifies; `App` listens and
  re-renders the list, reloads the engine (`ContinuousDraw.refreshStores()`),
  and updates the source-status badge (`badge-builtin`/`badge-override`).
- `exportText()` → JSON (with header metadata); `exportDrawsJsText()` → a file
  literally containing `const DRAWS_DATA = [...]` intended to overwrite
  `data/draws.js` for a real deployment; `download(filename, text, mime)` is the
  browser-side Blob download helper (safely no-ops without `Blob`/`URL`).

**Scope caveat**: an imported override lives only in that browser's
`localStorage`. Importing never modifies the GitHub repo; to publish a catalog
for all visitors you must export `draws.js` and commit the result over
`data/draws.js` (or edit the data file directly). This matches the GitHub Pages
static-hosting model.

**正確用途（tool purpose — read before changing anything catalog-related）:**
This toolbar is a *campaign rotation / maintenance workflow*, not a one-off
gimmick. It will be reused every time a new giveaway campaign ships. The visitor
page is **only** rendered from the data files `index.html` actually loads:
`data/draws.js` and `data/stores.js`. The correct update loop is:

1. Obtain the new item list (JSON array, `{ stores: [...] }`, or `draws.js` text).
2. Use **📥 匯入 JSON** in the toolbar to preview/validate it locally (the
   override lives only in that browser's `localStorage` — never ship this as the
   update).
3. Use **📄 匯出 draws.js（提交用）** to generate the exact
   `const DRAWS_DATA = [...]` source, overwrite `data/draws.js` in the repo,
   commit, and push.
4. Wait for the GitHub Page rebuild, verify the **deployed copy equals the
   committed file** (curl the Pages URL, compare), then hard-refresh.

Hard rules learned from a real mistake (never repeat):

- A file the page does **not** load (e.g. `data/line-links.js`, any reference
  dump) is **invisible to visitors** — never report it as "the page is updated".
- "Syncing the list from another page/site" (e.g. scraping
  `uxux11.github.io/funbox-line`) means **regenerating `data/draws.js` /
  `data/stores.js` themselves** from that source and committing (see commit
  `6bd29db` for the canonical example), never dropping scraped data into a
  sidecar file.
- Always answer "did the page update?" by comparing the *deployed static files*
  against the repo files, then tell the user to hard-refresh (Pages caches
  assets).

### Start-time parsing (schedule gating)

`getProductStartTime(productText)` scans the product name for a parenthesized
scheduled time matching the regex

```
/[（(]\s*(\d{1,2})\s*\/\s*(\d{1,2})\s+([01]?\d|2[0-3]):([0-5]\d)\s*(?:才)?開始\s*[）)]/
```

e.g. `（8/29 11:00才開始）`. It builds a `Date` in the current year and, to handle
year-crossing announcements (e.g. item text dated months in the past of the
current month), bumps the year by one when the resulting time is in the past
**and** the announced month is ≥ 6 months earlier than the current month.
`hasStarted(product)` returns true when no start time is found **or** now ≥ start.
Not-yet-started items are excluded from continuous draw until they start.

### `window.Geo` (js/geo.js) & 📡 由近而遠 sorting

- `Geo.distanceMeters(lat1, lng1, lat2, lng2)` (Haversine) and
  `Geo.nearestCompare(lat, lng)` → stable comparator sorting store-like objects
  `{lat, lng}` nearest-first; objects without numeric coords sort last.
- UI: 「📡 由近而遠排序」button (`#geoSortBtn`) in the filter box. Clicking
  requests `navigator.geolocation` permission, then calls
  `App.enableGeoSort(lat, lng)` (denied/unsupported → friendly message, order
  unchanged); clicking again calls `App.disableGeoSort()`. Location is never
  persisted.
- When active, both the rendered draws list and the continuous-draw candidate
  order become distance-sorted (city headers are kept; products keep original
  order). Engine orders via `ContinuousDraw.setGeoLocation(lat, lng)` +
  `orderedStores()`; its `loadStores()` copies `lat/lng` from the catalog.

## Persistence & UI state (localStorage keys)

| Key | Format | Meaning |
|---|---|---|
| `visited_lines` | array of store `id` | "＋ 加好友" buttons clicked (greyed out) |
| `visited_draw_links` | array | draw links clicked; see note below |
| `funbox_starred_items_v1` | `{url: true}` | ⭐ favorites |
| `funbox_continuous_draw_v9_drawn` | `{url: true}` | items marked as drawn/entered |
| `funbox_continuous_draw_mode_v1` | string | `fav-first` / `fav-only` / `all` |
| `funbox_catalog_override_v1` | array of stores | imported catalog override consumed by `Catalog.read()` |
| `funbox_catalog_override_meta_v1` | object | last import metadata (time/mode/added/updated counts) |

Known inconsistency to preserve or fix deliberately: `App.markDrawVisited` writes
the **item `id`** (e.g. `draw-151f927ddd6c`) into `visited_draw_links`, while
`ContinuousDraw.unmarkDrawn` removes the item **`url`** from the same key. The
drawn map itself (`v9_drawn`) always keys by url. Don't "fix" this casually — it
interacts with the drawn-row highlight logic in `syncDrawnRows`, which toggles
`.clicked` on the row's `.draw-link` element and `.quick-drawn` on the `.draw-item`.

## Behavioral Rules (keep intact when editing)

- **Starring un-draws.** When a user stars an item that was already marked drawn,
  `App.toggleFavItem` first calls `ContinuousDraw.unmarkDrawn(url)` so the item
  becomes eligible again in the continuous draw. Drawn state is cleared together
  with the visit mark so the button color matches.
- **Reset affordance.** The panel always exposes a "🔄 重設已抽" button
  (`ContinuousDraw.resetDrawn`) which clears the drawn map and `visited_draw_links`.
- **Mode switch clears skip set.** Changing mode or city resets the in-memory
  `skippedUrls` so nothing is silently lost; skips never persist across reloads.
- **Sync with list.** The continuous-draw panel and the full list stay in sync:
  drawn rows get `.quick-drawn` styling; favorites changes re-render both the
  list filter state and the panel.
- **Empty / future states** show friendly zh-TW messages and disable the three
  action buttons (`continuousDrawOpen/Next/Skip`).

## UI Strings (zh-TW) & Key Elements

- Tabs: `抽獎連結` (default, container `#page-draws`) and `加門市好友`.
- Filter buttons: `全部 (N)`, `⭐ 我的最愛`, then one per city with counts.
- Status line `#filterStatusText` reports current region/keyword and match
  counts of stores vs items ("共符合 N 間門市、M 個項目").
- Buttons: `開啟抽選` (open current), `完成並開啟下一個` (mark drawn + open
  next), `略過此項目` (skip current), `＋ 參加抽獎`, `＋ 加好友`, `★` star.
- Search placeholder advertises examples like `龍神`, `女武神`, `台北地下街`.

## Conventions & Gotchas

- ES5 style only (the code predates modules/bundlers and has no transpile step):
  `var`, function expressions, string concatenation for HTML, no template
  literals/arrow functions added anywhere without consistent style changes.
- Inline `onclick="App.xxx(...)"` / `onclick="ContinuousDraw.xxx()"` attribute
  handlers are used in generated HTML — any rename must update both the exposed
  `window` object and the inline strings (and `index.html` where present).
- Item `id` values in data are stable identifiers (e.g. `draw-151f927ddd6c`);
  in render code, missing ids fall back to a random id. Prefer stable ids.
- Favorites lookups normalize keys (trim + strip trailing `/`) and check both
  raw and normalized forms — new code calling `isFavItem`/`toggleItem` should
  keep passing the original url and rely on the normalization.
- Chinese text contains full-width parentheses `（）` in start-time annotations;
  the regex deliberately accepts both full-width and half-width forms.
- Never assume dates in data are current; schedule gating is relative to the
  user's clock and the "year rollover" heuristic described above.

## Automated Verification (`node --test`)

Zero-dependency tests in `test/*.test.js` run with the Node built-in runner
(Node 18+; no package.json or install needed):

```
node --test test/*.test.js
```

GitHub Actions runs the same command on every push/PR
(`.github/workflows/test.yml`); the workflow never touches Pages deployment.
`test/helpers/harness.js` loads the **real browser modules** in a `vm` sandbox
with an in-memory `localStorage` and a minimal `document` stub, so the tests
exercise the actual source files. Coverage areas:

- Favorites: persistence across reload, key normalization, change events.
- Catalog: validation (blocking errors vs warnings), replace & merge imports,
  raw-`draws.js` text import, JSON/draws.js export round-trips, missing-id
  assignment, cross-reload override, `clearOverride`.
- ContinuousDraw (via the `_test` hooks): start-time regex parsing incl.
  half-width parentheses and the `才` variant, year-rollover heuristic,
  has-started gating, mode ordering (`fav-first`/`fav-only`/`all`), city
  filtering, drawn/skip/unmark/reset state transitions, future-item exclusion.
- App integration: built-in rendering, import swapping the rendered list +
  engine + override badge, reset-button restore, toolbar bindings, override
  surviving reload.

When you change logic in `js/*.js`, run the suite and extend the tests; keep the
harness stubs in sync with any DOM the page code newly touches.

## Manual Browser Check

No build, no server required for reading, but **`localStorage` requires an
http(s) origin**, so serve the folder when testing (e.g. `python3 -m http.server`
or `npx serve`) and open it in a browser; test both desktop and the mobile
viewport (<600px styles) and verify filter buttons, tab switching, star toggles,
draw marks + reset, start-time gating using an item whose annotation is in
the future/past, and the import/export toolbar (import a JSON/draws.js file,
check the override badge and reset, export JSON and draws.js). Keep localStorage
state in mind when re-testing (use the reset buttons or clear site data).

## Git Workflow

- Active branch: `feature/modular-favorites`; `origin` is the Cyanexplorer fork of
  `UXUX11/funbox-line` (`origin git@github.com:Cyanexplorer/funbox-line.git`).
  `feature/modular-favorites` has diverged from `main` and is the branch the
  fork's GitHub Page deploys from (verify with `git rev-list --left-right --count
  main...origin/feature/modular-favorites` before assuming ancestry).
- Commit messages use Conventional-Commits-style prefixes seen in history:
  `feat:`, `fix:`, `refactor:`, `style:`, `chore:`, and describe behavior in
  English while code/UI stays zh-TW. Follow the same style for new commits.
