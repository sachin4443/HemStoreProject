-- =============================================================================
-- HEM Store - database (PostgreSQL)
-- =============================================================================
-- 1. Create an empty database named HemStore (pgAdmin: Databases > Create).
-- 2. Open this file in that database's Query Tool and run it (F5).
--
-- Safe to run again: tables, indexes and starter rows are only added when
-- missing. Nothing is ever dropped, changed or deleted by this script.
--
-- Students are NOT stored here as accounts: they log in with their HEM Virtues
-- ID, and their points come from HEM Virtues. This database keeps only what
-- happens in the store (redemptions, orders, vendors, invoices).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------- settings
CREATE TABLE IF NOT EXISTS settings
(
    key         text PRIMARY KEY,
    value       text NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  text
);

CREATE TABLE IF NOT EXISTS settings_log
(
    id          bigserial PRIMARY KEY,
    key         text NOT NULL,
    old_value   text,
    new_value   text NOT NULL,
    changed_by  text,
    changed_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- people
CREATE TABLE IF NOT EXISTS admins
(
    id             serial PRIMARY KEY,
    name           text NOT NULL,
    email          text NOT NULL,
    password_hash  text NOT NULL,
    is_active      boolean NOT NULL DEFAULT true,
    failed_logins  int NOT NULL DEFAULT 0,
    locked_until   timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    last_login_at  timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_admins_email ON admins (lower(email));

CREATE TABLE IF NOT EXISTS vendors
(
    id              serial PRIMARY KEY,
    business_name   text NOT NULL,
    owner_name      text NOT NULL,
    email           text NOT NULL,
    phone           text NOT NULL,
    password_hash   text NOT NULL,
    gstin           text,
    pan             text,
    address         text,
    city            text NOT NULL,
    pin_from        int NOT NULL,
    pin_to          int NOT NULL,
    delivery_days   text NOT NULL DEFAULT '3-5 days',
    categories      text,                       -- comma separated category names
    bank_name       text,
    bank_account    text,
    bank_ifsc       text,
    status          text NOT NULL DEFAULT 'Pending'
                    CHECK (status IN ('Pending', 'Active', 'Rejected', 'Suspended')),
    review_note     text,
    applied_at      timestamptz NOT NULL DEFAULT now(),
    reviewed_at     timestamptz,
    reviewed_by     text,
    failed_logins   int NOT NULL DEFAULT 0,
    locked_until    timestamptz,
    last_login_at   timestamptz,
    CHECK (pin_from <= pin_to)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_vendors_email ON vendors (lower(email));
CREATE INDEX IF NOT EXISTS ix_vendors_status_pins ON vendors (status, pin_from, pin_to);

CREATE TABLE IF NOT EXISTS vendor_documents
(
    id           serial PRIMARY KEY,
    vendor_id    int NOT NULL REFERENCES vendors (id),
    doc_type     text NOT NULL,                 -- GST certificate, PAN card, Cancelled cheque, Shop photo
    file_name    text NOT NULL,                 -- stored file (private folder)
    original     text,
    uploaded_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_vendor_documents_vendor ON vendor_documents (vendor_id);

-- Copy of the student's HEM Virtues profile, refreshed at every login (for admin lists and orders).
CREATE TABLE IF NOT EXISTS students
(
    student_id          int PRIMARY KEY,         -- users.userid in HEM Virtues
    name                text NOT NULL,
    username            text,
    standard            text,
    division            text,
    school              text,
    mobile              text,
    email               text,
    address             text,
    city                text,
    state               text,
    pincode             text,
    last_total_points   int NOT NULL DEFAULT 0,  -- points HEM Virtues reported last time
    first_seen_at       timestamptz NOT NULL DEFAULT now(),
    last_seen_at        timestamptz NOT NULL DEFAULT now()
);

-- One-time "Redeem" tickets from HEM Virtues: each ticket id can be used once.
CREATE TABLE IF NOT EXISTS sso_tickets_used
(
    jti         text PRIMARY KEY,
    student_id  int NOT NULL,
    used_at     timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL
);

-- ---------------------------------------------------------------- catalogue
CREATE TABLE IF NOT EXISTS categories
(
    id          serial PRIMARY KEY,
    slug        text NOT NULL,
    name        text NOT NULL,
    name_hi     text,
    color       text NOT NULL DEFAULT '#6B2FA8',
    tint        text NOT NULL DEFAULT '#F0EAFF',
    art         text NOT NULL DEFAULT 'badge',
    sort_order  int NOT NULL DEFAULT 0,
    is_active   boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_categories_slug ON categories (slug);

CREATE TABLE IF NOT EXISTS products
(
    id            serial PRIMARY KEY,
    vendor_id     int REFERENCES vendors (id),   -- NULL = added by HEM
    category_id   int NOT NULL REFERENCES categories (id),
    name          text NOT NULL,
    name_hi       text,
    about         text,
    highlights    text,                          -- one per line
    age_group     text NOT NULL DEFAULT 'All',
    mrp           numeric(10,2),
    price         numeric(10,2) NOT NULL CHECK (price > 0),
    stock         int NOT NULL DEFAULT 0 CHECK (stock >= 0),
    hsn           text,
    image_file    text,                          -- uploaded photo (public folder)
    art           text NOT NULL DEFAULT 'badge', -- drawing used when there is no photo
    status        text NOT NULL DEFAULT 'Pending'
                  CHECK (status IN ('Pending', 'Live', 'Rejected', 'Hidden')),
    review_note   text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    reviewed_at   timestamptz,
    reviewed_by   text
);
CREATE INDEX IF NOT EXISTS ix_products_status_category ON products (status, category_id);
CREATE INDEX IF NOT EXISTS ix_products_vendor ON products (vendor_id);

CREATE TABLE IF NOT EXISTS wishlist
(
    student_id  int NOT NULL,
    product_id  int NOT NULL REFERENCES products (id),
    added_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (student_id, product_id)
);

CREATE TABLE IF NOT EXISTS cart_items
(
    student_id  int NOT NULL,
    product_id  int NOT NULL REFERENCES products (id),
    qty         int NOT NULL CHECK (qty BETWEEN 1 AND 10),
    added_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (student_id, product_id)
);

-- ---------------------------------------------------------------- orders
CREATE TABLE IF NOT EXISTS orders
(
    id               serial PRIMARY KEY,
    order_no         text NOT NULL,
    student_id       int NOT NULL,
    student_name     text NOT NULL,
    student_class    text,
    school           text,
    receiver_name    text NOT NULL,
    mobile           text NOT NULL,
    address          text NOT NULL,
    city             text NOT NULL,
    state            text NOT NULL,
    pincode          text NOT NULL,
    delivery_note    text,
    parent_checked   boolean NOT NULL DEFAULT false,
    amount           numeric(10,2) NOT NULL,      -- shopping money paid
    status           text NOT NULL DEFAULT 'Placed'
                     CHECK (status IN ('Placed', 'Verified', 'Assigned', 'Accepted', 'Packed', 'Shipped',
                                       'Out for delivery', 'Delivered', 'Cancelled')),
    vendor_id        int REFERENCES vendors (id),
    delivery_code    text NOT NULL,               -- 4-digit code the student tells at delivery
    received_by      text,
    proof_file       text,                        -- delivery photo (private folder)
    student_rating   text,
    student_received_at timestamptz,
    cancel_reason    text,
    invoice_id       int,
    placed_at        timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    delivered_at     timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_no ON orders (order_no);
CREATE INDEX IF NOT EXISTS ix_orders_student ON orders (student_id, placed_at DESC);
CREATE INDEX IF NOT EXISTS ix_orders_status ON orders (status, placed_at DESC);
CREATE INDEX IF NOT EXISTS ix_orders_vendor ON orders (vendor_id, status);

CREATE TABLE IF NOT EXISTS order_items
(
    id          serial PRIMARY KEY,
    order_id    int NOT NULL REFERENCES orders (id),
    product_id  int NOT NULL REFERENCES products (id),
    name        text NOT NULL,
    art         text,
    image_file  text,
    qty         int NOT NULL CHECK (qty > 0),
    price       numeric(10,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_order_items_order ON order_items (order_id);

CREATE TABLE IF NOT EXISTS order_events
(
    id          bigserial PRIMARY KEY,
    order_id    int NOT NULL REFERENCES orders (id),
    status      text NOT NULL,
    note        text,
    by_role     text NOT NULL,                  -- Student, Admin, Vendor, System
    by_name     text,
    at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_order_events_order ON order_events (order_id, at);

-- ---------------------------------------------------------------- wallet
-- Every change to a student's store wallet:
--   redeem  points < 0, money > 0   (points turned into shopping money)
--   order   money < 0               (paid for an order)
--   refund  money > 0               (cancelled order)
--   adjust  points +/-               (admin correction, with a reason)
CREATE TABLE IF NOT EXISTS wallet_ledger
(
    id          bigserial PRIMARY KEY,
    student_id  int NOT NULL,
    kind        text NOT NULL CHECK (kind IN ('redeem', 'order', 'refund', 'adjust')),
    points      int NOT NULL DEFAULT 0,
    money       numeric(10,2) NOT NULL DEFAULT 0,
    order_id    int REFERENCES orders (id),
    note        text,
    by_name     text,
    at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_wallet_ledger_student ON wallet_ledger (student_id, at DESC);

-- ---------------------------------------------------------------- vendor invoices
CREATE TABLE IF NOT EXISTS invoices
(
    id            serial PRIMARY KEY,
    vendor_id     int NOT NULL REFERENCES vendors (id),
    invoice_no    text NOT NULL,
    invoice_date  date NOT NULL,
    amount        numeric(10,2) NOT NULL,
    file_name     text,                          -- invoice PDF (private folder)
    status        text NOT NULL DEFAULT 'Submitted'
                  CHECK (status IN ('Submitted', 'Approved', 'Rejected', 'Paid')),
    review_note   text,
    submitted_at  timestamptz NOT NULL DEFAULT now(),
    approved_at   timestamptz,
    approved_by   text,
    pay_mode      text,
    utr           text,
    paid_at       timestamptz,
    paid_by       text
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_invoices_vendor_no ON invoices (vendor_id, lower(invoice_no));
CREATE INDEX IF NOT EXISTS ix_invoices_status ON invoices (status, submitted_at DESC);

-- ---------------------------------------------------------------- starter rows
INSERT INTO settings (key, value) VALUES
    ('point_value',          '0.50'),   -- shopping money (Rs) for 1 point
    ('min_redeem',           '200'),    -- smallest redemption, and the step size
    ('max_redeem_per_month', '1000'),   -- per student
    ('store_open',           'true'),
    ('delivery_days',        '3-5 days')
ON CONFLICT (key) DO NOTHING;

INSERT INTO categories (slug, name, name_hi, color, tint, art, sort_order) VALUES
    ('stationery', 'Stationery',        'स्टेशनरी',            '#1F6FE0', '#E9F0FF', 'pencils',    1),
    ('books',      'Story Books',       'कहानी की किताबें',     '#13B0EA', '#E3F4FF', 'storybook',  2),
    ('art',        'Art & Craft',       'कला और शिल्प',         '#E3247F', '#FFEAF2', 'paints',     3),
    ('sports',     'Sports & Play',     'खेल-कूद',              '#2E9E4F', '#E7F8E6', 'football',   4),
    ('learning',   'Learning Toys',     'सीखने वाले खिलौने',    '#7B3FA0', '#F0EAFF', 'sciencekit', 5),
    ('school',     'School Essentials', 'स्कूल का सामान',       '#F7941D', '#FFF1D6', 'schoolbag',  6)
ON CONFLICT (slug) DO NOTHING;

COMMIT;

-- Check: every line should say OK
SELECT t AS table_name, CASE WHEN to_regclass('public.' || t) IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS status
FROM unnest(ARRAY['settings', 'admins', 'vendors', 'vendor_documents', 'students', 'sso_tickets_used', 'categories',
                  'products', 'wishlist', 'cart_items', 'orders', 'order_items', 'order_events', 'wallet_ledger', 'invoices']) AS t;
