# Kitchen Menu AI Design

## Goal

Rename fridge management to kitchen management, add room-temperature storage, and add a menu recommendation feature that uses only unexpired kitchen ingredients.

## User Experience

- The existing fridge tab becomes "厨房".
- The page title becomes "厨房管理".
- Kitchen ingredient storage locations are "冷藏", "冷冻", and "常温".
- A new bottom tab "点菜" opens a menu recommendation page.
- The menu page has one primary action: "AI智能菜单推荐".
- The menu page shows loading, success, empty inventory, and service error states.
- Users do not enter an Ark API key in the browser.

## Data Rules

- The existing `state.fridge` array remains the storage field for backward compatibility.
- Active menu ingredients are entries where `status !== "used-up"` and `expiryDate` is today or later.
- Expired and used-up ingredients are excluded before sending any data to AI.
- The request sends only ingredient fields needed for cooking: name, quantity, unit, location, expiryDate, and notes.

## AI Architecture

- The browser calls a Supabase Edge Function named `recommend-menu`.
- The Edge Function reads `ARK_API_KEY` from Supabase secrets or environment variables.
- The Ark key is never stored in `app.js`, `supabase-config.js`, localStorage, or cloud-synced app state.
- The function calls the Ark OpenAI-compatible chat completions endpoint with model `glm-5-2-260617`.
- The request does not enable thinking mode.
- `max_tokens` is `4096`.
- The prompt asks for 5-20 dishes, only using the provided ingredients, and one recommended healthy combination of 2-3 dishes with reasons.

## Error Handling

- If no eligible ingredients exist, the menu page explains that there are no unexpired kitchen ingredients.
- If Supabase or the Edge Function is unavailable, the UI shows that the AI menu service is temporarily unavailable.
- If the AI returns invalid JSON, the UI displays the raw text in a readable fallback panel.
- If JSON parses successfully, the UI renders dish cards and healthy pairing cards.

## Testing

- Pure functions cover eligible ingredient filtering and AI payload shaping.
- Static wiring tests cover the kitchen rename, the "常温" option, the menu tab, the Edge Function URL, and the absence of Ark API key literals.
- Existing app tests continue to run with `node`.
