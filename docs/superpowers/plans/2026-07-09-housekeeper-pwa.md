# HouseKeeper PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first HouseKeeper PWA with local login, inventory management, fridge management, medicine reminders, and household task reminders.

**Architecture:** Use a no-build static frontend with a focused app shell, stylesheet, JavaScript state/rendering module, manifest, and service worker. Persist data through a local storage adapter whose shape can later be replaced by remote sync.

**Tech Stack:** HTML, CSS, vanilla JavaScript, localStorage, Web App Manifest, service worker.

---

## File Structure

- Create `index.html`: mobile app shell, root mount point, install metadata links.
- Create `styles.css`: responsive mobile-first visual system and component styling.
- Create `app.js`: state model, storage adapter, render functions, forms, and module actions.
- Create `manifest.webmanifest`: PWA install metadata.
- Create `service-worker.js`: offline cache for static assets.
- Create `README.md`: local run and phone install instructions.

## Tasks

### Task 1: App Shell and PWA Metadata

**Files:**
- Create: `index.html`
- Create: `manifest.webmanifest`
- Create: `service-worker.js`

- [ ] Add semantic app shell with `#app`, viewport metadata, manifest link, theme color, and script/style references.
- [ ] Add manifest with app name, standalone display, start URL, theme colors, and generated SVG icons.
- [ ] Add service worker cache list for the static app files.
- [ ] Verify the HTML and service worker are syntactically valid.

### Task 2: Visual System

**Files:**
- Create: `styles.css`

- [ ] Define color tokens with light neutral surfaces, green/blue accents, and warm warning colors.
- [ ] Build mobile layout: login screen, dashboard, section cards, item cards, forms, bottom nav, and modal drawer.
- [ ] Add desktop constraint so the app remains phone-like on wide screens.
- [ ] Verify touch targets are large enough and text wraps cleanly.

### Task 3: State, Storage, and Rendering

**Files:**
- Create: `app.js`

- [ ] Define default household data with users, supplies, fridge items, medicines, reminders, and shopping list.
- [ ] Implement `loadState`, `saveState`, `uid`, date helpers, low-stock helpers, expiry helpers, and route state.
- [ ] Implement local login and user switching.
- [ ] Implement dashboard rendering for replenishment, expiry, medicine, and seven-day reminders.

### Task 4: Module Workflows

**Files:**
- Modify: `app.js`
- Modify: `styles.css`

- [ ] Implement supplies list, add/edit form, delete, decrement, and add-to-shopping-list.
- [ ] Implement fridge list, add/edit form, delete, decrement, used-up state, expiry sort, and recipe suggestions.
- [ ] Implement medicine list, add/edit form, delete, decrement, low-stock and expiry alerts, with cautious copy.
- [ ] Implement reminder list, add/edit form, delete, complete action, assignee, and repeat-cycle display.

### Task 5: Documentation and Verification

**Files:**
- Create: `README.md`

- [ ] Document how to run locally and add to phone home screen.
- [ ] Run JavaScript syntax checks.
- [ ] Serve locally and verify the homepage loads.
- [ ] Inspect git diff for accidental unrelated changes.
