function normalizeDate(date) {
  if (date instanceof Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }
  const parsed = new Date(`${date}T00:00:00`);
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function daysUntil(date, fromDate = new Date()) {
  const target = normalizeDate(date);
  const origin = normalizeDate(fromDate);
  return Math.round((target.getTime() - origin.getTime()) / 86400000);
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
  return `${item?.date || formatLocalDateTime(new Date()).slice(0, 10)}T09:00`;
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
  if (!isRepeatingReminder(item)) {
    return { currentDue: firstDue, nextDue: null };
  }

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

function isLowStock(item) {
  const min = Number(item.minQuantity || 0);
  return min > 0 && Number(item.quantity || 0) <= min;
}

function isExpiringSoon(item, fromDate = new Date(), windowDays = 7) {
  if (!item.expiryDate) return false;
  const days = daysUntil(item.expiryDate, fromDate);
  return days >= 0 && days <= windowDays;
}

function getDashboardAlerts(state, fromDate = new Date()) {
  const activeFridge = (state.fridge || []).filter((item) => item.status !== "used-up");
  const activeReminders = (state.reminders || []).filter((item) => !getReminderView(item, fromDate).isCompletedForCurrentOccurrence);

  return {
    lowSupplies: (state.supplies || []).filter(isLowStock),
    expiringFridge: activeFridge
      .filter((item) => isExpiringSoon(item, fromDate, 5))
      .sort((a, b) => daysUntil(a.expiryDate, fromDate) - daysUntil(b.expiryDate, fromDate)),
    medicineAlerts: (state.medicines || []).filter(
      (item) => isLowStock(item) || isExpiringSoon(item, fromDate, 30)
    ),
    upcomingReminders: activeReminders
      .filter((item) => {
        const days = daysUntil(getReminderView(item, fromDate).dueAt.slice(0, 10), fromDate);
        return days >= 0 && days <= 7;
      })
      .sort((a, b) => parseLocalDateTime(getReminderView(a, fromDate).dueAt) - parseLocalDateTime(getReminderView(b, fromDate).dueAt)),
  };
}

function getAssignableUsers(users) {
  return (users || []).filter((user) => !["我", "家人"].includes(user.name));
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

function suggestRecipes(ingredientNames) {
  const names = ingredientNames.join(" ");
  const suggestions = [];

  if (/鸡蛋/.test(names) && /番茄|西红柿/.test(names)) suggestions.push("番茄炒蛋");
  if (/鸡蛋/.test(names) && /青菜|菠菜|生菜/.test(names)) suggestions.push("青菜蛋花汤");
  if (/牛奶/.test(names) && /鸡蛋/.test(names)) suggestions.push("牛奶蒸蛋");
  if (/土豆/.test(names) && /胡萝卜/.test(names)) suggestions.push("土豆胡萝卜炖菜");
  if (/米饭/.test(names) && /鸡蛋/.test(names)) suggestions.push("鸡蛋炒饭");

  if (!suggestions.length && ingredientNames.length) {
    suggestions.push(`${ingredientNames.slice(0, 3).join("+")} 快手家常菜`);
  }

  return suggestions;
}

module.exports = {
  daysUntil,
  isLowStock,
  isExpiringSoon,
  getDashboardAlerts,
  getAssignableUsers,
  getReminderDueAt,
  getReminderView,
  getEligibleKitchenIngredients,
  buildMenuRecommendationPayload,
  shouldNotifyReminder,
  suggestRecipes,
};
