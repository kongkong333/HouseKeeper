# HouseKeeper

HouseKeeper is a lightweight mobile-first PWA for household supplies, kitchen ingredients, medicine inventory, and daily reminders.

## Run Locally

Use any static file server from this folder. For example:

```bash
python -m http.server 8000
```

Then open:

```text
http://127.0.0.1:8000
```

## Supabase Cloud Sync

This app can sync data across devices through Supabase. The project URL and publishable key live in `supabase-config.js`.

Before using cloud sync, open Supabase SQL Editor and run:

```sql
-- See supabase-schema.sql
```

The app uses a custom username/password login implemented with Supabase Postgres RPC functions. It stores one JSON state document per HouseKeeper account in `public.housekeeper_states`. Log in with the same account on another phone or browser to read and update the same household data.

## AI Menu Recommendations

The "点菜" page first calls the Supabase Edge Function at `functions/v1/recommend-menu`. The safest shared-device setup is to configure the Ark API key as a Supabase secret and never place it in `app.js`, `supabase-config.js`, or any browser-delivered file.

```bash
supabase secrets set ARK_API_KEY=your_ark_api_key
supabase functions deploy recommend-menu
```

The Edge Function calls model `glm-5-2-260617` with `max_tokens` set to `4096` and does not enable thinking mode.

If the Edge Function is not deployed, the app can fall back to a local Ark API key entered on the "点菜" page. That key is stored only in the current browser's `localStorage`; it is not saved into the HouseKeeper household state and is not synced to other devices.

## Phone Use

Open the local or deployed URL in a mobile browser and use the browser menu to add it to the home screen. The app includes a web app manifest and service worker so it can load like a small app after the first visit.

## Data

Data is cached in the current browser with `localStorage`. When Supabase is configured and the user is logged in, the same state is also saved to the cloud.

## Features

- Local household member login and switching.
- Home supplies inventory with low-stock alerts and shopping list.
- Kitchen ingredient inventory with cold, frozen, and room-temperature locations, expiry sorting, quantity actions, and used-up status.
- AI menu recommendations using only unexpired kitchen ingredients through a Supabase Edge Function.
- Medicine inventory with expiry and low-stock reminders.
- Daily reminders with assignee, repeat cycle, and completion status.
