const assert = require("assert");
const {
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
} = require("./app-core");

const today = new Date("2026-07-09T00:00:00");

assert.strictEqual(daysUntil("2026-07-12", today), 3);
assert.strictEqual(daysUntil("2026-07-08", today), -1);

assert.strictEqual(isLowStock({ quantity: 1, minQuantity: 2 }), true);
assert.strictEqual(isLowStock({ quantity: 3, minQuantity: 2 }), false);

assert.strictEqual(isExpiringSoon({ expiryDate: "2026-07-15" }, today, 7), true);
assert.strictEqual(isExpiringSoon({ expiryDate: "2026-07-30" }, today, 7), false);

const dashboard = getDashboardAlerts(
  {
    supplies: [{ id: "s1", name: "纸巾", quantity: 1, minQuantity: 2 }],
    fridge: [{ id: "f1", name: "鸡蛋", expiryDate: "2026-07-12", status: "active" }],
    medicines: [{ id: "m1", name: "感冒药", quantity: 1, minQuantity: 2, expiryDate: "2026-07-20" }],
    reminders: [{ id: "r1", title: "倒垃圾", date: "2026-07-10", completed: false }],
  },
  today
);

assert.deepStrictEqual(
  dashboard.lowSupplies.map((item) => item.name),
  ["纸巾"]
);
assert.deepStrictEqual(
  dashboard.expiringFridge.map((item) => item.name),
  ["鸡蛋"]
);
assert.deepStrictEqual(
  dashboard.medicineAlerts.map((item) => item.name),
  ["感冒药"]
);
assert.deepStrictEqual(
  dashboard.upcomingReminders.map((item) => item.title),
  ["倒垃圾"]
);

assert.deepStrictEqual(suggestRecipes(["鸡蛋", "番茄"]).slice(0, 1), ["番茄炒蛋"]);

assert.deepStrictEqual(
  getEligibleKitchenIngredients(
    [
      { id: "f1", name: "鸡蛋", quantity: 6, unit: "个", location: "冷藏", expiryDate: "2026-07-12", status: "active", notes: "先用" },
      { id: "f2", name: "牛排", quantity: 1, unit: "块", location: "冷冻", expiryDate: "2026-07-08", status: "active" },
      { id: "f3", name: "土豆", quantity: 3, unit: "个", location: "常温", expiryDate: "2026-07-20", status: "used-up" },
      { id: "f4", name: "番茄", quantity: 2, unit: "个", location: "常温", expiryDate: "2026-07-09", status: "active" },
    ],
    today
  ),
  [
    { name: "番茄", quantity: 2, unit: "个", location: "常温", expiryDate: "2026-07-09", notes: "" },
    { name: "鸡蛋", quantity: 6, unit: "个", location: "冷藏", expiryDate: "2026-07-12", notes: "先用" },
  ]
);

const menuPayload = buildMenuRecommendationPayload([{ name: "鸡蛋", quantity: 6, unit: "个", location: "冷藏", expiryDate: "2026-07-12", notes: "" }]);
assert.strictEqual(menuPayload.model, "glm-5-2-260617");
assert.strictEqual(menuPayload.max_tokens, 4096);
assert.strictEqual(menuPayload.temperature, 0.8);
assert.strictEqual("thinking" in menuPayload, false);
assert(menuPayload.messages[0].content.includes("5-20"));
assert(menuPayload.messages[0].content.includes("仅使用"));
assert(menuPayload.messages[0].content.includes("鸡蛋"));

assert.deepStrictEqual(
  getAssignableUsers([
    { id: "u_me", name: "我" },
    { id: "u_family", name: "家人" },
    { id: "u_liu", name: "刘轩" },
    { id: "u_wang", name: "王" },
  ]).map((user) => user.name),
  ["刘轩", "王"]
);

assert.strictEqual(getReminderDueAt({ date: "2026-07-10" }), "2026-07-10T09:00");
assert.strictEqual(getReminderDueAt({ dueAt: "2026-07-10T18:00", date: "2026-07-10" }), "2026-07-10T18:00");

const repeatView = getReminderView(
  {
    title: "倒垃圾",
    dueAt: "2026-07-09T08:00",
    repeat: "每天",
    completed: true,
    completedAt: "2026-07-09T08:10:00.000Z",
  },
  new Date("2026-07-09T12:00:00")
);
assert.strictEqual(repeatView.completionLabel, "本次已完成");
assert.strictEqual(repeatView.nextDueAt, "2026-07-10T08:00");

const overdueRepeatView = getReminderView(
  {
    title: "倒垃圾",
    dueAt: "2026-07-09T08:00",
    repeat: "每天",
    completed: true,
    completedAt: "2026-07-09T08:10:00.000Z",
  },
  new Date("2026-07-10T08:05:00")
);
assert.strictEqual(overdueRepeatView.isCompletedForCurrentOccurrence, false);
assert.strictEqual(overdueRepeatView.statusLabel, "到点");

assert.strictEqual(
  shouldNotifyReminder(
    { dueAt: "2026-07-09T08:00", repeat: "每天", assignee: "u_liu", completed: false },
    "u_liu",
    new Date("2026-07-09T08:01:00")
  ),
  true
);
assert.strictEqual(
  shouldNotifyReminder(
    { dueAt: "2026-07-09T08:00", repeat: "每天", assignee: "u_liu", completed: false },
    "u_wang",
    new Date("2026-07-09T08:01:00")
  ),
  false
);

const repeatDashboard = getDashboardAlerts(
  {
    supplies: [],
    fridge: [],
    medicines: [],
    reminders: [
      {
        id: "r2",
        title: "浇花",
        dueAt: "2026-07-09T08:00",
        repeat: "每天",
        completed: true,
        completedAt: "2026-07-09T08:10:00.000Z",
      },
    ],
  },
  new Date("2026-07-10T08:05:00")
);
assert.deepStrictEqual(
  repeatDashboard.upcomingReminders.map((item) => item.title),
  ["浇花"]
);

console.log("app-core tests passed");
