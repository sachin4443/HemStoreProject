# HEM-Store

Students turn the points they earn in **HEM Virtues** into gifts. One ASP.NET Core (.NET 10) app
serves both the API (`/api/...`) and the web pages (`wwwroot`), so `dotnet run` starts everything
and `dotnet publish` puts everything in one folder.

Three portals in one site:

| Who | Logs in with | Can |
|---|---|---|
| Student | HEM Virtues ID and password, or the **Redeem in HEM Store** button on the HEM Virtues dashboard | redeem points into shopping money, shop, wishlist, cart, order, track, confirm delivery |
| Vendor (shop) | e-mail + password, after registering and HEM approval | products (sent for approval), assigned orders, status, delivery proof (photo + student's code), invoices, payments |
| Admin (HEM team) | e-mail + password | dashboard, points rules, student wallets, products and categories, vendor approval, order verification and assignment, tracking, invoices, payments, reports, admins |

## How points work

* HEM Virtues owns the student account and the **earned** points (the "Total Marks" card on the
  student dashboard, from `hf_sp_getstudentmaincourses`).
* HEM-Store keeps everything that happens in the store (`wallet_ledger`): redemptions, orders, refunds
  and admin adjustments.
* **Points left = earned in HEM Virtues + admin adjustments − points redeemed.**
  **Shopping money = money from redeemed points − orders + refunds.**
* Redeeming always asks HEM Virtues for the live total and locks the student's wallet, so a double
  click cannot spend the same points twice.

## How the two sites talk

Both sites share one secret (at least 32 characters). Nothing secret is stored in git.

* **Redeem button** – HEM Virtues signs a ticket (HMAC-SHA256, valid 2 minutes) and sends the student
  to `https://store.../sso?ticket=...`. The store checks the signature and time and accepts each ticket
  only once (`sso_tickets_used`). No password travels.
* **Store login page** – the store asks HEM Virtues (`POST /api/hemstore-bridge/login`, signed) whether
  the ID and password are right. The store never stores student passwords.
* **Points** – `GET /api/hemstore-bridge/students/{id}` (signed) returns the profile and total points.

## Run on a developer machine

1. PostgreSQL must be running (user `postgres`, password as in `appsettings.Development.json`).
2. Open the project and press F5 (or `dotnet run`). **The database `HemStore` and all its tables are
   created automatically** at start-up (Services/DbMigrator.cs runs `Database/HemStore_Create.sql`,
   which only adds what is missing, so every start is safe). Turn it off with `HemStore:AutoMigrate = false`.
3. The store opens at `https://localhost:7200`. HEM Virtues runs at `https://localhost:7150`.
   Both `appsettings.Development.json` files already carry the same development shared secret,
   so the **Redeem in HEM Store** button and the store's student login work at once.
4. The first visit shows **Create the first admin** (works only while there is no admin).

The connection string and the shared secret in `appsettings.Development.json` are for development
only. Use your own values on the server (below).

## Publish

```bash
dotnet publish -c Release -o publish
```

Copy the `publish` folder to the server (IIS: `web.config` is included). On the server set, as
environment variables or in the IIS application settings (not in files in git):

* `ConnectionStrings__HemStore`
* `HemVirtues__SharedSecret` (same value as `HemStore__SharedSecret` in HEM Virtues)
* `HemVirtues__BaseUrl` = `https://www.hemvirtues.com` (already the default in `appsettings.json`)

and in HEM Virtues: `HemStore__StoreUrl` = `https://store.hemvirtues.com` (default) and
`HemStore__SharedSecret`.

Uploaded files (product photos, delivery photos, invoices, vendor documents) are saved in `App_Data`
next to the app (`HemStore:UploadFolder` to change it). Back this folder up; it is not part of a publish.

## Project layout

```
Program.cs                 start-up: database, login cookie, rate limit, API + pages
Controllers/               AuthController (logins, /sso), StoreController (student),
                           VendorController, AdminController, MediaController (product photos)
Services/                  Db, StoreSettings, HemVirtuesClient (signed calls), WalletService,
                           OrderService (order flow), FileStore (checked uploads)
Database/HemStore_Create.sql
wwwroot/                   index.html, css/, js/ (core, auth, student, vendor, admin), img/
```

## Security notes

* Cookie login (HttpOnly, SameSite=Lax); every change through the API needs the
  `X-Requested-With` header (blocks cross-site form posts).
* 30 login tries a minute per address; vendor and admin accounts lock for 15 minutes after 5 wrong
  passwords. Passwords are hashed (ASP.NET Core Identity hasher).
* Uploads are checked by their first bytes (JPG/PNG/WEBP/PDF, 5 MB). Delivery photos, invoices and
  vendor documents are only served to the people allowed to see them.
* Students see only their own orders; vendors only the orders given to them; the delivery code is
  shown to the student until delivery and is needed to mark an order delivered.
