# GST Sales Portal

A website run by the CA firm. Merchants record the items they sold each day. CA staff map each item to an HSN code and GST rate once, and every later sale of that item uses the same mapping.

## Roles

| Role | Can do |
|---|---|
| **Admin** (CA) | Everything Staff can do, plus create/deactivate merchants and staff, reset passwords, and permanently delete a deactivated merchant (Delete…, type the business name to confirm; the edit log keeps the record). Before deleting, download a copy: every merchant page has **Download all data (Excel)** (13 sheets: details, monthly summary (cash / bank / total / taxable / GST per month), day summary, invoices, item-wise totals with GST split, items & HSN, employees, salary history, attendance, monthly salary, CA remarks, invoice file list, edit log) and **Invoice files (ZIP)**. CA staff can download too; each download is logged |
| **Staff** (CA) | See all merchants' sales, map items to HSN/rate, lock/unlock days |
| **Merchant** | Enter/edit their own daily sales until the CA locks that day |

## How it works

1. The Admin creates a merchant along with that merchant's login (**Merchants** page).
2. The merchant logs in and opens a date. They enter item name, quantity, unit and amount (incl. GST), then save a draft or **Submit to CA**. A new item name is added to that merchant's item list.
3. CA staff open **HSN mapping**, which lists unmapped items. They enter the HSN (4/6/8 digits) and GST rate. If an item with the same name is already mapped for another merchant, that mapping is shown as a suggestion.
4. The CA can open any merchant's day to see the taxable value and GST worked out from the inclusive amount, then **Lock** the day so the merchant can't change it.

## Payments and invoices

- Merchants enter sales **invoice by invoice**. Each invoice has a number, a payment mode (**Cash, UPI, Card or Other bank**) and its items (qty, unit, amount incl. GST). The next invoice number is suggested.
- Item-wise day totals (`SaleLine`) are rebuilt from the invoices on every save. These drive HSN, tax and the payment checks.
- The day summary works out the invoice count and number range for each mode. The merchant can optionally enter the amount actually received per mode. If it differs from the invoices, the merchant and the CA see a warning, but the merchant can still submit.
- Every merchant save is stored as a snapshot (`SaleDayRevision`). The CA's day view lists the history, including invoices changed or removed after submitting.
- Merchants can attach invoice photos or PDFs (PDF/JPG/PNG/WEBP, max 10 MB). The file type is checked from the file's contents. Files are stored under `UPLOAD_DIR` (default `./uploads`) and only that merchant and CA users can open them.
- Lines entered before the split existed have no payment mode. The merchant is asked to split them the next time they edit that day.

## Edit log (compliance)

- CA users can correct a day's invoices (**Edit invoices** on the day view). A reason is required. The merchant gets it as a remark together with the exact list of changes, and each invoice the CA added or changed is marked **Changed by CA** on both sides until the merchant changes it again. No other CA action touches sales figures.
- CA remarks to merchants (per day or general) can't be edited or deleted. The CA sees when each one was first shown to the merchant.
- Every change is recorded in an append-only `AuditLog`, in the same database transaction as the change. That covers merchant saves and submissions (with exactly which invoices were added, changed or removed), file uploads and removals, HSN mappings, day locks and unlocks, merchant and staff changes, password resets and HSN imports.
- Each entry stores a SHA-256 hash of its contents plus the previous entry's hash. The **Edit log** page (`/ca/audit`) re-checks the whole chain and shows a red warning if any entry was changed or deleted outside the app. It also has filters and a CSV export that includes the hashes.
- Merchants see their own trail under **My activity**, including CA actions on their account.
- The chain can't tell whether the newest entries were removed, or whether someone with direct database access rebuilt the whole chain. To guard against that, download the CSV regularly (e.g. monthly) and keep it outside the server; its last fingerprint must still appear in the live log.

## Employees and attendance

- Merchants manage staff under **Employees**: name, role, phone, monthly salary and joining date, plus a last working day if someone leaves. **Edit / Remove → Left the company** moves the person to *Former employees*: they disappear from the list and from daily attendance after that day, but their attendance and salary records stay in the database. A salary change applies from a chosen month, so earlier months keep the old figure.
- **Attendance → Day** is built for many employees: one line per person, a search box, count tiles that filter (Present, Absent, Not marked…), "Mark everyone not yet marked as Present", and tick boxes to mark several people Absent / Leave / Off at once.
- **Attendance → Month sheet** is a month grid with one row per employee and one column per day. Marks are Present, Absent, Half day, Paid leave and Weekly off / Holiday. Days not yet marked count as paid until marked.
- Per-day pay = monthly salary ÷ days in that month. An absent day deducts one day's pay and a half day deducts half. Days before joining or after leaving are not paid.
- CA users see each merchant's sheet read-only (merchant page → *Attendance & salary*). Adding employees, salary changes and every attendance mark go into the edit log.
- Nothing is deleted automatically. The month picker covers the last 12 months, and older data stays in the database.

## Business types

The Admin assigns each merchant one or more business types (Kirana, Electronics, …) and a GST registration type (Regular / Composition / Unregistered). The dashboard and the Merchants list can be filtered by type. HSN search lists codes typical for the merchant's trade first, marked "Fits …". The type-to-code-prefix table is in `src/lib/business.ts`.

## Merchant HSN access

On the **Merchants** page the Admin can turn on **Merchant can map HSN** for individual merchants. Those merchants get an **HSN codes** menu where they can map their own items using the same official-list search. Search hints only reflect their own items. On the CA's mapping page, mappings a merchant made carry a "merchant" badge, and the CA can change them.

## HSN list

The **HSN codes** page holds the official HSN (goods) and SAC (services) directory from the GST portal: the file behind *Services → User Services → Search HSN Code → Download HSN Directory*.

- The Admin can refresh it with **Update from GST portal**, or upload `HSN_SAC.xlsx` by hand if the server can't reach the portal. From the command line, run `npm run hsn:import [file.xlsx]`.
- On the mapping page, the HSN box searches this list by code or description. Once the list is loaded, codes that aren't on it are rejected.
- The portal file has **no GST rates**, so the CA still picks the rate. When a code has been used before, the rate used most often for it is filled in as a suggestion.

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run db:push          # creates prisma/dev.db (SQLite)
npm run seed             # admin / admin12345
npm run seed -- --demo   # optional: demo merchant demo-shop / demo12345
npm run hsn:import       # loads the official HSN/SAC list from the GST portal
npm run dev              # http://localhost:3000
```

Change the admin password after the first login (Staff page → Reset password).

## Configuration (`.env`)

- `DATABASE_URL`: SQLite file for now. For production, switch `provider` in `prisma/schema.prisma` to `postgresql` and point this at a Postgres database.
- `SESSION_SECRET`: a random string of at least 32 characters. **Must be changed before deploying.**

## Not built yet (planned)

- GST reports: HSN summary, GSTR-1, GSTR-3B, Excel/PDF export
- Excel/CSV upload of sales
- Photo/PDF bill upload for staff to key in
- B2B invoice entry (customer GSTIN, invoice no.)
