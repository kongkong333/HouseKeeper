# Kitchen Menu AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add kitchen management storage updates and AI menu recommendations through a Supabase Edge Function without exposing the Ark API key.

**Architecture:** Keep the existing static PWA shape. Add pure helper functions in `app-core.js`, wire the UI in `app.js`, and create `supabase/functions/recommend-menu/index.ts` as the server-side Ark proxy.

**Tech Stack:** Vanilla JavaScript PWA, Node `assert` tests, Supabase Edge Functions, Ark OpenAI-compatible chat completions endpoint.

---

### Task 1: Core Filtering And Payload

**Files:**
- Modify: `app-core.test.js`
- Modify: `app-core.js`

- [ ] Write failing tests for `getEligibleKitchenIngredients` and `buildMenuRecommendationPayload`.
- [ ] Run `node app-core.test.js` and confirm the new tests fail because the functions are not exported.
- [ ] Implement the two helpers in `app-core.js`.
- [ ] Run `node app-core.test.js` and confirm the tests pass.

### Task 2: UI Wiring

**Files:**
- Modify: `app-event-wiring.test.js`
- Modify: `app.js`
- Modify: `styles.css`

- [ ] Update the static wiring test to expect "厨房管理", "厨房", "点菜", "常温", and `functions/v1/recommend-menu`.
- [ ] Add assertions that no Ark key or `ARK_API_KEY` literal appears in browser code.
- [ ] Run `node app-event-wiring.test.js` and confirm the updated test fails.
- [ ] Update `app.js` route labels, kitchen location options, menu page renderer, click handler, and AI fetch flow.
- [ ] Add compact menu result styles in `styles.css`.
- [ ] Run `node app-event-wiring.test.js` and confirm it passes.

### Task 3: Supabase Edge Function

**Files:**
- Create: `supabase/functions/recommend-menu/index.ts`
- Modify: `README.md`

- [ ] Add an Edge Function that validates ingredients, reads `ARK_API_KEY`, calls Ark with `max_tokens: 4096`, and returns JSON or raw text.
- [ ] Document setting the Supabase secret and deploying the function.
- [ ] Run syntax checks where available.

### Task 4: Cache Bust And Verification

**Files:**
- Modify: `index.html`
- Modify: `service-worker.js`

- [ ] Bump asset query versions and cache name.
- [ ] Run `node app-core.test.js`.
- [ ] Run `node app-event-wiring.test.js`.
- [ ] Run `node app-cloud-auth.test.js`.
- [ ] Run `node --check app.js`.
- [ ] Run `node --check app-core.js`.
