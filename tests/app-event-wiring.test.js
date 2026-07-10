const assert = require("assert");
const fs = require("fs");

const source = fs.readFileSync("src/app.js", "utf8");
const styles = fs.readFileSync("src/styles.css", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const serviceWorker = fs.readFileSync("service-worker.js", "utf8");
const recommendMenuFunction = fs.readFileSync("supabase/functions/recommend-menu/index.ts", "utf8");

assert(
  source.includes('document.body.insertAdjacentHTML("beforeend", drawer(type, item));'),
  "edit drawer should be mounted outside #app"
);

assert(
  /document\.addEventListener\("submit"/.test(source),
  "forms mounted in document.body must use document-level submit delegation"
);

assert(
  /document\.addEventListener\("click"/.test(source),
  "drawer buttons mounted in document.body must use document-level click delegation"
);

assert(
  source.includes('if (event.target.classList.contains("drawer-backdrop"))'),
  "backdrop should close only when the backdrop itself is clicked"
);

assert(
  !source.includes('onclick="event.stopPropagation()"'),
  "drawer must not stop propagation because the close button uses delegated events"
);

assert(
  source.includes("待采购"),
  "supplies already in the shopping list should render as pending purchase"
);

assert(
  source.includes('select("assignee", "负责人", getAssignableUsers(state.users).map((user) => user.name)'),
  "reminder assignee select should use registered assignable users only"
);

assert(
  source.includes('input("dueAt", "提醒时间"') && source.includes('"datetime-local"') && source.includes('step=\\"any\\"'),
  "reminder form should accept minute-level values without browser step rounding errors"
);

assert(
  source.includes("本次已完成") && source.includes("下次提醒"),
  "repeating reminders should show current occurrence completion and next due time"
);

assert(
  source.includes("checkReminderNotifications") && source.includes("new Notification"),
  "responsible users should receive reminder popups while the app is open"
);

assert(
  source.includes('const repeatCycles = ["不重复", "每天", "每周", "每月"];') && !source.includes('"自定义"'),
  "automatic reminder repeat options should not include custom"
);

assert(
  source.includes('const kitchenLocations = ["冷藏", "冷冻", "常温"];') &&
    source.includes('fridge: "厨房管理"') &&
    source.includes('tab("fridge", "▤", "厨房")') &&
    source.includes('tab("menu", "☰", "点菜")'),
  "fridge inventory should be presented as kitchen management with cold, frozen, and ambient locations plus a menu tab"
);

assert(
  source.includes("AI智能菜单推荐") &&
    source.includes("functions/v1/recommend-menu") &&
    source.includes("buildMenuRecommendationPayload") &&
    source.includes("requestMenuViaDevServer") &&
    source.includes("/dev/recommend-menu") &&
    source.includes("本地开发代理") &&
    !source.includes("LOCAL_ARK_KEY") &&
    !source.includes("requestArkMenuDirectly") &&
    !source.includes("本机方舟 API Key") &&
    !source.includes("ARK_API_KEY") &&
    !source.includes("volcenginesdkarkruntime"),
  "browser code should use a local development proxy or Supabase without embedding actual Ark secrets"
);

assert(
  source.includes("menuPreferences") &&
    source.includes('data-action="menu-preference"') &&
    source.includes('data-action="menu-symptom"') &&
    source.includes("soreThroat") &&
    source.includes("cough") &&
    source.includes("fever") &&
    source.includes("otherDiscomfort") &&
    source.includes("不适症状") &&
    !source.includes("其他不适") &&
    source.includes("buildMenuRecommendationPayload(ingredients, menuPreferences)") &&
    recommendMenuFunction.includes("preferences") &&
    recommendMenuFunction.includes("soreThroat") &&
    recommendMenuFunction.includes("cough") &&
    recommendMenuFunction.includes("fever") &&
    recommendMenuFunction.includes("otherDiscomfort") &&
    recommendMenuFunction.includes("不适症状"),
  "AI menu recommendations should send taste preferences and combined symptom notes to the model"
);

assert(
  source.indexOf("<span>不适症状</span>") !== -1 &&
    source.indexOf('data-action="menu-other-discomfort"') !== -1 &&
    source.indexOf('data-symptom="soreThroat"') !== -1 &&
    source.indexOf('data-symptom="cough"') !== -1 &&
    source.indexOf('data-symptom="fever"') !== -1 &&
    source.indexOf('data-action="menu-other-discomfort"') < source.indexOf('data-symptom="soreThroat"') &&
    source.indexOf('data-symptom="soreThroat"') < source.indexOf('data-symptom="cough"') &&
    source.indexOf('data-symptom="cough"') < source.indexOf('data-symptom="fever"'),
  "AI menu discomfort text field should be labeled as symptoms and appear above symptom checkboxes"
);

assert(
  source.includes("selectedMenuIngredientNames") &&
    source.includes('data-action="toggle-menu-ingredient"') &&
    source.includes("getSelectedMenuIngredients") &&
    source.includes("ingredient-chip selected") &&
    source.includes("只依据选中食材生成菜品；取消所有选中时，会按照当前时节、口味偏好和不适症状推荐时令菜品。"),
  "AI menu ingredient chips should be selectable and only selected ingredients should be sent"
);

assert(
  styles.includes(".ingredient-chip") &&
    styles.includes("font-size: 14px;") &&
    styles.includes("min-height: 30px;") &&
    styles.includes("padding: 4px 9px;"),
  "AI menu ingredient chips should use compact text and spacing"
);

assert(
  source.indexOf("<h2>健康搭配</h2>") !== -1 &&
    source.indexOf("<h2>可做菜品</h2>") !== -1 &&
    source.indexOf("<h2>健康搭配</h2>") < source.indexOf("<h2>可做菜品</h2>"),
  "healthy combo should render above available dishes"
);

assert(
  source.includes('data-action="add-dish-shopping"') &&
    source.includes("addDishIngredientsToShoppingList") &&
    source.includes("加入采购清单") &&
    source.includes("new Set(state.shoppingList)") &&
    source.includes("没有选择食材，已按时节和备注生成推荐。"),
  "seasonal no-ingredient recommendations should let users add returned dish ingredients to the shopping list"
);

assert(
  source.includes('homeSection("需要补货"') &&
    source.includes('homeSection("快过期食材"') &&
    source.includes('homeSection("药品提醒"') &&
    source.includes('stat("采购", state.shoppingList.length)') &&
    source.includes("state.shoppingList.length") &&
    source.includes("const visibleItems = items.slice(0, maxItems);") &&
    source.includes("const hiddenCount = Math.max(0, items.length - visibleItems.length);") &&
    source.includes('data-route="${routeTarget}"') &&
    source.includes("还有 ${hiddenCount} 条，查看全部") &&
    !source.includes("scrollable-section") &&
    !styles.includes("overscroll-behavior: contain"),
  "home alert sections should render compact summaries with module links instead of internal scrolling"
);

assert(
  styles.includes("grid-template-columns: repeat(5, minmax(0, 128px));") &&
    styles.includes("justify-content: start;") &&
    styles.includes("grid-template-columns: repeat(5, minmax(0, 1fr));"),
  "home stats should keep five compact cards on one row"
);

assert(
  styles.includes(".item-card .actions {") &&
    styles.includes("flex-wrap: nowrap;") &&
    styles.includes("overflow-x: auto;") &&
    styles.includes(".item-card .actions .btn {") &&
    styles.includes("min-height: 34px;") &&
    styles.includes("padding: 7px 10px;") &&
    styles.includes("font-size: 14px;") &&
    styles.includes("white-space: nowrap;") &&
    styles.includes(".item-card .actions .btn.icon {") &&
    styles.includes("width: 34px;"),
  "card action buttons should stay compact and single-line"
);

assert(
  source.includes("todayMenu: []") &&
    source.includes("state.todayMenu = Array.isArray(state.todayMenu) ? state.todayMenu : []") &&
    source.includes('data-action="add-today-menu"') &&
    source.includes('data-action="open-today-menu"') &&
    source.includes('data-action="remove-today-menu"') &&
    source.includes("renderTodayMenuFloatingButton") &&
    source.includes("openTodayMenuDrawer"),
  "menu recommendations should let users add dishes to a synced today menu opened from a floating button"
);

assert(
  source.includes('const TODAY_MENU_FAB_POSITION_KEY = "housekeeper.todayMenuFabPosition.v1";') &&
    source.includes("loadTodayMenuFabPosition") &&
    source.includes("saveTodayMenuFabPosition") &&
    source.includes("clampTodayMenuFabPosition") &&
    source.includes("todayMenuFabDragState") &&
    source.includes('document.addEventListener("pointerdown"') &&
    source.includes('document.addEventListener("pointermove"') &&
    source.includes('document.addEventListener("pointerup"') &&
    source.includes('document.addEventListener("pointercancel"') &&
    source.includes("todayMenuFabSuppressClick") &&
    source.includes("Math.hypot") &&
    styles.includes("touch-action: none;") &&
    styles.includes('cursor: grab;') &&
    styles.includes(".today-menu-fab.dragging {"),
  "today menu floating button should be draggable without breaking tap-to-open"
);

assert(
  !source.includes("<strong>${alerts.upcomingReminders.length}</strong>"),
  "home hero should not show the unexplained large reminder count on the right"
);

assert(
  source.includes('item.status !== "used-up" && days >= 0 && days <= 5') &&
    source.includes("已过期") &&
    source.includes("过期"),
  "expired kitchen items should show expired state instead of fast-expiring state"
);

assert(
  !source.includes("<br><small>") &&
    source.includes('<div class="qty">${item.quantity}${escapeHtml(item.unit)}</div>'),
  "quantity badges should render unit and number horizontally"
);

assert(
  source.includes("drawer-backdrop center-backdrop") &&
    source.includes("today-menu-drawer"),
  "today menu drawer should use a centered backdrop instead of the bottom drawer placement"
);

assert(
  styles.includes(".today-menu-fab {") &&
    styles.includes("background: var(--amber-soft);") &&
    styles.includes("border: 1px solid rgba(184, 107, 22, 0.22);") &&
    styles.includes("color: var(--amber);"),
  "today menu floating button should use a soft orange background"
);

assert(
  source.includes("家庭共享数据") &&
    source.includes("不同成员账号会进入同一份家庭数据") &&
    !source.includes("每个账号独立保存数据"),
  "cloud login copy should explain that member accounts share one household state"
);

assert(
  source.includes('data-action="open-account-menu"') &&
    source.includes("openAccountMenuDrawer") &&
    source.includes("openAccountManagementDrawer") &&
    source.includes("loadAccounts") &&
    source.includes("deleteAccount") &&
    source.includes('data-action="delete-account"') &&
    source.includes("account-list") &&
    source.includes("账号管理") &&
    !source.includes("删除所有账号"),
  "account management should list registered accounts and delete one account at a time"
);

assert(
  /<script src="src\/app\.js\?v=\d+" defer><\/script>/.test(html),
  "index should cache-bust app.js so reminder UI updates reach existing PWA installs"
);

const appVersion = html.match(/src\/app\.js\?v=(\d+)/)?.[1];
const styleVersion = html.match(/src\/styles\.css\?v=(\d+)/)?.[1];
const cacheVersion = serviceWorker.match(/housekeeper-pwa-v(\d+)/)?.[1];
assert(
  appVersion === "32" && styleVersion === appVersion && cacheVersion === appVersion,
  "home summary release should bump app, style, and service worker cache versions together"
);

assert(
  appVersion && serviceWorker.includes(`"./src/app.js?v=${appVersion}"`),
  "service worker should precache the same versioned app.js URL used by index"
);

assert(
  serviceWorker.includes('event.request.mode === "navigate"') && serviceWorker.includes("fetch(event.request)"),
  "service worker should fetch navigations from the network first so index updates are visible"
);

console.log("app event wiring tests passed");
