(async function () {
  const STORAGE_KEY = "housekeeper.state.v1";
  const SESSION_KEY = "housekeeper.currentUser.v1";
  const CLOUD_SESSION_KEY = "housekeeper.custom.session.v1";
  const LOCAL_ARK_KEY = "housekeeper.localArkKey.v1";

  const supplyCategories = ["纸巾", "洗衣液", "洗发水", "沐浴露", "牙膏", "垃圾袋", "清洁用品", "其他"];
  const kitchenLocations = ["冷藏", "冷冻", "常温"];
  const repeatCycles = ["不重复", "每天", "每周", "每月"];

  const app = document.querySelector("#app");
  const cloudConfig = window.HOUSEKEEPER_SUPABASE || {};
  const cloudEnabled = Boolean(cloudConfig.url && cloudConfig.anonKey);
  let cloudSession = loadCloudSession();
  let state = seedState();
  let currentUserId = "";
  let route = "home";
  let search = "";
  let sortMode = "expiry";
  let authMode = "signin";
  let syncStatus = "";
  let menuStatus = "";
  let menuResult = null;
  let localArkKey = loadLocalArkKey();
  let cloudSaveTimer = 0;
  let reminderTimer = 0;
  const notifiedReminderOccurrences = new Set();

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function addDays(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function normalizeDate(date) {
    const parsed = date instanceof Date ? date : new Date(`${date}T00:00:00`);
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  function daysUntil(date, fromDate = new Date()) {
    return Math.round((normalizeDate(date).getTime() - normalizeDate(fromDate).getTime()) / 86400000);
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function formatLocalDateTime(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }

  function parseLocalDateTime(value) {
    const text = String(value || "");
    if (!text) return new Date(NaN);
    const [datePart, timePart = "09:00"] = text.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour = 9, minute = 0] = timePart.split(":").map(Number);
    return new Date(year, month - 1, day, hour, minute, 0, 0);
  }

  function getReminderDueAt(item) {
    if (item?.dueAt) return item.dueAt.slice(0, 16);
    return `${item?.date || todayISO()}T09:00`;
  }

  function isRepeatingReminder(item) {
    return item?.repeat && item.repeat !== "不重复";
  }

  function addRepeatCycle(dueDate, repeat) {
    const next = new Date(dueDate.getTime());
    if (repeat === "每周") next.setDate(next.getDate() + 7);
    else if (repeat === "每月") next.setMonth(next.getMonth() + 1);
    else next.setDate(next.getDate() + 1);
    return next;
  }

  function getReminderOccurrence(item, fromDate = new Date()) {
    const firstDue = parseLocalDateTime(getReminderDueAt(item));
    if (!isRepeatingReminder(item)) return { currentDue: firstDue, nextDue: null };
    let currentDue = firstDue;
    let nextDue = addRepeatCycle(currentDue, item.repeat);
    while (nextDue <= fromDate) {
      currentDue = nextDue;
      nextDue = addRepeatCycle(currentDue, item.repeat);
    }
    return { currentDue, nextDue };
  }

  function isReminderCompletedForCurrentOccurrence(item, fromDate = new Date()) {
    if (!isRepeatingReminder(item)) return Boolean(item?.completed);
    if (!item?.completedAt) return false;
    const completedAt = new Date(item.completedAt);
    const { currentDue, nextDue } = getReminderOccurrence(item, fromDate);
    return completedAt >= currentDue && completedAt < nextDue;
  }

  function getReminderView(item, fromDate = new Date()) {
    const { currentDue, nextDue } = getReminderOccurrence(item, fromDate);
    const isCompletedForCurrentOccurrence = isReminderCompletedForCurrentOccurrence(item, fromDate);
    const isDue = currentDue <= fromDate;
    return {
      dueAt: formatLocalDateTime(currentDue),
      nextDueAt: nextDue ? formatLocalDateTime(nextDue) : "",
      isCompletedForCurrentOccurrence,
      isDue,
      completionLabel: isRepeatingReminder(item) ? "本次已完成" : "已完成",
      statusLabel: isCompletedForCurrentOccurrence ? (isRepeatingReminder(item) ? "本次已完成" : "已完成") : isDue ? "到点" : "待提醒",
    };
  }

  function shouldNotifyReminder(item, userId, fromDate = new Date()) {
    if (!userId || item?.assignee !== userId) return false;
    const view = getReminderView(item, fromDate);
    return view.isDue && !view.isCompletedForCurrentOccurrence;
  }

  function getEligibleKitchenIngredients(items, fromDate = new Date()) {
    return (items || [])
      .filter((item) => item?.status !== "used-up")
      .filter((item) => item?.expiryDate && daysUntil(item.expiryDate, fromDate) >= 0)
      .sort((a, b) => daysUntil(a.expiryDate, fromDate) - daysUntil(b.expiryDate, fromDate))
      .map((item) => ({
        name: String(item.name || "").trim(),
        quantity: Number(item.quantity || 0),
        unit: String(item.unit || "").trim(),
        location: String(item.location || "").trim(),
        expiryDate: item.expiryDate,
        notes: String(item.notes || "").trim(),
      }))
      .filter((item) => item.name);
  }

  function buildMenuRecommendationPayload(ingredients) {
    return { ingredients };
  }

  function buildArkMenuPayload(ingredients) {
    return {
      model: "glm-5-2-260617",
      messages: [
        {
          role: "user",
          content: [
            "你是家庭厨房菜单推荐助手。",
            "请仅使用我提供的厨房材料推荐菜品，不要引入任何未列出的主料或配菜。",
            "调味品默认仅允许使用盐、糖、酱油、醋、食用油、葱姜蒜、胡椒。",
            "请尽量给出多的菜品，返回 5-20 个可以制作的菜。",
            "同时返回一组推荐的健康菜品搭配，包含 2-3 个菜，并给出健康搭配理由。",
            "请返回严格 JSON，不要使用 Markdown。",
            "JSON 结构为：{\"dishes\":[{\"name\":\"菜名\",\"ingredients\":[\"材料\"],\"notes\":\"简短做法或提示\"}],\"healthyCombo\":{\"dishes\":[\"菜名\"],\"reason\":\"理由\"}}。",
            `厨房材料：${JSON.stringify(ingredients || [])}`,
          ].join("\n"),
        },
      ],
      max_tokens: 4096,
      temperature: 0.8,
    };
  }

  function parseMenuContent(content) {
    const text = String(content || "");
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    try {
      return JSON.parse(cleaned);
    } catch (error) {
      return { rawText: cleaned || text };
    }
  }

  function isLowStock(item) {
    const min = Number(item.minQuantity || 0);
    return min > 0 && Number(item.quantity || 0) <= min;
  }

  function isExpiringSoon(item, days) {
    if (!item.expiryDate) return false;
    const left = daysUntil(item.expiryDate);
    return left >= 0 && left <= days;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadCloudSession() {
    try {
      return JSON.parse(localStorage.getItem(CLOUD_SESSION_KEY) || "null");
    } catch (error) {
      console.warn("HouseKeeper cloud session read failed", error);
      return null;
    }
  }

  function saveCloudSession(session) {
    cloudSession = session;
    if (session) {
      localStorage.setItem(CLOUD_SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(CLOUD_SESSION_KEY);
    }
  }

  function loadLocalState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && saved.version === 1) return saved;
    } catch (error) {
      console.warn("HouseKeeper storage read failed", error);
    }
    return seedState();
  }

  function loadLocalArkKey() {
    return localStorage.getItem(LOCAL_ARK_KEY) || "";
  }

  function saveLocalArkKey(value) {
    localArkKey = String(value || "").trim();
    if (localArkKey) {
      localStorage.setItem(LOCAL_ARK_KEY, localArkKey);
    } else {
      localStorage.removeItem(LOCAL_ARK_KEY);
    }
  }

  function saveState() {
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    queueCloudSave();
  }

  function supabaseHeaders(useSession = true) {
    const headers = {
      apikey: cloudConfig.anonKey,
      Authorization: `Bearer ${useSession && cloudSession?.access_token ? cloudSession.access_token : cloudConfig.anonKey}`,
      "Content-Type": "application/json",
    };
    return headers;
  }

  async function supabaseRequest(path, options = {}) {
    const response = await fetch(`${cloudConfig.url}${path}`, {
      ...options,
      headers: {
        ...supabaseHeaders(options.useSession !== false),
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(data?.msg || data?.message || data?.error_description || response.statusText);
    }
    return data;
  }

  async function rpc(functionName, payload) {
    return supabaseRequest(`/rest/v1/rpc/${functionName}`, {
      method: "POST",
      useSession: false,
      body: JSON.stringify(payload),
    });
  }

  async function signIn(username, password) {
    return rpc("hk_login", {
      p_username: username,
      p_password: password,
    });
  }

  async function signUp(username, password, displayName) {
    return rpc("hk_register", {
      p_username: username,
      p_password: password,
      p_display_name: displayName || username,
    });
  }

  async function loadCloudState() {
    if (!cloudSession?.token) return null;
    return rpc("hk_get_state", {
      p_token: cloudSession.token,
    });
  }

  async function saveCloudStateNow() {
    if (!cloudEnabled || !cloudSession?.token) return;
    try {
      syncStatus = "同步中";
      await rpc("hk_save_state", {
        p_token: cloudSession.token,
        p_data: state,
      });
      syncStatus = "已同步";
    } catch (error) {
      syncStatus = `云同步失败：${error.message || "已保存在本机"}`;
      console.warn("HouseKeeper cloud save failed", error);
    }
    renderSyncStatus();
  }

  function queueCloudSave() {
    if (!cloudEnabled || !cloudSession?.token) return;
    window.clearTimeout(cloudSaveTimer);
    cloudSaveTimer = window.setTimeout(saveCloudStateNow, 450);
  }

  function ensureCurrentUserRecord() {
    if (!cloudSession?.user?.id) return;
    const name = cloudSession.user.display_name || cloudSession.user.username || "云端用户";
    const existing = state.users.find((user) => user.id === cloudSession.user.id);
    if (existing) {
      existing.name = name;
    } else {
      state.users.unshift({ id: cloudSession.user.id, name });
    }
    currentUserId = cloudSession.user.id;
    localStorage.setItem(SESSION_KEY, currentUserId);
  }

  async function initializeApp() {
    renderLoading("正在启动 HouseKeeper...");
    state = loadLocalState();
    if (!cloudEnabled) {
      currentUserId = localStorage.getItem(SESSION_KEY) || "";
      renderApp();
      return;
    }
    if (!cloudSession?.token) {
      renderLogin();
      return;
    }
    try {
      renderLoading("正在从云端读取数据...");
      const cloudState = await loadCloudState();
      state = cloudState || state;
      ensureCurrentUserRecord();
      saveState();
      if (!cloudState) await saveCloudStateNow();
      syncStatus = cloudState ? "已同步" : "已创建云端数据";
      renderApp();
    } catch (error) {
      console.warn("HouseKeeper cloud load failed", error);
      saveCloudSession(null);
      syncStatus = "请重新登录云端";
      renderLogin(error.message);
    }
  }

  function seedState() {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      users: [
        { id: "u_me", name: "我" },
        { id: "u_family", name: "家人" },
      ],
      supplies: [
        { id: "s_tissue", name: "抽纸", category: "纸巾", quantity: 1, unit: "提", location: "客厅柜", minQuantity: 2, notes: "常用规格", owner: "u_me" },
        { id: "s_bag", name: "垃圾袋", category: "垃圾袋", quantity: 3, unit: "卷", location: "厨房", minQuantity: 2, notes: "", owner: "u_family" },
      ],
      fridge: [
        { id: "f_egg", name: "鸡蛋", quantity: 6, unit: "个", location: "冷藏", expiryDate: addDays(4), purchaseDate: addDays(-3), notes: "", status: "active", owner: "u_me" },
        { id: "f_tomato", name: "番茄", quantity: 3, unit: "个", location: "冷藏", expiryDate: addDays(3), purchaseDate: addDays(-1), notes: "先吃软的", status: "active", owner: "u_me" },
      ],
      medicines: [
        { id: "m_cold", name: "感冒药", quantity: 1, unit: "盒", expiryDate: addDays(26), symptoms: "普通感冒相关不适", location: "药箱", minQuantity: 1, notes: "按说明书保存", owner: "u_me" },
      ],
      reminders: [
        { id: "r_trash", title: "倒垃圾", date: todayISO(), dueAt: `${todayISO()}T20:00`, repeat: "每天", assignee: "u_me", notes: "晚上出门时带走", completed: false, completedBy: "", completedAt: "" },
        { id: "r_filter", title: "换净水器滤芯", date: addDays(6), dueAt: `${addDays(6)}T09:00`, repeat: "每月", assignee: "u_family", notes: "", completed: false, completedBy: "", completedAt: "" },
      ],
      shoppingList: [],
    };
  }

  function currentUser() {
    return state.users.find((user) => user.id === currentUserId);
  }

  function userName(id) {
    return state.users.find((user) => user.id === id)?.name || "未指定";
  }

  function getAssignableUsers(users) {
    return (users || []).filter((user) => !["我", "家人"].includes(user.name));
  }

  function ensureLogin() {
    if (cloudEnabled && !cloudSession?.token) {
      renderLogin();
      return false;
    }
    if (!currentUserId || !currentUser()) {
      renderLogin();
      return false;
    }
    return true;
  }

  function renderLoading(message) {
    app.innerHTML = `
      <main class="login-shell">
        <section class="login-card">
          <div class="brand-mark">HK</div>
          <p class="eyebrow">HouseKeeper</p>
          <h1>${escapeHtml(message)}</h1>
          <p class="muted">正在准备家庭数据。</p>
        </section>
      </main>
    `;
  }

  function renderLogin(errorMessage = "") {
    if (cloudEnabled) {
      app.innerHTML = `
        <main class="login-shell">
          <section class="login-card">
            <div class="brand-mark">HK</div>
            <p class="eyebrow">HouseKeeper 云同步</p>
            <h1>${authMode === "signup" ? "注册家庭账号" : "账号密码登录"}</h1>
            <p class="muted">不用邮箱验证。每个账号独立保存数据，同一个账号可在多台设备同步。</p>
            ${errorMessage ? `<p class="note" style="color:var(--red)">${escapeHtml(errorMessage)}</p>` : ""}
            <form class="form-grid" data-auth="${authMode}">
              <label>账号<input name="username" type="text" autocomplete="username" minlength="3" required placeholder="例如 liu-home"></label>
              ${authMode === "signup" ? `<label>显示名称<input name="displayName" type="text" placeholder="例如 我"></label>` : ""}
              <label>密码<input name="password" type="password" autocomplete="${authMode === "signup" ? "new-password" : "current-password"}" minlength="6" required></label>
              <button class="btn" type="submit">${authMode === "signup" ? "注册并进入" : "登录并同步"}</button>
              <button class="btn ghost" type="button" data-action="toggle-auth">${authMode === "signup" ? "已有账号，去登录" : "没有账号，先注册"}</button>
            </form>
          </section>
        </main>
      `;
      return;
    }
    app.innerHTML = `
      <main class="login-shell">
        <section class="login-card">
          <div class="brand-mark">HK</div>
          <p class="eyebrow">HouseKeeper</p>
          <h1>把家里的小事收在一个地方</h1>
          <p class="muted">本地登录，直接管理日用品、厨房、药品和日常提醒。数据保存在当前浏览器。</p>
          <div class="login-actions">
            ${state.users.map((user) => `<button class="btn" data-login="${user.id}">以 ${escapeHtml(user.name)} 登录</button>`).join("")}
            <button class="btn ghost" data-action="add-user">添加家庭成员</button>
          </div>
        </section>
      </main>
    `;
  }

  function renderApp() {
    if (!ensureLogin()) return;
    startReminderWatcher();
    app.innerHTML = `
      <main class="app-frame">
        <header class="topbar">
          <div>
            <p class="eyebrow">HouseKeeper</p>
            <h1>${pageTitle()}</h1>
            <p class="sync-line" data-sync-status>${escapeHtml(syncStatus || (cloudEnabled ? "云同步已启用" : "本机模式"))}</p>
          </div>
          <button class="user-pill" data-action="${cloudEnabled ? "logout" : "switch-user"}">${escapeHtml(currentUser().name)}</button>
        </header>
        ${renderRoute()}
      </main>
      <nav class="tabbar" aria-label="主导航">
        <div class="tabbar-inner">
          ${tab("home", "⌂", "首页")}
          ${tab("supplies", "□", "家居")}
          ${tab("fridge", "▤", "厨房")}
          ${tab("menu", "☰", "点菜")}
          ${tab("medicine", "+", "药品")}
          ${tab("reminders", "○", "提醒")}
        </div>
      </nav>
    `;
  }

  function renderAppPreservingSearch(selectionStart) {
    renderApp();
    const field = document.querySelector('[data-action="search"]');
    if (field) {
      field.focus();
      const cursor = typeof selectionStart === "number" ? selectionStart : field.value.length;
      field.setSelectionRange(cursor, cursor);
    }
  }

  function renderSyncStatus() {
    const target = document.querySelector("[data-sync-status]");
    if (target) target.textContent = syncStatus || "";
  }

  function tab(id, icon, label) {
    return `<button class="tab ${route === id ? "active" : ""}" data-route="${id}"><span>${icon}</span>${label}</button>`;
  }

  function pageTitle() {
    return { home: "今日总览", supplies: "家居用品", fridge: "厨房管理", menu: "点菜", medicine: "药品管理", reminders: "日常提醒" }[route];
  }

  function renderRoute() {
    if (route === "supplies") return renderSupplies();
    if (route === "fridge") return renderFridge();
    if (route === "menu") return renderMenu();
    if (route === "medicine") return renderMedicines();
    if (route === "reminders") return renderReminders();
    return renderHome();
  }

  function getAlerts() {
    return {
      lowSupplies: state.supplies.filter(isLowStock),
      expiringFridge: state.fridge
        .filter((item) => item.status !== "used-up" && isExpiringSoon(item, 5))
        .sort((a, b) => daysUntil(a.expiryDate) - daysUntil(b.expiryDate)),
      medicineAlerts: state.medicines.filter((item) => isLowStock(item) || isExpiringSoon(item, 30)),
      upcomingReminders: state.reminders
        .filter((item) => !getReminderView(item).isCompletedForCurrentOccurrence)
        .filter((item) => {
          const days = daysUntil(getReminderView(item).dueAt.slice(0, 10));
          return days >= 0 && days <= 7;
        })
        .sort((a, b) => parseLocalDateTime(getReminderView(a).dueAt) - parseLocalDateTime(getReminderView(b).dueAt)),
    };
  }

  function renderHome() {
    const alerts = getAlerts();
    return `
      <section class="hero">
        <div class="hero-row">
          <div>
            <p class="eyebrow">今天 ${todayISO()}</p>
            <h2>家里有 ${alerts.lowSupplies.length + alerts.expiringFridge.length + alerts.medicineAlerts.length + alerts.upcomingReminders.length} 件事需要看一眼</h2>
          </div>
          <strong>${alerts.upcomingReminders.length}</strong>
        </div>
        <div class="stats-grid">
          ${stat("补货", alerts.lowSupplies.length)}
          ${stat("食材", alerts.expiringFridge.length)}
          ${stat("药品", alerts.medicineAlerts.length)}
          ${stat("提醒", alerts.upcomingReminders.length)}
        </div>
      </section>
      ${homeSection("需要补货", alerts.lowSupplies, (item) => supplyCard(item, true), "库存都还稳。", true)}
      ${homeSection("快过期食材", alerts.expiringFridge, fridgeCard, "未来 5 天暂无快过期食材。", true)}
      ${homeSection("药品提醒", alerts.medicineAlerts, medicineCard, "药品库存和有效期暂时正常。", true)}
      ${homeSection("未来 7 天提醒", alerts.upcomingReminders, reminderCard, "接下来 7 天没有待办提醒。")}
      ${renderShoppingList()}
    `;
  }

  function stat(label, value) {
    return `<div class="stat"><span>${label}</span><b>${value}</b></div>`;
  }

  function homeSection(title, items, renderer, emptyText, scrollable = false) {
    return `
      <section class="section${scrollable ? " scrollable-section" : ""}">
        <div class="section-head"><h2>${title}</h2></div>
        <div class="card-list">${items.length ? items.map(renderer).join("") : `<div class="empty">${emptyText}</div>`}</div>
      </section>
    `;
  }

  function renderShoppingList() {
    return `
      <section class="section">
        <div class="section-head"><h2>采购清单</h2></div>
        ${
          state.shoppingList.length
            ? `<div class="shopping-list">${state.shoppingList.map((name, index) => `<button class="chip" data-action="remove-shopping" data-index="${index}">${escapeHtml(name)} ×</button>`).join("")}</div>`
            : `<div class="empty">还没有加入采购清单的物品。</div>`
        }
      </section>
    `;
  }

  function renderSupplies() {
    const items = filterItems(state.supplies, ["name", "category", "location"]);
    return `
      ${moduleToolbar("supplies", "搜索日用品、分类或位置")}
      <div class="card-list">${items.length ? items.map(supplyCard).join("") : `<div class="empty">还没有日用品记录。</div>`}</div>
    `;
  }

  function renderFridge() {
    const items = filterItems(state.fridge, ["name", "location", "notes"]).sort((a, b) => {
      if (sortMode === "expiry") return daysUntil(a.expiryDate) - daysUntil(b.expiryDate);
      return a.name.localeCompare(b.name, "zh-CN");
    });
    return `
      ${moduleToolbar("fridge", "搜索食材或位置", true)}
      <div class="card-list">${items.length ? items.map(fridgeCard).join("") : `<div class="empty">厨房里还没有记录。</div>`}</div>
    `;
  }

  function renderMenu() {
    const ingredients = getEligibleKitchenIngredients(state.fridge);
    return `
      <section class="panel menu-panel">
        <div class="section-head">
          <div>
            <h2>AI智能菜单推荐</h2>
            <p class="note">仅使用厨房管理中未用完、未过期的食材生成菜单。</p>
          </div>
        </div>
        <div class="ingredient-strip">
          ${ingredients.length ? ingredients.map((item) => `<span class="chip">${escapeHtml(item.name)} ${escapeHtml(item.quantity)}${escapeHtml(item.unit)}</span>`).join("") : `<span class="muted">暂无可用食材</span>`}
        </div>
        <div class="form-grid local-key-box">
          <label>本机方舟 API Key<input type="password" value="${escapeHtml(localArkKey)}" placeholder="后端未部署时填写，仅保存在当前浏览器" data-local-ark-key autocomplete="off"></label>
          <div class="actions local-key-actions">
            <button class="btn secondary" type="button" data-action="save-local-ark-key">保存本机 Key</button>
            <button class="btn ghost" type="button" data-action="clear-local-ark-key">清除</button>
          </div>
          <p class="note">优先使用 Supabase 安全代理；代理不可用时，才用本机 Key 直接请求方舟。</p>
        </div>
        <button class="btn menu-action" data-action="recommend-menu" ${menuStatus === "loading" ? "disabled" : ""}>${menuStatus === "loading" ? "推荐中..." : "AI智能菜单推荐"}</button>
        ${menuStatus && menuStatus !== "loading" ? `<p class="note">${escapeHtml(menuStatus)}</p>` : ""}
      </section>
      ${renderMenuResult()}
    `;
  }

  function renderMenuResult() {
    if (!menuResult) return "";
    if (menuResult.rawText) {
      return `
        <section class="section">
          <div class="section-head"><h2>推荐结果</h2></div>
          <pre class="ai-raw">${escapeHtml(menuResult.rawText)}</pre>
        </section>
      `;
    }
    const dishes = Array.isArray(menuResult.dishes) ? menuResult.dishes : [];
    const combo = menuResult.healthyCombo || {};
    return `
      <section class="section">
        <div class="section-head"><h2>可做菜品</h2></div>
        <div class="card-list">
          ${dishes.length ? dishes.map((dish) => `
            <article class="item-card">
              <p class="item-title">${escapeHtml(dish.name)}</p>
              <p class="item-meta">${(dish.ingredients || []).map((name) => `<span>${escapeHtml(name)}</span>`).join("")}</p>
              ${dish.notes ? `<p class="note">${escapeHtml(dish.notes)}</p>` : ""}
            </article>
          `).join("") : `<div class="empty">AI 暂未返回可做菜品。</div>`}
        </div>
      </section>
      <section class="section">
        <div class="section-head"><h2>健康搭配</h2></div>
        <article class="panel">
          <p class="item-title">${(combo.dishes || []).map(escapeHtml).join(" + ") || "暂无搭配"}</p>
          <p class="note">${escapeHtml(combo.reason || "AI 暂未返回搭配理由。")}</p>
        </article>
      </section>
    `;
  }

  function renderMedicines() {
    const items = filterItems(state.medicines, ["name", "symptoms", "location"]);
    return `
      ${moduleToolbar("medicine", "搜索药品、症状或位置")}
      <section class="panel">
        <h3>谨慎提示</h3>
        <p class="note">这里仅记录家庭药品库存、数量和有效期，不提供医疗诊断或用药建议。身体不适请咨询专业医生或药师。</p>
      </section>
      <div class="card-list" style="margin-top:12px">${items.length ? items.map(medicineCard).join("") : `<div class="empty">还没有药品记录。</div>`}</div>
    `;
  }

  function renderReminders() {
    const items = filterItems(state.reminders, ["title", "notes"]).sort((a, b) => parseLocalDateTime(getReminderView(a).dueAt) - parseLocalDateTime(getReminderView(b).dueAt));
    return `
      ${moduleToolbar("reminders", "搜索提醒标题或备注")}
      <div class="card-list">${items.length ? items.map(reminderCard).join("") : `<div class="empty">还没有日常提醒。</div>`}</div>
    `;
  }

  function moduleToolbar(type, placeholder, hasSort = false) {
    return `
      <div class="toolbar">
        <input type="search" value="${escapeHtml(search)}" placeholder="${placeholder}" data-action="search">
        ${hasSort ? `<select data-action="sort"><option value="expiry" ${sortMode === "expiry" ? "selected" : ""}>按过期时间</option><option value="name" ${sortMode === "name" ? "selected" : ""}>按名称</option></select>` : ""}
        <button class="btn icon" title="新增" data-action="open-form" data-type="${type}">+</button>
      </div>
    `;
  }

  function filterItems(items, fields) {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) => fields.some((field) => String(item[field] || "").toLowerCase().includes(keyword)));
  }

  function supplyCard(item) {
    const low = isLowStock(item);
    return `
      <article class="item-card ${low ? "warning" : ""}">
        <div class="item-main">
          <div>
            <p class="item-title">${escapeHtml(item.name)}</p>
            <p class="item-meta"><span>${escapeHtml(item.category)}</span><span>${escapeHtml(item.location)}</span><span>最低 ${item.minQuantity}${escapeHtml(item.unit)}</span></p>
          </div>
          <div class="qty">${item.quantity}<br><small>${escapeHtml(item.unit)}</small></div>
        </div>
        ${item.notes ? `<p class="note">${escapeHtml(item.notes)}</p>` : ""}
        <div class="actions">
          ${low ? `<span class="badge warn">需要补货</span>` : ""}
          <button class="btn secondary" data-action="decrement" data-kind="supplies" data-id="${item.id}">减少</button>
          ${state.shoppingList.includes(item.name)
            ? `<button class="btn warn" type="button" disabled>待采购</button>`
            : `<button class="btn blue" data-action="shopping" data-id="${item.id}">加入采购</button>`}
          <button class="btn ghost" data-action="open-form" data-type="supplies" data-id="${item.id}">编辑</button>
          <button class="btn danger" data-action="delete" data-kind="supplies" data-id="${item.id}">删除</button>
        </div>
      </article>
    `;
  }

  function fridgeCard(item) {
    const days = daysUntil(item.expiryDate);
    const cls = item.status === "used-up" ? "" : days <= 1 ? "danger" : days <= 5 ? "warning" : "";
    return `
      <article class="item-card ${cls}">
        <div class="item-main">
          <div>
            <p class="item-title">${escapeHtml(item.name)}</p>
            <p class="item-meta"><span>${escapeHtml(item.location)}</span><span>购买 ${item.purchaseDate || "未填"}</span><span>保质期 ${item.expiryDate || "未填"}</span></p>
          </div>
          <div class="qty">${item.quantity}<br><small>${escapeHtml(item.unit)}</small></div>
        </div>
        <p class="note">${item.status === "used-up" ? "已用完" : days >= 0 ? `还有 ${days} 天到期` : `已过期 ${Math.abs(days)} 天`}${item.notes ? ` · ${escapeHtml(item.notes)}` : ""}</p>
        <div class="actions">
          ${item.status !== "used-up" && days <= 5 ? `<span class="badge ${days <= 1 ? "danger" : "warn"}">快过期</span>` : ""}
          <button class="btn secondary" data-action="decrement" data-kind="fridge" data-id="${item.id}">减少</button>
          <button class="btn warn" data-action="used-up" data-id="${item.id}">已用完</button>
          <button class="btn ghost" data-action="open-form" data-type="fridge" data-id="${item.id}">编辑</button>
          <button class="btn danger" data-action="delete" data-kind="fridge" data-id="${item.id}">删除</button>
        </div>
      </article>
    `;
  }

  function medicineCard(item) {
    const low = isLowStock(item);
    const expiring = isExpiringSoon(item, 30);
    return `
      <article class="item-card ${expiring ? "warning" : low ? "danger" : ""}">
        <div class="item-main">
          <div>
            <p class="item-title">${escapeHtml(item.name)}</p>
            <p class="item-meta"><span>${escapeHtml(item.location)}</span><span>有效期 ${item.expiryDate || "未填"}</span><span>最低 ${item.minQuantity}${escapeHtml(item.unit)}</span></p>
          </div>
          <div class="qty">${item.quantity}<br><small>${escapeHtml(item.unit)}</small></div>
        </div>
        <p class="note">适用记录：${escapeHtml(item.symptoms || "未填写")}。仅作家庭库存提醒，请按说明书和专业建议使用。</p>
        <div class="actions">
          ${expiring ? `<span class="badge warn">临近有效期</span>` : ""}
          ${low ? `<span class="badge danger">库存不足</span>` : ""}
          <button class="btn secondary" data-action="decrement" data-kind="medicines" data-id="${item.id}">减少</button>
          <button class="btn ghost" data-action="open-form" data-type="medicine" data-id="${item.id}">编辑</button>
          <button class="btn danger" data-action="delete" data-kind="medicines" data-id="${item.id}">删除</button>
        </div>
      </article>
    `;
  }

  function reminderCard(item) {
    const view = getReminderView(item);
    const days = daysUntil(view.dueAt.slice(0, 10));
    const displayTime = view.dueAt.replace("T", " ");
    const nextLine = view.nextDueAt ? `下次提醒：${escapeHtml(view.nextDueAt.replace("T", " "))}` : "";
    return `
      <article class="item-card ${!view.isCompletedForCurrentOccurrence && days <= 1 ? "warning" : ""}">
        <div class="item-main">
          <div>
            <p class="item-title">${escapeHtml(item.title)}</p>
            <p class="item-meta"><span>${escapeHtml(displayTime)}</span><span>${escapeHtml(item.repeat)}</span><span>负责人 ${escapeHtml(userName(item.assignee))}</span></p>
          </div>
          <div class="qty">${escapeHtml(view.statusLabel)}</div>
        </div>
        <p class="note">${view.isCompletedForCurrentOccurrence ? `${escapeHtml(userName(item.completedBy))} ${escapeHtml(view.completionLabel)}` : escapeHtml(item.notes || "无备注")}${nextLine ? ` · ${nextLine}` : ""}</p>
        <div class="actions">
          <button class="btn secondary" data-action="complete" data-id="${item.id}">完成</button>
          <button class="btn ghost" data-action="open-form" data-type="reminders" data-id="${item.id}">编辑</button>
          <button class="btn danger" data-action="delete" data-kind="reminders" data-id="${item.id}">删除</button>
        </div>
      </article>
    `;
  }

  function openForm(type, id) {
    const map = { supplies: state.supplies, fridge: state.fridge, medicine: state.medicines, reminders: state.reminders };
    const item = id ? map[type].find((entry) => entry.id === id) : null;
    document.body.insertAdjacentHTML("beforeend", drawer(type, item));
  }

  function drawer(type, item) {
    const title = `${item ? "编辑" : "新增"}${{ supplies: "家居用品", fridge: "食材", medicine: "药品", reminders: "提醒" }[type]}`;
    return `
      <div class="drawer-backdrop">
        <section class="drawer">
          <div class="section-head"><h2>${title}</h2><button class="btn icon ghost" data-action="close-drawer">×</button></div>
          <form class="form-grid" data-form="${type}" data-id="${item?.id || ""}">
            ${formFields(type, item || {})}
            <button class="btn" type="submit">保存</button>
          </form>
        </section>
      </div>
    `;
  }

  function formFields(type, item) {
    if (type === "supplies") {
      return `
        ${input("name", "名称", item.name, true)}
        ${select("category", "分类", supplyCategories, item.category)}
        <div class="two-col">${input("quantity", "数量", item.quantity || 1, true, "number")}${input("unit", "单位", item.unit || "件", true)}</div>
        ${input("location", "存放位置", item.location || "")}
        ${input("minQuantity", "最低库存提醒值", item.minQuantity || 1, true, "number")}
        ${textarea("notes", "备注", item.notes)}
      `;
    }
    if (type === "fridge") {
      return `
        ${input("name", "名称", item.name, true)}
        <div class="two-col">${input("quantity", "数量", item.quantity || 1, true, "number")}${input("unit", "单位", item.unit || "份", true)}</div>
        ${select("location", "存放位置", kitchenLocations, item.location)}
        <div class="two-col">${input("expiryDate", "保质期", item.expiryDate || addDays(7), true, "date")}${input("purchaseDate", "购买日期", item.purchaseDate || todayISO(), false, "date")}</div>
        ${textarea("notes", "备注", item.notes)}
      `;
    }
    if (type === "medicine") {
      return `
        ${input("name", "名称", item.name, true)}
        <div class="two-col">${input("quantity", "数量", item.quantity || 1, true, "number")}${input("unit", "单位", item.unit || "盒", true)}</div>
        ${input("expiryDate", "有效期", item.expiryDate || addDays(180), true, "date")}
        ${input("symptoms", "适用症状记录", item.symptoms || "")}
        ${input("location", "存放位置", item.location || "药箱")}
        ${input("minQuantity", "最低库存提醒值", item.minQuantity || 1, true, "number")}
        ${textarea("notes", "备注", item.notes)}
      `;
    }
    return `
      ${input("title", "标题", item.title, true)}
      ${input("dueAt", "提醒时间", getReminderDueAt(item || {}), true, "datetime-local", "step=\"any\"")}
      ${select("repeat", "重复周期", repeatCycles, item.repeat)}
      ${select("assignee", "负责人", getAssignableUsers(state.users).map((user) => user.name), userName(item.assignee || currentUserId), "user")}
      ${textarea("notes", "备注", item.notes)}
    `;
  }

  function input(name, label, value = "", required = false, type = "text", attributes = "") {
    return `<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(value)}" ${required ? "required" : ""} ${attributes}></label>`;
  }

  function textarea(name, label, value = "") {
    return `<label>${label}<textarea name="${name}">${escapeHtml(value)}</textarea></label>`;
  }

  function select(name, label, options, value = "", mode = "") {
    return `<label>${label}<select name="${name}" data-mode="${mode}">${options.map((option) => `<option ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>`;
  }

  function submitForm(form) {
    const type = form.dataset.form;
    const id = form.dataset.id;
    const data = Object.fromEntries(new FormData(form).entries());
    const target = { supplies: "supplies", fridge: "fridge", medicine: "medicines", reminders: "reminders" }[type];
    if (data.assignee) {
      data.assignee = getAssignableUsers(state.users).find((user) => user.name === data.assignee)?.id || currentUserId;
    }
    if (type === "reminders" && data.dueAt) {
      data.date = data.dueAt.slice(0, 10);
    }
    ["quantity", "minQuantity"].forEach((key) => {
      if (key in data) data[key] = Number(data[key] || 0);
    });
    const base = type === "reminders" ? { completed: false, completedBy: "", completedAt: "" } : {};
    if (type === "fridge") base.status = "active";
    if (id) {
      const index = state[target].findIndex((item) => item.id === id);
      state[target][index] = { ...state[target][index], ...data };
    } else {
      state[target].push({ id: uid(type[0]), owner: currentUserId, ...base, ...data });
    }
    saveState();
    closeDrawer();
    renderApp();
  }

  function decrement(kind, id) {
    const item = state[kind].find((entry) => entry.id === id);
    if (!item) return;
    item.quantity = Math.max(0, Number(item.quantity || 0) - 1);
    saveState();
    renderApp();
  }

  function removeItem(kind, id) {
    state[kind] = state[kind].filter((item) => item.id !== id);
    saveState();
    renderApp();
  }

  function closeDrawer() {
    document.querySelector(".drawer-backdrop")?.remove();
  }

  async function requestMenuViaSupabase(ingredients) {
    if (!cloudConfig.url || !cloudConfig.anonKey) {
      throw new Error("尚未配置 Supabase 菜单代理");
    }
    const response = await fetch(`${cloudConfig.url}/functions/v1/recommend-menu`, {
      method: "POST",
      headers: {
        ...supabaseHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildMenuRecommendationPayload(ingredients)),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.message || data?.error || response.statusText);
    return data?.result || data;
  }

  async function requestArkMenuDirectly(ingredients) {
    if (!localArkKey) {
      throw new Error("未填写本机方舟 API Key");
    }
    const response = await fetch("https://ark.cn-beijing.volces.com/api/v3/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${localArkKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildArkMenuPayload(ingredients)),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.message || data?.error?.message || response.statusText);
    return parseMenuContent(data?.choices?.[0]?.message?.content || "");
  }

  async function requestMenuRecommendations() {
    const ingredients = getEligibleKitchenIngredients(state.fridge);
    menuResult = null;
    if (!ingredients.length) {
      menuStatus = "厨房管理中暂无未过期食材。";
      renderApp();
      return;
    }
    menuStatus = "loading";
    renderApp();
    try {
      menuResult = await requestMenuViaSupabase(ingredients);
      menuStatus = `已通过 Supabase 安全代理，根据 ${ingredients.length} 种食材生成推荐。`;
    } catch (error) {
      try {
        menuResult = await requestArkMenuDirectly(ingredients);
        menuStatus = `Supabase 代理不可用，已使用本机 Key 根据 ${ingredients.length} 种食材生成推荐。`;
      } catch (fallbackError) {
        menuStatus = `AI菜单服务暂不可用：${fallbackError.message || error.message || "请稍后再试"}`;
        menuResult = null;
      }
    }
    renderApp();
  }

  function startReminderWatcher() {
    if (reminderTimer) return;
    reminderTimer = window.setInterval(checkReminderNotifications, 60000);
    window.setTimeout(checkReminderNotifications, 1000);
  }

  function checkReminderNotifications() {
    if (!currentUserId || !state?.reminders?.length) return;
    const now = new Date();
    state.reminders
      .filter((item) => shouldNotifyReminder(item, currentUserId, now))
      .forEach((item) => {
        const view = getReminderView(item, now);
        const key = `${item.id}:${view.dueAt}`;
        if (notifiedReminderOccurrences.has(key)) return;
        notifiedReminderOccurrences.add(key);
        showReminderPopup(item, view);
        showBrowserNotification(item, view);
      });
  }

  function showReminderPopup(item, view) {
    document.body.insertAdjacentHTML("beforeend", `
      <aside class="reminder-toast" role="alert">
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(view.dueAt.replace("T", " "))} · 负责人 ${escapeHtml(userName(item.assignee))}</p>
        </div>
        <div class="actions">
          <button class="btn secondary" data-action="complete" data-id="${item.id}">完成</button>
          <button class="btn ghost" data-action="close-reminder-toast">稍后</button>
        </div>
      </aside>
    `);
  }

  function showBrowserNotification(item, view) {
    if (!("Notification" in window)) return;
    const body = `${view.dueAt.replace("T", " ")} · ${item.notes || "日常提醒"}`;
    if (Notification.permission === "granted") {
      new Notification(item.title, { body });
      return;
    }
    if (Notification.permission === "default") {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") new Notification(item.title, { body });
      });
    }
  }

  document.addEventListener("click", (event) => {
    if (event.target.classList.contains("drawer-backdrop")) {
      closeDrawer();
      return;
    }
    const target = event.target.closest("[data-action], [data-route], [data-login]");
    if (!target) return;
    if (target.dataset.login) {
      currentUserId = target.dataset.login;
      localStorage.setItem(SESSION_KEY, currentUserId);
      renderApp();
      return;
    }
    if (target.dataset.route) {
      route = target.dataset.route;
      search = "";
      renderApp();
      return;
    }
    const action = target.dataset.action;
    if (action === "add-user") {
      const name = prompt("输入家庭成员名称");
      if (name?.trim()) {
        const user = { id: uid("u"), name: name.trim() };
        state.users.push(user);
        currentUserId = user.id;
        localStorage.setItem(SESSION_KEY, currentUserId);
        saveState();
        renderApp();
      }
    }
    if (action === "switch-user") {
      currentUserId = "";
      localStorage.removeItem(SESSION_KEY);
      renderLogin();
    }
    if (action === "logout") {
      saveCloudSession(null);
      currentUserId = "";
      localStorage.removeItem(SESSION_KEY);
      syncStatus = "";
      renderLogin();
    }
    if (action === "toggle-auth") {
      authMode = authMode === "signup" ? "signin" : "signup";
      renderLogin();
    }
    if (action === "open-form") openForm(target.dataset.type, target.dataset.id);
    if (action === "close-drawer") closeDrawer();
    if (action === "close-reminder-toast") target.closest(".reminder-toast")?.remove();
    if (action === "save-local-ark-key") {
      saveLocalArkKey(document.querySelector("[data-local-ark-key]")?.value || "");
      menuStatus = localArkKey ? "本机方舟 API Key 已保存到当前浏览器。" : "本机方舟 API Key 已清空。";
      renderApp();
    }
    if (action === "clear-local-ark-key") {
      saveLocalArkKey("");
      menuStatus = "本机方舟 API Key 已清空。";
      renderApp();
    }
    if (action === "recommend-menu") requestMenuRecommendations();
    if (action === "decrement") decrement(target.dataset.kind, target.dataset.id);
    if (action === "delete" && confirm("确认删除这条记录吗？")) removeItem(target.dataset.kind, target.dataset.id);
    if (action === "shopping") {
      const item = state.supplies.find((entry) => entry.id === target.dataset.id);
      if (item && !state.shoppingList.includes(item.name)) state.shoppingList.push(item.name);
      saveState();
      renderApp();
    }
    if (action === "remove-shopping") {
      state.shoppingList.splice(Number(target.dataset.index), 1);
      saveState();
      renderApp();
    }
    if (action === "used-up") {
      const item = state.fridge.find((entry) => entry.id === target.dataset.id);
      if (item) item.status = "used-up";
      saveState();
      renderApp();
    }
    if (action === "complete") {
      const item = state.reminders.find((entry) => entry.id === target.dataset.id);
      if (item) {
        item.completed = true;
        item.completedBy = currentUserId;
        item.completedAt = new Date().toISOString();
      }
      saveState();
      target.closest(".reminder-toast")?.remove();
      renderApp();
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.dataset.action === "search") {
      const cursor = event.target.selectionStart;
      search = event.target.value;
      renderAppPreservingSearch(cursor);
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.dataset.action === "sort") {
      sortMode = event.target.value;
      renderApp();
    }
  });

  document.addEventListener("submit", (event) => {
    event.preventDefault();
    if (event.target.dataset.auth) {
      submitAuth(event.target);
      return;
    }
    if (event.target.dataset.form) submitForm(event.target);
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js"));
  }

  async function submitAuth(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    renderLoading(authMode === "signup" ? "正在注册..." : "正在登录...");
    try {
      const session = authMode === "signup"
        ? await signUp(data.username, data.password, data.displayName)
        : await signIn(data.username, data.password);
      saveCloudSession(session);
      const cloudState = await loadCloudState();
      state = cloudState || loadLocalState();
      ensureCurrentUserRecord();
      saveState();
      if (!cloudState) await saveCloudStateNow();
      syncStatus = cloudState ? "已同步" : "已迁移本机数据到云端";
      renderApp();
    } catch (error) {
      renderLogin(error.message);
    }
  }

  initializeApp();
})();
