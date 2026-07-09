const assert = require("assert");
const fs = require("fs");

const source = fs.readFileSync("app.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const serviceWorker = fs.readFileSync("service-worker.js", "utf8");

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
    source.includes("LOCAL_ARK_KEY") &&
    source.includes("requestArkMenuDirectly") &&
    source.includes("本机方舟 API Key") &&
    !source.includes("ARK_API_KEY") &&
    !source.includes("volcenginesdkarkruntime"),
  "browser code should support Supabase menu function plus local-key fallback without embedding actual Ark secrets"
);

assert(
  source.includes('homeSection("需要补货"') &&
    source.includes('homeSection("快过期食材"') &&
    source.includes('homeSection("药品提醒"') &&
    source.includes("scrollable = false") &&
    source.includes('${scrollable ? " scrollable-section" : ""}'),
  "home alert sections should support compact internal scrolling"
);

assert(
  /<script src="app\.js\?v=\d+" defer><\/script>/.test(html),
  "index should cache-bust app.js so reminder UI updates reach existing PWA installs"
);

const appVersion = html.match(/app\.js\?v=(\d+)/)?.[1];
assert(
  appVersion && serviceWorker.includes(`"./app.js?v=${appVersion}"`),
  "service worker should precache the same versioned app.js URL used by index"
);

assert(
  serviceWorker.includes('event.request.mode === "navigate"') && serviceWorker.includes("fetch(event.request)"),
  "service worker should fetch navigations from the network first so index updates are visible"
);

console.log("app event wiring tests passed");
