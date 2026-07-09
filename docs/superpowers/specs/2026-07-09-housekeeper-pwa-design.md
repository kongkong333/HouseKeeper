# HouseKeeper PWA Design

## Goal

Build a lightweight mobile-first HouseKeeper website that can be added to a phone home screen and used like a small app. The first version prioritizes immediate local use, with data structures and service boundaries that can later be connected to a backend.

## Scope

The app includes:

- Local user login and household member switching.
- Home supply inventory management.
- Fridge ingredient management.
- Medicine inventory and expiry reminders.
- Daily household task reminders.
- Home dashboard for replenishment, expiry, and upcoming task alerts.
- PWA manifest and service worker for install-like use and offline loading.

The first version does not include a real remote account system, server sync, push notifications, or medical diagnosis.

## Architecture

Use a static frontend:

- `index.html` for the app shell.
- `styles.css` for mobile-first layout and visual system.
- `app.js` for state, rendering, forms, actions, and local persistence.
- `manifest.webmanifest` and `service-worker.js` for PWA behavior.

Data is stored in `localStorage` through a small storage adapter. State records include stable IDs, timestamps, owner or assignee fields, and status fields so a future backend can replace the storage adapter without rewriting UI logic.

## UX Structure

The app starts with a local login screen. After login, it opens to a dashboard with high-priority household signals:

- Items that need replenishment.
- Ingredients expiring soon.
- Medicines expiring soon or below minimum stock.
- Important reminders due today or in the next seven days.

Main navigation uses a fixed bottom tab bar:

- Home
- Supplies
- Fridge
- Medicine
- Reminders

Each module has a compact mobile list, an add/edit form, and direct actions such as decrement quantity, mark used up, complete reminder, or add to shopping list.

## Modules

### Home Supplies

Fields: name, category, quantity, unit, storage location, minimum stock threshold, notes.

Categories: tissue, laundry detergent, shampoo, body wash, toothpaste, trash bags, cleaning supplies, other.

Behavior:

- Show low-stock items on the dashboard.
- Support one-tap quantity decrease.
- Support adding an item to a shopping list.

### Fridge

Fields: name, quantity, unit, storage location, expiry date, purchase date, notes.

Storage locations: chilled, frozen, room temperature, other.

Behavior:

- Dashboard shows soon-to-expire ingredients.
- Fridge list can sort by expiry date.
- Support marking used up and decreasing quantity.
- Generate recipe suggestions from current ingredients using simple local rules.

### Medicine

Fields: name, quantity, unit, expiry date, applicable symptoms, storage location, notes, minimum stock threshold.

Behavior:

- Remind for near-expiry medicines.
- Remind for low-stock medicines.
- Use cautious copy: inventory and expiry reminders only, no diagnosis or treatment recommendations.

### Reminders

Fields: title, date, repeat cycle, assignee, notes, completed status.

Repeat options: none, daily, weekly, monthly, custom.

Examples: take out trash, pay utilities, replace filter, water plants, clean home, follow-up visit, pay property fee.

Behavior:

- Dashboard shows reminders due today and within seven days.
- A responsible user can complete a reminder.
- Other local household users can see completion status.

## Visual Direction

Design for one-handed phone use with clear hierarchy:

- Light background with warm white surfaces.
- Fresh green and calm blue accents.
- Orange/red only for warnings and urgent states.
- Compact cards with restrained shadows and 8px radius.
- Large touch targets and a fixed bottom nav.
- Avoid cluttered landing-page composition; the first screen is the usable dashboard.

## Error Handling

Forms validate required fields and numeric/date values before saving. Empty dashboard sections show calm empty states. Local storage read errors fall back to seed demo data with a visible warning.

## Verification

Manual verification should cover:

- Login and user switching.
- Add/edit/delete for all modules.
- Low-stock and expiry alerts on the dashboard.
- Reminder completion visibility.
- PWA files load without syntax errors.
- Mobile viewport layout has no overlapping text or controls.
