# Wisemonk Portal — Demo

Three interconnected static HTML screens demonstrating the client billing portal, security deposits page, and the internal Ops admin view.

## Screens

| File | Description |
|---|---|
| `index.html` | Landing page with links to all three screens |
| `billing.html` | Client portal — Billings page with outstanding amount, upcoming invoice banner, and activity ledger (Invoices / Payments / Credit notes tabs) |
| `deposits.html` | Client portal — Security deposits page showing locked, adjusted, top-up and released deposit invoices |
| `admin.html` | Internal Ops admin — Full client list with risk scoring + per-client transaction timeline + audit-trailed adjustments modal |

## Tech

Pure static HTML / CSS / vanilla JS — no build step, no dependencies. Drop the folder onto any static host.

Fonts loaded from CDN: Satoshi (fontshare) + Open Sans (Google Fonts).

## Local preview

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Hosted with GitHub Pages

Pushed from this repo and served at the URL shown in the Pages settings.
