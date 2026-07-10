const assert = require("assert");
const fs = require("fs");

const source = fs.readFileSync("src/app.js", "utf8");

assert(
  source.includes('rpc("hk_login"'),
  "cloud login should use custom username/password RPC"
);

assert(
  source.includes('rpc("hk_register"'),
  "cloud signup should use custom username/password RPC"
);

assert(
  source.includes('rpc("hk_get_state"'),
  "cloud sync should load state through custom RPC"
);

assert(
  source.includes('rpc("hk_save_state"'),
  "cloud sync should save state through custom RPC"
);

assert(
  !source.includes("/auth/v1/signup") && !source.includes("resendConfirmation"),
  "app should not depend on Supabase email confirmation"
);

assert(
  source.includes("云同步失败：${error.message"),
  "cloud sync failures should show the Supabase error message"
);

console.log("app cloud auth tests passed");
