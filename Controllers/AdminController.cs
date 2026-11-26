using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Dapper;
using HemStore.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace HemStore.Controllers
{
    /// <summary>The HEM team's side of the store.</summary>
    [ApiController]
    [Route("api/admin")]
    [Authorize(Policy = Roles.Admin)]
    public class AdminController : ControllerBase
    {
        private readonly Db _db;
        private readonly OrderService _orders;
        private readonly WalletService _wallet;
        private readonly SettingsService _settings;
        private readonly FileStore _files;

        public AdminController(Db db, OrderService orders, WalletService wallet, SettingsService settings, FileStore files)
        {
            _db = db;
            _orders = orders;
            _wallet = wallet;
            _settings = settings;
            _files = files;
        }

        private string MyName => Me.Name(User);

        private static object AdminView(OrderService.OrderRow o) => new
        {
            o.Id, o.OrderNo, o.Status, o.Amount, o.PlacedAt, o.DeliveredAt, o.Items, o.ItemCount, o.FirstArt,
            firstImageUrl = StoreController.ImageUrl(o.FirstImage),
            o.StudentId, o.StudentName, o.StudentClass, o.School, o.ReceiverName, o.Mobile, o.Address, o.City, o.State, o.Pincode, o.DeliveryNote,
            o.VendorId, o.VendorName, o.VendorCity, o.ReceivedBy, o.HasProof, o.StudentRating, o.StudentReceivedAt, o.CancelReason,
            o.InvoiceId, o.InvoiceNo, o.InvoiceStatus
        };

        // ------------------------------------------------------------------ dashboard
        [HttpGet("dashboard")]
        public async Task<IActionResult> Dashboard()
        {
            var settings = await _settings.GetAsync();
            await using var c = await _db.OpenAsync();
            var k = await c.QuerySingleAsync(@"
                SELECT (SELECT coalesce(-sum(points), 0) FROM wallet_ledger WHERE kind = 'redeem' AND at >= date_trunc('month', now()))::int AS redeemed_month,
                       (SELECT coalesce(-sum(points), 0) FROM wallet_ledger WHERE kind = 'redeem')::int AS redeemed_all,
                       (SELECT count(*) FROM orders WHERE placed_at >= date_trunc('month', now()) AND status <> 'Cancelled')::int AS orders_month,
                       (SELECT count(*) FROM students)::int AS students,
                       (SELECT coalesce(sum(last_total_points), 0) FROM students)::bigint AS points_earned_known,
                       (SELECT coalesce(sum(amount), 0) FROM invoices WHERE status IN ('Submitted', 'Approved')) AS payable,
                       (SELECT coalesce(sum(o.amount), 0) FROM orders o WHERE o.status = 'Delivered' AND o.invoice_id IS NULL) AS not_invoiced");
            var todo = await c.QuerySingleAsync(@"
                SELECT (SELECT count(*) FROM orders WHERE status = 'Placed')::int AS to_verify,
                       (SELECT count(*) FROM orders WHERE status = 'Verified')::int AS to_assign,
                       (SELECT count(*) FROM vendors WHERE status = 'Pending')::int AS vendors_pending,
                       (SELECT count(*) FROM products WHERE status = 'Pending')::int AS products_pending,
                       (SELECT count(*) FROM invoices WHERE status = 'Submitted')::int AS invoices_submitted,
                       (SELECT count(*) FROM invoices WHERE status = 'Approved')::int AS invoices_to_pay");
            var months = await MonthsAsync(c, 6);
            var latest = await c.QueryAsync<OrderService.OrderRow>(OrderService.ListSql + " ORDER BY o.placed_at DESC LIMIT 8");
            return Ok(new { success = true, kpi = k, todo, months, latest = latest.Select(AdminView), pointValue = settings.PointValue });
        }

        private static async Task<IEnumerable<dynamic>> MonthsAsync(Npgsql.NpgsqlConnection c, int n) => await c.QueryAsync(@"
            SELECT to_char(m, 'Mon') AS label, to_char(m, 'YYYY-MM') AS month,
                   (SELECT coalesce(-sum(points), 0) FROM wallet_ledger WHERE kind = 'redeem' AND date_trunc('month', at) = m)::int AS redeemed,
                   (SELECT count(*) FROM orders WHERE date_trunc('month', placed_at) = m AND status <> 'Cancelled')::int AS orders,
                   (SELECT coalesce(sum(amount), 0) FROM orders WHERE date_trunc('month', placed_at) = m AND status <> 'Cancelled') AS spent
            FROM generate_series(date_trunc('month', now()) - (@back || ' months')::interval, date_trunc('month', now()), interval '1 month') m
            ORDER BY m", new { back = (n - 1).ToString() });

        // ------------------------------------------------------------------ settings
        [HttpGet("settings")]
        public async Task<IActionResult> Settings()
        {
            var s = await _settings.GetAsync();
            await using var c = await _db.OpenAsync();
            var log = await c.QueryAsync("SELECT key, old_value, new_value, changed_by, changed_at FROM settings_log ORDER BY changed_at DESC LIMIT 20");
            return Ok(new { success = true, settings = s, log });
        }

        public class SettingsDto { public decimal PointValue { get; set; } public int MinRedeem { get; set; } public int MaxRedeemPerMonth { get; set; } public bool StoreOpen { get; set; } public string? DeliveryDays { get; set; } }

        [HttpPost("settings")]
        public async Task<IActionResult> SaveSettings([FromBody] SettingsDto m)
        {
            if (m == null) throw new StoreException("Invalid request.");
            if (m.PointValue <= 0 || m.PointValue > 100) throw new StoreException("The value of 1 point must be between ₹0.01 and ₹100.");
            if (m.MinRedeem < 1 || m.MinRedeem > 100000) throw new StoreException("Please enter the minimum points to redeem.");
            if (m.MaxRedeemPerMonth < m.MinRedeem) throw new StoreException("The monthly limit must be at least the minimum redeem.");
            string days = (m.DeliveryDays ?? "").Trim();
            if (days.Length < 3 || days.Length > 30) throw new StoreException("Please enter the delivery time, e.g. 3-5 days.");

            var values = new Dictionary<string, string>
            {
                ["point_value"] = Math.Round(m.PointValue, 2).ToString("0.00", CultureInfo.InvariantCulture),
                ["min_redeem"] = m.MinRedeem.ToString(),
                ["max_redeem_per_month"] = m.MaxRedeemPerMonth.ToString(),
                ["store_open"] = m.StoreOpen ? "true" : "false",
                ["delivery_days"] = days
            };
            await using var c = await _db.OpenAsync();
            await using var tx = await c.BeginTransactionAsync();
            foreach (var (key, value) in values)
            {
                string? old = await c.ExecuteScalarAsync<string?>("SELECT value FROM settings WHERE key = @key FOR UPDATE", new { key }, tx);
                if (old == value) continue;
                await c.ExecuteAsync("INSERT INTO settings (key, value, updated_at, updated_by) VALUES (@key, @value, now(), @by) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by",
                    new { key, value, by = MyName }, tx);
                await c.ExecuteAsync("INSERT INTO settings_log (key, old_value, new_value, changed_by) VALUES (@key, @old, @value, @by)", new { key, old, value, by = MyName }, tx);
            }
            await tx.CommitAsync();
            _settings.Forget();
            return Ok(new { success = true, message = "Points settings saved. They apply from the next redemption." });
        }

        // ------------------------------------------------------------------ student wallets
        [HttpGet("wallets")]
        public async Task<IActionResult> Wallets(string? q, int page = 1)
        {
            page = Math.Max(1, page);
            string like = "%" + (q ?? "").Trim() + "%";
            await using var c = await _db.OpenAsync();
            var rows = await c.QueryAsync(@"
                SELECT s.student_id, s.name, s.username, s.standard, s.division, s.school, s.last_total_points AS earned, s.last_seen_at,
                       coalesce(w.redeemed, 0)::int AS redeemed, coalesce(w.adjusted, 0)::int AS adjusted, coalesce(w.money, 0) AS money, w.last_at
                FROM students s
                LEFT JOIN (SELECT student_id, -sum(points) FILTER (WHERE kind = 'redeem') AS redeemed, sum(points) FILTER (WHERE kind = 'adjust') AS adjusted,
                                  sum(money) AS money, max(at) AS last_at FROM wallet_ledger GROUP BY student_id) w ON w.student_id = s.student_id
                WHERE @q = '' OR s.name ILIKE @like OR coalesce(s.username, '') ILIKE @like OR coalesce(s.school, '') ILIKE @like OR s.student_id::text = @q
                ORDER BY coalesce(w.last_at, s.last_seen_at) DESC LIMIT 50 OFFSET @skip", new { q = (q ?? "").Trim(), like, skip = (page - 1) * 50 });
            var totals = await c.QuerySingleAsync(@"SELECT (SELECT count(*) FROM students)::int AS students,
                                                           (SELECT coalesce(sum(money), 0) FROM wallet_ledger) AS money,
                                                           (SELECT coalesce(-sum(points), 0) FROM wallet_ledger WHERE kind = 'redeem')::int AS redeemed");
            return Ok(new { success = true, students = rows, totals });
        }

        [HttpGet("wallets/{id:int}")]
        public async Task<IActionResult> Wallet(int id)
        {
            await using var c = await _db.OpenAsync();
            var s = await c.QueryFirstOrDefaultAsync("SELECT student_id, name, username, standard, division, school, mobile, city, pincode FROM students WHERE student_id = @id", new { id });
            if (s == null) throw new StoreException("This student has not used the store yet.", 404);
            var summary = await _wallet.SummaryAsync(id);
            var ledger = await c.QueryAsync("SELECT kind, points, money, note, by_name, at FROM wallet_ledger WHERE student_id = @id ORDER BY at DESC, id DESC LIMIT 50", new { id });
            var orders = await c.QueryAsync("SELECT id, order_no, status, amount, placed_at FROM orders WHERE student_id = @id ORDER BY placed_at DESC LIMIT 10", new { id });
            return Ok(new { success = true, student = s, wallet = summary, ledger, orders });
        }

        public class AdjustDto { public int Points { get; set; } public string? Reason { get; set; } }

        /// <summary>Adds or takes away store points (shown in the student's history with the reason).</summary>
        [HttpPost("wallets/{id:int}/adjust")]
        public async Task<IActionResult> Adjust(int id, [FromBody] AdjustDto m)
        {
            if (m == null || m.Points == 0 || Math.Abs(m.Points) > 10000) throw new StoreException("Enter the points to add or take away (up to 10,000).");
            string reason = (m.Reason ?? "").Trim();
            if (reason.Length < 5 || reason.Length > 200) throw new StoreException("Please write the reason (shown to the student).");
            await using var c = await _db.OpenAsync();
            if (!await c.ExecuteScalarAsync<bool>("SELECT EXISTS (SELECT 1 FROM students WHERE student_id = @id)", new { id }))
                throw new StoreException("This student has not used the store yet.", 404);
            if (m.Points < 0)
            {
                var w = await _wallet.SummaryAsync(id, fresh: true);
                if (-m.Points > w.Available) throw new StoreException($"The student has only {w.Available} points available.");
            }
            await c.ExecuteAsync("INSERT INTO wallet_ledger (student_id, kind, points, note, by_name) VALUES (@id, 'adjust', @Points, @reason, @by)", new { id, m.Points, reason, by = MyName });
            return Ok(new { success = true, message = m.Points > 0 ? $"{m.Points} points added." : $"{-m.Points} points taken away." });
        }

        // ------------------------------------------------------------------ categories and products
        [HttpGet("products")]
        public async Task<IActionResult> Products()
        {
            var settings = await _settings.GetAsync();
            await using var c = await _db.OpenAsync();
            var list = await c.QueryAsync(@"SELECT p.id, p.vendor_id, v.business_name AS vendor, p.category_id, k.name AS category, p.name, p.name_hi, p.about, p.highlights,
                                                   p.age_group, p.mrp, p.price, p.stock, p.hsn, p.art, p.image_file, p.status, p.review_note, p.updated_at,
                                                   (SELECT coalesce(sum(oi.qty), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id
                                                    WHERE oi.product_id = p.id AND o.status <> 'Cancelled' AND o.placed_at >= date_trunc('month', now()))::int AS sold_month
                                            FROM products p JOIN categories k ON k.id = p.category_id LEFT JOIN vendors v ON v.id = p.vendor_id
                                            ORDER BY (p.status = 'Pending') DESC, p.updated_at DESC");
            var cats = await c.QueryAsync("SELECT id, slug, name, name_hi, color, tint, art, sort_order, is_active, (SELECT count(*) FROM products p WHERE p.category_id = k.id)::int AS products FROM categories k ORDER BY sort_order, name");
            var vendors = await c.QueryAsync("SELECT id, business_name FROM vendors WHERE status = 'Active' ORDER BY business_name");
            return Ok(new { success = true, products = list, categories = cats, vendors, pointValue = settings.PointValue });
        }

        public class AdminProductForm : VendorController.ProductForm { public int? VendorId { get; set; } }

        /// <summary>Products added or changed by HEM go live at once.</summary>
        [HttpPost("products")]
        [HttpPost("products/{id:int}")]
        public async Task<IActionResult> SaveProduct(int? id, [FromForm] AdminProductForm f)
        {
            await using var c = await _db.OpenAsync();
            var v = await VendorController.CheckProductAsync(c, f);
            int? vendorId = f.VendorId is > 0 ? f.VendorId : null;
            if (vendorId != null && !await c.ExecuteScalarAsync<bool>("SELECT EXISTS (SELECT 1 FROM vendors WHERE id = @vendorId AND status = 'Active')", new { vendorId }))
                throw new StoreException("Choose an active vendor, or none.");
            string? image = f.Image != null && f.Image.Length > 0 ? await _files.SaveAsync(f.Image, "products", FileStore.Kind.Image, "product photo") : null;
            if (id is > 0)
            {
                int n = await c.ExecuteAsync(@"UPDATE products SET vendor_id = @vendorId, category_id = @Cat, name = @Name, name_hi = @Hi, about = @About, highlights = @High,
                                               age_group = @Age, mrp = @Mrp, price = @Price, stock = @Stock, hsn = @Hsn, art = @Art, image_file = coalesce(@image, image_file),
                                               status = CASE WHEN status = 'Hidden' THEN 'Hidden' ELSE 'Live' END, review_note = NULL,
                                               reviewed_at = now(), reviewed_by = @by, updated_at = now() WHERE id = @id",
                    new { vendorId, v.Cat, v.Name, v.Hi, v.About, v.High, v.Age, v.Mrp, v.Price, v.Stock, v.Hsn, v.Art, image, by = MyName, id });
                if (n == 0) throw new StoreException("Product not found.", 404);
                return Ok(new { success = true, id, message = "Product saved." });
            }
            int newId = await c.ExecuteScalarAsync<int>(@"INSERT INTO products (vendor_id, category_id, name, name_hi, about, highlights, age_group, mrp, price, stock, hsn, art, image_file, status, reviewed_at, reviewed_by)
                                                         VALUES (@vendorId, @Cat, @Name, @Hi, @About, @High, @Age, @Mrp, @Price, @Stock, @Hsn, @Art, @image, 'Live', now(), @by) RETURNING id",
                new { vendorId, v.Cat, v.Name, v.Hi, v.About, v.High, v.Age, v.Mrp, v.Price, v.Stock, v.Hsn, v.Art, image, by = MyName });
            return Ok(new { success = true, id = newId, message = "Product added and live." });
        }

        public class ReviewDto { public string? Action { get; set; } public string? Note { get; set; } }

        [HttpPost("products/{id:int}/review")]
        public async Task<IActionResult> ReviewProduct(int id, [FromBody] ReviewDto m)
        {
            string? status = m?.Action switch { "approve" => "Live", "show" => "Live", "reject" => "Rejected", "hide" => "Hidden", _ => null };
            if (status == null) throw new StoreException("Invalid action.");
            string? note = string.IsNullOrWhiteSpace(m!.Note) ? null : m.Note.Trim();
            if (status == "Rejected" && (note?.Length ?? 0) < 3) throw new StoreException("Please write why it is rejected (the vendor sees this).");
            await using var c = await _db.OpenAsync();
            int n = await c.ExecuteAsync("UPDATE products SET status = @status, review_note = @note, reviewed_at = now(), reviewed_by = @by WHERE id = @id", new { id, status, note, by = MyName });
            if (n == 0) throw new StoreException("Product not found.", 404);
            if (status != "Live") await c.ExecuteAsync("DELETE FROM cart_items WHERE product_id = @id", new { id });
            return Ok(new { success = true, message = m.Action switch { "approve" => "Product approved and live.", "reject" => "Product rejected.", "hide" => "Product hidden from students.", _ => "Product is live again." } });
        }

        public class CategoryDto { public int? Id { get; set; } public string? Name { get; set; } public string? NameHi { get; set; } public string? Color { get; set; } public string? Art { get; set; } public bool IsActive { get; set; } = true; }

        [HttpPost("categories")]
        public async Task<IActionResult> SaveCategory([FromBody] CategoryDto m)
        {
            string name = (m?.Name ?? "").Trim();
            if (name.Length < 2 || name.Length > 60) throw new StoreException("Please enter the category name.");
            string color = Regex.IsMatch(m!.Color ?? "", "^#[0-9A-Fa-f]{6}$") ? m.Color! : "#6B2FA8";
            string tint = "#" + string.Concat(Enumerable.Range(0, 3).Select(i => ((int)(Convert.ToInt32(color.Substring(1 + i * 2, 2), 16) * 0.12 + 255 * 0.88)).ToString("X2")));
            string art = Regex.IsMatch(m.Art ?? "", "^[a-z]{2,20}$") ? m.Art! : "badge";
            string slug = Regex.Replace(name.ToLowerInvariant(), "[^a-z0-9]+", "-").Trim('-');
            if (slug.Length == 0) slug = "category";
            await using var c = await _db.OpenAsync();
            if (m.Id is > 0)
            {
                await c.ExecuteAsync("UPDATE categories SET name = @name, name_hi = @hi, color = @color, tint = @tint, art = @art, is_active = @IsActive WHERE id = @Id",
                    new { name, hi = m.NameHi?.Trim(), color, tint, art, m.IsActive, m.Id });
                return Ok(new { success = true, message = "Category saved." });
            }
            if (await c.ExecuteScalarAsync<bool>("SELECT EXISTS (SELECT 1 FROM categories WHERE slug = @slug OR lower(name) = lower(@name))", new { slug, name }))
                throw new StoreException("This category already exists.", 409);
            await c.ExecuteAsync("INSERT INTO categories (slug, name, name_hi, color, tint, art, sort_order) VALUES (@slug, @name, @hi, @color, @tint, @art, (SELECT coalesce(max(sort_order), 0) + 1 FROM categories))",
                new { slug, name, hi = m.NameHi?.Trim(), color, tint, art });
            return Ok(new { success = true, message = "Category added." });
        }

        // ------------------------------------------------------------------ vendors
        [HttpGet("vendors")]
        public async Task<IActionResult> Vendors()
        {
            await using var c = await _db.OpenAsync();
            var list = await c.QueryAsync(@"
                SELECT v.id, v.business_name, v.owner_name, v.email, v.phone, v.gstin, v.pan, v.address, v.city, v.pin_from, v.pin_to, v.delivery_days, v.categories,
                       v.bank_name, right(v.bank_account, 4) AS account_last4, v.bank_ifsc, v.status, v.review_note, v.applied_at, v.reviewed_at,
                       (SELECT count(*) FROM orders o WHERE o.vendor_id = v.id AND o.status <> 'Cancelled')::int AS orders,
                       (SELECT count(*) FROM orders o WHERE o.vendor_id = v.id AND o.status = 'Delivered')::int AS delivered,
                       (SELECT round(avg(extract(epoch FROM (o.delivered_at - o.placed_at)) / 86400)::numeric, 1) FROM orders o WHERE o.vendor_id = v.id AND o.status = 'Delivered') AS avg_days,
                       (SELECT coalesce(sum(i.amount), 0) FROM invoices i WHERE i.vendor_id = v.id AND i.status IN ('Submitted', 'Approved')) AS payable,
                       (SELECT count(*) FROM products p WHERE p.vendor_id = v.id AND p.status = 'Live')::int AS live_products,
                       (SELECT json_agg(json_build_object('id', d.id, 'type', d.doc_type) ORDER BY d.id) FROM vendor_documents d WHERE d.vendor_id = v.id) AS documents
                FROM vendors v ORDER BY (v.status = 'Pending') DESC, v.business_name");
            return Ok(new { success = true, vendors = list });
        }

        [HttpGet("vendors/{id:int}/documents/{docId:int}")]
        public async Task<IActionResult> VendorDocument(int id, int docId)
        {
            await using var c = await _db.OpenAsync();
            string? file = await c.ExecuteScalarAsync<string?>("SELECT file_name FROM vendor_documents WHERE id = @docId AND vendor_id = @id", new { id, docId });
            var path = _files.PathOf("vendor-docs", file);
            return path == null ? NotFound() : PhysicalFile(path, FileStore.ContentType(path));
        }

        [HttpPost("vendors/{id:int}/review")]
        public async Task<IActionResult> ReviewVendor(int id, [FromBody] ReviewDto m)
        {
            string? status = m?.Action switch { "approve" => "Active", "activate" => "Active", "reject" => "Rejected", "suspend" => "Suspended", _ => null };
            if (status == null) throw new StoreException("Invalid action.");
            string? note = string.IsNullOrWhiteSpace(m!.Note) ? null : m.Note.Trim();
            if (status is "Rejected" or "Suspended" && (note?.Length ?? 0) < 3) throw new StoreException("Please write the reason.");
            await using var c = await _db.OpenAsync();
            if (status == "Suspended" && await c.ExecuteScalarAsync<bool>("SELECT EXISTS (SELECT 1 FROM orders WHERE vendor_id = @id AND status IN ('Assigned', 'Accepted', 'Packed', 'Shipped', 'Out for delivery'))", new { id }))
                throw new StoreException("This shop still has orders to deliver. Finish or move them first.");
            int n = await c.ExecuteAsync("UPDATE vendors SET status = @status, review_note = @note, reviewed_at = now(), reviewed_by = @by WHERE id = @id", new { id, status, note, by = MyName });
            if (n == 0) throw new StoreException("Vendor not found.", 404);
            return Ok(new { success = true, message = m.Action switch { "approve" => "Vendor approved. They can log in now.", "reject" => "Application rejected.", "suspend" => "Shop paused.", _ => "Shop is active again." } });
        }

        // ------------------------------------------------------------------ orders
        [HttpGet("orders")]
        public async Task<IActionResult> Orders(string? status, string? q)
        {
            string like = "%" + (q ?? "").Trim() + "%";
            await using var c = await _db.OpenAsync();
            var rows = await c.QueryAsync<OrderService.OrderRow>(OrderService.ListSql + @"
                WHERE (@status = '' OR o.status = @status)
                  AND (@q = '' OR o.order_no ILIKE @like OR o.student_name ILIKE @like OR o.pincode = @q OR coalesce(o.school, '') ILIKE @like)
                ORDER BY o.placed_at DESC LIMIT 300", new { status = status ?? "", q = (q ?? "").Trim(), like });
            var counts = (await c.QueryAsync<(string Status, int N)>("SELECT status, count(*)::int FROM orders GROUP BY status")).ToDictionary(x => x.Status, x => x.N);
            return Ok(new { success = true, orders = rows.Select(AdminView), counts });
        }

        [HttpGet("orders/{id:int}")]
        public async Task<IActionResult> Order(int id)
        {
            await using var c = await _db.OpenAsync();
            var d = await _orders.DetailAsync(c, id) ?? throw new StoreException("Order not found.", 404);
            var stock = await c.QueryAsync("SELECT p.id, p.stock FROM products p WHERE p.id IN (SELECT product_id FROM order_items WHERE order_id = @id)", new { id });
            var wallet = await c.QuerySingleAsync("SELECT coalesce(sum(money), 0) AS money FROM wallet_ledger WHERE student_id = @sid", new { sid = d.Order.StudentId });
            return Ok(new
            {
                success = true,
                order = AdminView(d.Order),
                items = d.Items.Select(i => new { i.ProductId, i.Name, i.Art, imageUrl = StoreController.ImageUrl(i.ImageFile), i.Qty, i.Price, i.Total }),
                events = d.Events,
                stock,
                walletMoney = wallet.money
            });
        }

        [HttpPost("orders/{id:int}/verify")]
        public async Task<IActionResult> Verify(int id)
        {
            await using var c = await _db.OpenAsync();
            await using var tx = await c.BeginTransactionAsync();
            await _orders.MoveAsync(c, tx, id, "Placed", "Verified", "Student, payment, stock and address checked", Roles.Admin, MyName);
            await tx.CommitAsync();
            return Ok(new { success = true, message = "Order verified. Next: assign a vendor." });
        }

        /// <summary>Shops that can take the order: active, serving its PIN code; best match first.</summary>
        [HttpGet("orders/{id:int}/vendors")]
        public async Task<IActionResult> Candidates(int id)
        {
            await using var c = await _db.OpenAsync();
            var o = await c.QueryFirstOrDefaultAsync<(string Pincode, string Status)>("SELECT pincode, status FROM orders WHERE id = @id", new { id });
            if (o.Pincode == null) throw new StoreException("Order not found.", 404);
            int pin = int.TryParse(o.Pincode, out var p) ? p : 0;
            var list = await c.QueryAsync(@"
                SELECT v.id, v.business_name, v.city, v.pin_from, v.pin_to, v.delivery_days,
                       (@pin BETWEEN v.pin_from AND v.pin_to) AS serves,
                       (SELECT count(*) FROM order_items oi JOIN products pr ON pr.id = oi.product_id WHERE oi.order_id = @id AND pr.vendor_id = v.id)::int AS own_items,
                       (SELECT count(*) FROM order_items oi WHERE oi.order_id = @id)::int AS all_items,
                       (SELECT count(*) FROM orders x WHERE x.vendor_id = v.id AND x.status IN ('Assigned', 'Accepted', 'Packed', 'Shipped', 'Out for delivery'))::int AS open_orders,
                       (SELECT count(*) FROM orders x WHERE x.vendor_id = v.id AND x.status = 'Delivered')::int AS delivered,
                       (SELECT round(avg(extract(epoch FROM (x.delivered_at - x.placed_at)) / 86400)::numeric, 1) FROM orders x WHERE x.vendor_id = v.id AND x.status = 'Delivered') AS avg_days
                FROM vendors v WHERE v.status = 'Active'
                ORDER BY (@pin BETWEEN v.pin_from AND v.pin_to) DESC, own_items DESC, open_orders, v.business_name", new { id, pin });
            return Ok(new { success = true, vendors = list, pincode = o.Pincode, status = o.Status });
        }

        public class AssignDto { public int VendorId { get; set; } }

        [HttpPost("orders/{id:int}/assign")]
        public async Task<IActionResult> Assign(int id, [FromBody] AssignDto m)
        {
            await using var c = await _db.OpenAsync();
            var v = await c.QueryFirstOrDefaultAsync<(string Name, int PinFrom, int PinTo)>("SELECT business_name, pin_from, pin_to FROM vendors WHERE id = @VendorId AND status = 'Active'", new { m.VendorId });
            if (v.Name == null) throw new StoreException("Choose an active vendor.");
            string pin = await c.ExecuteScalarAsync<string?>("SELECT pincode FROM orders WHERE id = @id", new { id }) ?? throw new StoreException("Order not found.", 404);
            int p = int.TryParse(pin, out var x) ? x : 0;
            string note = v.Name + (p >= v.PinFrom && p <= v.PinTo ? $" · serves PIN {pin}" : $" · outside its usual area (PIN {v.PinFrom}–{v.PinTo})");
            await using var tx = await c.BeginTransactionAsync();
            await _orders.MoveAsync(c, tx, id, "Verified", "Assigned", note, Roles.Admin, MyName, m.VendorId);
            await tx.CommitAsync();
            return Ok(new { success = true, message = "Assigned to " + v.Name + "." });
        }

        public class CancelDto { public string? Reason { get; set; } }

        [HttpPost("orders/{id:int}/cancel")]
        public async Task<IActionResult> Cancel(int id, [FromBody] CancelDto m)
        {
            await _orders.CancelAsync(id, m?.Reason ?? "", Roles.Admin, MyName);
            return Ok(new { success = true, message = "Order cancelled. The shopping money is back with the student." });
        }

        [HttpGet("orders/{id:int}/proof")]
        public async Task<IActionResult> Proof(int id)
        {
            await using var c = await _db.OpenAsync();
            string? file = await c.ExecuteScalarAsync<string?>("SELECT proof_file FROM orders WHERE id = @id", new { id });
            var path = _files.PathOf("proofs", file);
            return path == null ? NotFound() : PhysicalFile(path, FileStore.ContentType(path));
        }

        // ------------------------------------------------------------------ invoices and payments
        [HttpGet("invoices")]
        public async Task<IActionResult> Invoices()
        {
            await using var c = await _db.OpenAsync();
            var list = await c.QueryAsync(@"
                SELECT i.id, i.vendor_id, v.business_name AS vendor, v.gstin, v.bank_name, right(v.bank_account, 4) AS account_last4, v.bank_ifsc,
                       i.invoice_no, i.invoice_date, i.amount, i.status, i.review_note, i.submitted_at, i.approved_at, i.approved_by,
                       i.pay_mode, i.utr, i.paid_at, i.paid_by, (i.file_name IS NOT NULL) AS has_file,
                       (SELECT json_agg(json_build_object('id', o.id, 'no', o.order_no, 'amount', o.amount, 'deliveredAt', o.delivered_at,
                                                          'proof', o.proof_file IS NOT NULL, 'receivedBy', o.received_by) ORDER BY o.id)
                        FROM orders o WHERE o.invoice_id = i.id) AS orders
                FROM invoices i JOIN vendors v ON v.id = i.vendor_id
                ORDER BY CASE i.status WHEN 'Submitted' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END, i.submitted_at DESC");
            var k = await c.QuerySingleAsync(@"SELECT coalesce(sum(amount) FILTER (WHERE status = 'Approved'), 0) AS to_pay,
                                                      coalesce(sum(amount) FILTER (WHERE status = 'Submitted'), 0) AS to_check,
                                                      coalesce(sum(amount) FILTER (WHERE status = 'Paid' AND paid_at >= date_trunc('month', now())), 0) AS paid_month,
                                                      count(DISTINCT vendor_id) FILTER (WHERE status = 'Paid')::int AS vendors_paid,
                                                      round(avg(extract(epoch FROM (paid_at - submitted_at)) / 86400) FILTER (WHERE status = 'Paid')::numeric, 1) AS avg_days
                                               FROM invoices");
            return Ok(new { success = true, invoices = list, kpi = k });
        }

        [HttpGet("invoices/{id:int}/file")]
        public async Task<IActionResult> InvoiceFile(int id)
        {
            await using var c = await _db.OpenAsync();
            string? file = await c.ExecuteScalarAsync<string?>("SELECT file_name FROM invoices WHERE id = @id", new { id });
            var path = _files.PathOf("invoices", file);
            return path == null ? NotFound() : PhysicalFile(path, "application/pdf");
        }

        [HttpPost("invoices/{id:int}/review")]
        public async Task<IActionResult> ReviewInvoice(int id, [FromBody] ReviewDto m)
        {
            if (m?.Action is not ("approve" or "reject")) throw new StoreException("Invalid action.");
            string? note = string.IsNullOrWhiteSpace(m.Note) ? null : m.Note.Trim();
            if (m.Action == "reject" && (note?.Length ?? 0) < 3) throw new StoreException("Please write why it is rejected (the vendor sees this).");
            await using var c = await _db.OpenAsync();
            await using var tx = await c.BeginTransactionAsync();
            string to = m.Action == "approve" ? "Approved" : "Rejected";
            int n = await c.ExecuteAsync("UPDATE invoices SET status = @to, review_note = @note, approved_at = now(), approved_by = @by WHERE id = @id AND status = 'Submitted'", new { id, to, note, by = MyName }, tx);
            if (n == 0) throw new StoreException("This invoice was already checked. Please reload the page.", 409);
            // A rejected invoice frees its orders so the vendor can send a corrected one.
            if (to == "Rejected") await c.ExecuteAsync("UPDATE orders SET invoice_id = NULL WHERE invoice_id = @id", new { id }, tx);
            await tx.CommitAsync();
            return Ok(new { success = true, message = to == "Approved" ? "Invoice approved. Ready for payment." : "Invoice rejected. The vendor can send a corrected one." });
        }

        public class PayDto { public string? Mode { get; set; } public string? Utr { get; set; } }

        [HttpPost("invoices/{id:int}/pay")]
        public async Task<IActionResult> Pay(int id, [FromBody] PayDto m)
        {
            string mode = m?.Mode is "NEFT" or "IMPS" or "RTGS" or "UPI" ? m.Mode : "NEFT";
            string utr = (m?.Utr ?? "").Trim().ToUpperInvariant();
            if (!Regex.IsMatch(utr, "^[A-Z0-9]{6,30}$")) throw new StoreException("Please enter the UTR / bank reference.");
            await using var c = await _db.OpenAsync();
            int n = await c.ExecuteAsync("UPDATE invoices SET status = 'Paid', pay_mode = @mode, utr = @utr, paid_at = now(), paid_by = @by WHERE id = @id AND status = 'Approved'", new { id, mode, utr, by = MyName });
            if (n == 0) throw new StoreException("Only an approved invoice can be paid. Please reload the page.", 409);
            return Ok(new { success = true, message = "Payment recorded." });
        }

        // ------------------------------------------------------------------ reports
        [HttpGet("reports")]
        public async Task<IActionResult> Reports(int months = 6)
        {
            months = Math.Clamp(months, 1, 24);
            await using var c = await _db.OpenAsync();
            var series = await MonthsAsync(c, months);
            var from = await c.ExecuteScalarAsync<DateTime>("SELECT date_trunc('month', now()) - (@back || ' months')::interval", new { back = (months - 1).ToString() });
            var k = await c.QuerySingleAsync(@"
                SELECT (SELECT coalesce(-sum(points), 0) FROM wallet_ledger WHERE kind = 'redeem' AND at >= @from)::int AS redeemed,
                       (SELECT coalesce(sum(money), 0) FROM wallet_ledger WHERE kind = 'redeem' AND at >= @from) AS money_given,
                       (SELECT count(*) FROM orders WHERE placed_at >= @from AND status <> 'Cancelled')::int AS orders,
                       (SELECT count(*) FROM orders WHERE placed_at >= @from AND status = 'Delivered')::int AS delivered,
                       (SELECT count(*) FROM orders WHERE placed_at >= @from AND status = 'Cancelled')::int AS cancelled,
                       (SELECT round(avg(extract(epoch FROM (delivered_at - placed_at)) / 86400)::numeric, 1) FROM orders WHERE placed_at >= @from AND status = 'Delivered') AS avg_days", new { from });
            var top = await c.QueryAsync(@"SELECT oi.name, sum(oi.qty)::int AS qty FROM order_items oi JOIN orders o ON o.id = oi.order_id
                                           WHERE o.placed_at >= @from AND o.status <> 'Cancelled' GROUP BY oi.name ORDER BY qty DESC LIMIT 8", new { from });
            var byCat = await c.QueryAsync(@"SELECT k.name, k.color, sum(oi.qty)::int AS qty FROM order_items oi JOIN orders o ON o.id = oi.order_id
                                             JOIN products p ON p.id = oi.product_id JOIN categories k ON k.id = p.category_id
                                             WHERE o.placed_at >= @from AND o.status <> 'Cancelled' GROUP BY k.name, k.color ORDER BY qty DESC", new { from });
            var bySchool = await c.QueryAsync(@"SELECT coalesce(s.school, '—') AS school, -sum(l.points)::int AS points FROM wallet_ledger l JOIN students s ON s.student_id = l.student_id
                                                WHERE l.kind = 'redeem' AND l.at >= @from GROUP BY 1 ORDER BY points DESC LIMIT 8", new { from });
            var vendors = await c.QueryAsync(@"SELECT v.business_name AS name, count(o.id)::int AS orders, count(o.id) FILTER (WHERE o.status = 'Delivered')::int AS delivered,
                                                      round(avg(extract(epoch FROM (o.delivered_at - o.placed_at)) / 86400) FILTER (WHERE o.status = 'Delivered')::numeric, 1) AS avg_days
                                               FROM vendors v LEFT JOIN orders o ON o.vendor_id = v.id AND o.placed_at >= @from AND o.status <> 'Cancelled'
                                               WHERE v.status IN ('Active', 'Suspended') GROUP BY v.business_name ORDER BY orders DESC", new { from });
            return Ok(new { success = true, months = series, kpi = k, top, byCategory = byCat, bySchool, vendors, from });
        }

        /// <summary>All orders of the period as a CSV file (opens in Excel).</summary>
        [HttpGet("reports/orders.csv")]
        public async Task<IActionResult> OrdersCsv(int months = 6)
        {
            months = Math.Clamp(months, 1, 24);
            await using var c = await _db.OpenAsync();
            var rows = await c.QueryAsync<OrderService.OrderRow>(OrderService.ListSql + " WHERE o.placed_at >= date_trunc('month', now()) - (@back || ' months')::interval ORDER BY o.placed_at",
                new { back = (months - 1).ToString() });
            static string Q(object? v) { string s = Convert.ToString(v, CultureInfo.InvariantCulture) ?? ""; if (s.Length > 0 && "=+-@".Contains(s[0])) s = "'" + s; return "\"" + s.Replace("\"", "\"\"") + "\""; }
            var sb = new StringBuilder("﻿Order,Placed,Student,Class,School,Items,Amount (Rs),Status,Vendor,PIN,Delivered,Invoice\r\n");
            foreach (var o in rows)
                sb.Append(string.Join(",", Q(o.OrderNo), Q(o.PlacedAt.ToString("dd-MM-yyyy HH:mm")), Q(o.StudentName), Q(o.StudentClass), Q(o.School), Q(o.Items),
                    Q(o.Amount), Q(o.Status), Q(o.VendorName), Q(o.Pincode), Q(o.DeliveredAt?.ToString("dd-MM-yyyy")), Q(o.InvoiceNo))).Append("\r\n");
            return File(Encoding.UTF8.GetBytes(sb.ToString()), "text/csv", $"HEM-Store-orders-{DateTime.Now:yyyyMMdd}.csv");
        }

        // ------------------------------------------------------------------ admins
        [HttpGet("admins")]
        public async Task<IActionResult> Admins()
        {
            await using var c = await _db.OpenAsync();
            var list = await c.QueryAsync("SELECT id, name, email, is_active, created_at, last_login_at FROM admins ORDER BY name");
            return Ok(new { success = true, admins = list, meId = Me.Id(User) });
        }

        public class AdminDto { public string? Name { get; set; } public string? Email { get; set; } public string? Password { get; set; } }

        [HttpPost("admins")]
        public async Task<IActionResult> AddAdmin([FromBody] AdminDto m)
        {
            string name = (m?.Name ?? "").Trim();
            if (name.Length < 2 || name.Length > 100) throw new StoreException("Please enter the name.");
            string email = AuthController.CleanEmail(m?.Email);
            AuthController.CheckPassword(m?.Password ?? "");
            await using var c = await _db.OpenAsync();
            if (await c.ExecuteScalarAsync<bool>("SELECT EXISTS (SELECT 1 FROM admins WHERE lower(email) = lower(@email))", new { email }))
                throw new StoreException("An admin with this email already exists.", 409);
            await c.ExecuteAsync("INSERT INTO admins (name, email, password_hash) VALUES (@name, @email, @hash)", new { name, email, hash = AuthController.Hash(m!.Password!) });
            return Ok(new { success = true, message = $"Admin account created for {name}." });
        }

        public class PasswordDto { public string? Current { get; set; } public string? New { get; set; } }

        [HttpPost("admins/me/password")]
        public async Task<IActionResult> ChangePassword([FromBody] PasswordDto m)
        {
            await using var c = await _db.OpenAsync();
            string hash = await c.ExecuteScalarAsync<string>("SELECT password_hash FROM admins WHERE id = @id", new { id = Me.Id(User) }) ?? "";
            if (!AuthController.Verify(hash, m?.Current ?? "")) throw new StoreException("The current password is not right.");
            AuthController.CheckPassword(m?.New ?? "");
            await c.ExecuteAsync("UPDATE admins SET password_hash = @hash WHERE id = @id", new { hash = AuthController.Hash(m!.New!), id = Me.Id(User) });
            return Ok(new { success = true, message = "Password changed." });
        }

        [HttpPost("admins/{id:int}/active")]
        public async Task<IActionResult> ToggleAdmin(int id, [FromBody] SettingsActiveDto m)
        {
            if (id == Me.Id(User)) throw new StoreException("You cannot switch off your own account.");
            await using var c = await _db.OpenAsync();
            if (m?.Active != true && await c.ExecuteScalarAsync<int>("SELECT count(*) FROM admins WHERE is_active AND id <> @id", new { id }) == 0)
                throw new StoreException("There must be at least one active admin.");
            await c.ExecuteAsync("UPDATE admins SET is_active = @a WHERE id = @id", new { id, a = m?.Active == true });
            return Ok(new { success = true, message = m?.Active == true ? "Admin can log in again." : "Admin can no longer log in." });
        }

        public class SettingsActiveDto { public bool Active { get; set; } }
    }
}
