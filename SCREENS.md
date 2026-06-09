# client-balance — Screen Docs

Purpose and flow for each screen in this repo. Live pages:
`https://anjuchorotiya.github.io/client-balance/<file>`.

---

## index.html

**Purpose:** Landing page for the "Portal demo" that introduces the three interconnected screens and links into them. Branded "Wisemonk", titled "Portal demo".

**Flow:**
1. Visitor sees the intro copy describing the client billing portal, security deposits page, and internal Ops admin view.
2. Two cards are presented: a "Client" card labelled "Billings" (links to `billing.html`) and an "Ops admin" card labelled "Admin portal" (links to `admin.html`).
3. Clicking a card opens the corresponding screen.

**Notes:** No deposits link is shown directly — `deposits.html` is reached from within `billing.html`. Footer reads "Hosted with GitHub Pages".

---

## admin.html

**Purpose:** Internal Ops admin view ("Admin · Clients — Wisemonk Ops"). It combines a client/deposit monitoring list with an "All line items" classification tool, where each invoice line can be ticked as a security deposit and tracked through settlement.

**Flow:**
1. Sidebar (section "OPERATIONS") has two nav items: **Deposits** (default, active) and **All invoices**.
2. The default **Deposits** view shows a header ("Monitor client outstanding balances, exposure, deposit coverage and risk levels."), three stat cards (Active clients, Outstanding invoices, Deposits held), and search + risk/status filters.
3. The clients table is sortable with columns: Client, Employees, Outstanding amount, Monthly exposure, Deposit held, Agreed (months), Inventory (month), Status, Notes. Selecting a client opens a transaction timeline (Date / Activity / Amount / Status) with adjustment actions (e.g. issue credit note, release/refund deposit).
4. Switching to **All invoices** opens the "All line items" view: "Every line item across all Zoho invoices. Tick Deposit to classify a line as a security deposit, then capture the employee and track settlement."
5. The line-items table has columns: Line item, Invoice / client, Amount, Deposit (checkbox), Employee, Deposit status. A status filter offers All line items / Deposits only / Regular charges / Needs attention / Settled deposits, and a **Save** button commits changes.
6. Drilling into a single invoice opens a detail sub-view (breadcrumb back to "All invoices") with invoice meta and a per-line classification list — for deposits the employee is captured, and exited employees can have start/end dates added.

**Validations:**
- Issue credit-note modal — Amount (`#cnAmount`, `type=number`): required, must be a positive number (`>0`); blocks submit and refocuses the field otherwise.
- Issue credit-note modal — Reason (`#cnReason`): required (non-empty after trim); blocks submit and refocuses otherwise.
- Adjustment modal — Reason (`#adjReason`): required (non-empty after trim) for every adjustment type before the confirm panel shows.
- Adjustment modal (Add credit / Deduct credit) — Amount (`.adj-amount`, `type=number`): required, must be `>0`.
- Adjustment modal (Mark invoice as paid) — Invoice (`#adjInvoice`): a selection is required.
- Adjustment modal (Release / refund deposit) — Deposit (`#adjDeposit`): a selection is required; amount falls back to the deposit's value if left blank.
- Line item → Deposit checkbox: ticking Deposit makes Employee a required follow-up — a deposit line with no employee name (`invNamed` false) is flagged "Needs attention" (`data-attention="1"`), as is an exited employee whose settlement is not `settled`.
- Exited-employee start/end (`type=date` inputs): only surfaced once the employee is captured / marked as exited.

**Notes:** Top bar identifies the user as "Ops Admin". Deposit rows use a distinct purple accent.

---

## billing.html

**Purpose:** Client-facing billing screen ("Wallet - Wisemonk", page heading "Billing") showing the outstanding amount, an upcoming-invoice banner, and a transaction ledger split into Invoices / Payments / Credits tabs, with invoice and payment detail drawers.

**Flow:**
1. Sidebar nav (WORKSPACE + FINANCE sections) has **Billings** active under FINANCE.
2. A dismissible upcoming-invoice banner announces the open invoice ("Your invoice for May 2026 payroll is open", INV-2026-0050 of $14,700.00 after $500 credit, due 10 May 2026) with a "View invoice" link.
3. An "Outstanding amount" balance card shows the total due (with an info popover explaining it is the sum of open invoices) and a "View deposit" link to `deposits.html`.
4. A tab bar switches the ledger between **Invoices**, **Payments**, and **Credits** (each with a live count); a search box plus a multi-select Status filter (Paid / Partially paid / Due-Unpaid) and a single-select date-range filter refine the table.
5. The table columns adapt per tab — Invoices show Date / Activity / Paid on / Amount / Status; Payments show Date / Activity / Invoice / Amount; Credits show Date / Activity / Amount.
6. Clicking a row opens a detail drawer: invoices show line items (payroll funding with per-employee breakdown, EOR service fee, applied credit notes) and bank-transfer details (Local / SWIFT tabs with copy buttons); payments show a downloadable receipt.

**Validations:**
- The deposit-notify modal (`#addOverlay`) marks Amount transferred (`#amtInput`, `type=number`) and UTR / Reference number (`#utrInput`) as required via a visual `*`; Transfer date (`#utrDate`) is `type=date` and optional. Note: these are markup-level constraints only — no JS currently enforces them and the modal's open trigger / step submit are unwired, so there is no active validating form.
- The transactions search box and the multi-select Status / single-select date-range filters are non-validating refinement inputs.

**Notes:** Invoice data is described as synced from Zoho Books. An "Overdue advance" / security-deposit info modal explains how the locked deposit is used (auto-drawn when wallet runs short, applied to overdue invoices past the 7-day grace, refunded at offboarding).

---

## deposits.html

**Purpose:** Client-facing security-deposits screen ("Security deposits - Wisemonk") listing the advance invoices held against the client's active employees, with their status (Locked / Released) and release/top-up handling.

**Flow:**
1. Sidebar matches `billing.html` (Billings active); page header reads "Security deposits — Advance invoices held against your active employees."
2. A salary-increase top-up alert flags when an employee's revision requires an additional deposit (e.g. Priya Singh, +₹25,000) with a "Pay top-up" action.
3. A summary card shows "Total locked deposit" (₹4,85,000.00) with an info popover for the deposit policy (refundable at offboarding, adjustable for new joiners, top-up on salary increase), plus meta on count, top-ups due, releases, and oldest hold.
4. An "Advance invoices" section (with count + search) lists deposits in a table: Date, Invoice, Held against (employee), Amount, Status.
5. Rows carry type badges (Top-up / Adjusted / Released) and a status of Locked or Released; released rows are visually muted.
6. Clicking a row opens a deposit-detail drawer with the deposit's particulars.

**Notes:** Deposits are locked, refundable only at offboarding or adjustable/transferable for new joiners. Released deposits record an exit date and release destination (e.g. to wallet).
