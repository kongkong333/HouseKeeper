const assert = require("assert");
const fs = require("fs");

const schema = fs.readFileSync("supabase-schema.sql", "utf8");

assert(
  schema.includes("household_id text") &&
    schema.includes("'default-home'") &&
    schema.includes("primary key (household_id)"),
  "cloud state should be keyed by a single shared household id"
);

assert(
  /perform\s+public\.hk_session_user_id\(p_token\);/i.test(schema) &&
    !/where\s+user_id\s*=\s*v_user_id/i.test(schema),
  "state RPCs should validate the logged-in user but read/write the shared household state"
);

assert(
  schema.includes("drop constraint if exists housekeeper_states_pkey") &&
    schema.includes("alter column user_id drop not null"),
  "schema should migrate existing per-user state rows to the shared household state shape"
);

assert(
  schema.includes("create or replace function public.hk_list_accounts(p_token text)") &&
    schema.includes("jsonb_agg") &&
    schema.includes("from public.housekeeper_users"),
  "schema should expose an authenticated RPC for listing registered member accounts"
);

assert(
  schema.includes("create or replace function public.hk_delete_account(p_token text, p_user_id uuid)") &&
    schema.includes("delete from public.housekeeper_users") &&
    schema.includes("where id = p_user_id") &&
    schema.includes("grant execute on function public.hk_delete_account(text, uuid)"),
  "schema should expose an authenticated RPC for deleting one member account while preserving household state"
);

console.log("supabase schema tests passed");
