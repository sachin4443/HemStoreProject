using System.Globalization;
using System.Text.RegularExpressions;
using Dapper;
using HemStore.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace HemStore.Controllers
{
    /// <summary>A shop that sells and delivers for HEM Store.</summary>
    [ApiController]
    [Route("api/vendor")]
    [Authorize(Policy = Roles.Vendor)]
    public class VendorController : ControllerBase
    {
        public static readonly string[] DocTypes = { "GST certificate", "PAN card", "Cancelled cheque", "Shop photo" };

        private readonly Db _db;
        private readonly OrderService _orders;
        private readonly FileStore _files;
        private readonly SettingsService _settings;

        public VendorController(Db db, OrderService orders, FileStore files, SettingsService settings)
        {
            _db = db;
            _orders = orders;
            _files = files;
            _settings = settings;
        }

        private int VendorId => Me.Id(User);

        private static string Need(string? v, string label, int min = 2, int max = 150)
        {
            v = (v ?? "").Trim();
            if (v.Length < min || v.Length > max) throw new StoreException($"Please enter the {label}.");
            return v;
        }

        // ------------------------------------------------------------------ registration (no login yet)
        public class RegisterForm
        {
            public string? BusinessName { get; set; }
            public string? OwnerName { get; set; }
            public string? Email { get; set; }
            public string? Phone { get; set; }
            public string? Password { get; set; }
            public string? Gstin { get; set; }
            public string? Pan { get; set; }
            public string? Address { get; set; }
            public string? City { get; set; }
            public int PinFrom { get; set; }
            public int PinTo { get; set; }
            public string? DeliveryDays { get; set; }
            public string? Categories { get; set; }
            public string? BankName { get; set; }
            public string? BankAccount { get; set; }
            public string? BankIfsc { get; set; }
            public bool Agree { get; set; }
            public IFormFile? GstFile { get; set; }
            public IFormFile? PanFile { get; set; }
            public IFormFile? ChequeFile { get; set; }
            public IFormFile? ShopPhoto { get; set; }
        }

        [HttpPost("register")]
        [AllowAnonymous]
        [EnableRateLimiting("login")]
        [RequestSizeLimit(25 * 1024 * 1024)]
        public async Task<IActionResult> Register([FromForm] RegisterForm f)
        {
            string business = Need(f.BusinessName, "shop / business name");
            string owner = Need(f.OwnerName, "owner's name", 2, 100);
            string email = AuthController.CleanEmail(f.Email);
            string phone = Regex.Replace(f.Phone ?? "", @"\D", "");
            if (phone.Length != 10) throw new StoreException("Please enter a 10-digit mobile number.");
            AuthController.CheckPassword(f.Password ?? "");
            string gstin = (f.Gstin ?? "").Trim().ToUpperInvariant();
            if (!Regex.IsMatch(gstin, @"^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")) throw new StoreException("Please enter a valid 15-character GSTIN.");
            string pan = (f.Pan ?? "").Trim().ToUpperInvariant();
            if (!Regex.IsMatch(pan, @"^[A-Z]{5}\d{4}[A-Z]$")) throw new StoreException("Please enter a valid 10-character PAN.");
            string address = Need(f.Address, "shop address", 5, 300);
            string city = Need(f.City, "city", 2, 80);
            if (f.PinFrom < 100000 || f.PinFrom > 999999 || f.PinTo < 100000 || f.PinTo > 999999) throw new StoreException("Please enter 6-digit PIN codes for your delivery area.");
            if (f.PinFrom > f.PinTo) throw new StoreException("The first PIN code must not be bigger than the last one.");
            string days = f.DeliveryDays is "1-2 days" or "3-5 days" or "5-7 days" ? f.DeliveryDays : "3-5 days";
            string cats = Need(f.Categories, "things you will sell", 3, 300);
            string bankName = Need(f.BankName, "bank account name");
            string account = Regex.Replace(f.BankAccount ?? "", @"\s", "");
            if (!Regex.IsMatch(account, @"^\d{9,18}$")) throw new StoreException("Please enter a valid bank account number.");
            string ifsc = (f.BankIfsc ?? "").Trim().ToUpperInvariant();
            if (!Regex.IsMatch(ifsc, @"^[A-Z]{4}0[A-Z0-9]{6}$")) throw new StoreException("Please enter a valid IFSC code.");
            if (!f.Agree) throw new StoreException("Please accept the vendor terms.");

            await using var c = await _db.OpenAsync();
            if (await c.ExecuteScalarAsync<bool>("SELECT EXISTS (SELECT 1 FROM vendors WHERE lower(email) = lower(@email))", new { email }))
                throw new StoreException("A shop is already registered with this email. Please log in.", 409);

            // Save the documents first, so a bad file stops the whole application.
            var docs = new List<(string Type, string File, string? Original)>();
            var given = new[] { f.GstFile, f.PanFile, f.ChequeFile, f.ShopPhoto };
            for (int i = 0; i < DocTypes.Length; i++)
                docs.Add((DocTypes[i], await _files.SaveAsync(given[i], "vendor-docs", i == 3 ? FileStore.Kind.Image : FileStore.Kind.ImageOrPdf, DocTypes[i].ToLowerInvariant()), given[i]?.FileName));

            await using var tx = await c.BeginTransactionAsync();
            int id = await c.ExecuteScalarAsync<int>(@"
                INSERT INTO vendors (business_name, owner_name, email, phone, password_hash, gstin, pan, address, city, pin_from, pin_to,
                                     delivery_days, categories, bank_name, bank_account, bank_ifsc)
                VALUES (@business, @owner, @email, @phone, @hash, @gstin, @pan, @address, @city, @PinFrom, @PinTo, @days, @cats, @bankName, @account, @ifsc)
                RETURNING id", new { business, owner, email, phone, hash = AuthController.Hash(f.Password!), gstin, pan, address, city, f.PinFrom, f.PinTo, days, cats, bankName, account, ifsc }, tx);
            foreach (var d in docs)
                await c.ExecuteAsync("INSERT INTO vendor_documents (vendor_id, doc_type, file_name, original) VALUES (@id, @Type, @File, @Original)", new { id, d.Type, d.File, d.Original }, tx);
            await tx.CommitAsync();
            return Ok(new { success = true, message = "Application sent. HEM will check it within 2 working days. You can log in after approval." });
        }

        // ------------------------------------------------------------------ dashboard
        [HttpGet("dashboard")]
        public async Task<IActionResult> Dashboard()
        {
            await using var c = await _db.OpenAsync();
            var me = await c.QuerySingleAsync("SELECT id, business_name, owner_name, city, pin_from, pin_to, delivery_days, bank_name, right(bank_account, 4) AS account_last4, bank_ifsc FROM vendors WHERE id = @id", new { id = VendorId });
            var k = await c.QuerySingleAsync(@"
                SELECT count(*) FILTER (WHERE status = 'Assigned')::int AS new_orders,
                       count(*) FILTER (WHERE status IN ('Accepted', 'Packed', 'Shipped', 'Out for delivery'))::int AS to_deliver,
                       count(*) FILTER (WHERE status = 'Delivered' AND delivered_at >= date_trunc('month', now()))::int AS delivered_month,
                       count(*) FILTER (WHERE status = 'Delivered')::int AS delivered_all,
                       count(*) FILTER (WHERE status = 'Delivered' AND invoice_id IS NULL)::int AS to_invoice
                FROM orders WHERE vendor_id = @id", new { id = VendorId });
            decimal due = await c.ExecuteScalarAsync<decimal>("SELECT coalesce(sum(amount), 0) FROM invoices WHERE vendor_id = @id AND status IN ('Submitted', 'Approved')", new { id = VendorId });
            var week = await c.QueryAsync(@"SELECT to_char(d, 'Dy') AS day, (SELECT count(*) FROM orders o WHERE o.vendor_id = @id AND o.placed_at::date = d::date)::int AS orders
                                            FROM generate_series(current_date - 6, current_date, interval '1 day') d ORDER BY d", new { id = VendorId });
            var recent = await c.QueryAsync<OrderService.OrderRow>(OrderService.ListSql + " WHERE o.vendor_id = @id ORDER BY o.updated_at DESC LIMIT 8", new { id = VendorId });
            return Ok(new { success = true, me, kpi = k, paymentDue = due, week, recent = recent.Select(VendorView) });
        }

        // ------------------------------------------------------------------ products
        [HttpGet("products")]
        public async Task<IActionResult> Products()
        {
            var settings = await _settings.GetAsync();
            await using var c = await _db.OpenAsync();
            var list = await c.QueryAsync(@"SELECT p.id, p.category_id, k.name AS category, p.name, p.name_hi, p.about, p.highlights, p.age_group, p.mrp, p.price, p.stock, p.hsn,
                                                   p.art, p.image_file, p.status, p.review_note, p.updated_at,
                                                   (SELECT coalesce(sum(oi.qty), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id
                                                    WHERE oi.product_id = p.id AND o.status <> 'Cancelled')::int AS sold
                                            FROM products p JOIN categories k ON k.id = p.category_id
                                            WHERE p.vendor_id = @id ORDER BY p.updated_at DESC", new { id = VendorId });
            var cats = await c.QueryAsync("SELECT id, name, art FROM categories WHERE is_active ORDER BY sort_order");
            return Ok(new { success = true, products = list, categories = cats, pointValue = settings.PointValue });
        }

        public class ProductForm
        {
            public int CategoryId { get; set; }
            public string? Name { get; set; }
            public string? NameHi { get; set; }
            public string? About { get; set; }
            public string? Highlights { get; set; }
            public string? AgeGroup { get; set; }
            public decimal? Mrp { get; set; }
            public decimal Price { get; set; }
            public int Stock { get; set; }
            public string? Hsn { get; set; }
            public string? Art { get; set; }
            public IFormFile? Image { get; set; }
        }

        /// <summary>Shared by vendors and admins. Returns the cleaned values.</summary>
        public static async Task<(int Cat, string Name, string? Hi, string? About, string? High, string Age, decimal? Mrp, decimal Price, int Stock, string? Hsn, string Art)>
            CheckProductAsync(Npgsql.NpgsqlConnection c, ProductForm f)
        {
            if (!await c.ExecuteScalarAsync<bool>("SELECT EXISTS (SELECT 1 FROM categories WHERE id = @CategoryId)", new { f.CategoryId }))
                throw new StoreException("Please choose a category.");
            string name = Need(f.Name, "product name", 3, 150);
            string? hi = string.IsNullOrWhiteSpace(f.NameHi) ? null : f.NameHi.Trim();
            string? about = string.IsNullOrWhiteSpace(f.About) ? null : f.About.Trim();
            if (about?.Length > 1000) throw new StoreException("The description must be 1000 characters or fewer.");
            string? high = string.IsNullOrWhiteSpace(f.Highlights) ? null
                : string.Join("\n", f.Highlights.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Take(6));
            string age = string.IsNullOrWhiteSpace(f.AgeGroup) ? "All" : f.AgeGroup.Trim();
            if (age.Length > 20) throw new StoreException("The age group is too long.");
            if (f.Price <= 0 || f.Price > 100000) throw new StoreException("Please enter the HEM price in ₹.");
            if (f.Mrp != null && f.Mrp < f.Price) throw new StoreException("The HEM price must not be more than the MRP.");
            if (f.Stock < 0 || f.Stock > 100000) throw new StoreException("Please enter the stock (0 or more).");
            string? hsn = string.IsNullOrWhiteSpace(f.Hsn) ? null : f.Hsn.Trim();
            string art = Regex.IsMatch(f.Art ?? "", @"^[a-z]{2,20}$") ? f.Art! : "badge";
            return (f.CategoryId, name, hi, about, high, age, f.Mrp, Math.Round(f.Price, 2), f.Stock, hsn, art);
        }

        /// <summary>New products and changes to name, price or details wait for HEM approval; a stock change alone goes live at once.</summary>
        [HttpPost("products")]
        [HttpPost("products/{id:int}")]
        public async Task<IActionResult> SaveProduct(int? id, [FromForm] ProductForm f)
        {
            await using var c = await _db.OpenAsync();
            var v = await CheckProductAsync(c, f);
            string? image = f.Image != null && f.Image.Length > 0 ? await _files.SaveAsync(f.Image, "products", FileStore.Kind.Image, "product photo") : null;

            if (id is > 0)
            {
                var old = await c.QueryFirstOrDefaultAsync("SELECT category_id, name, name_hi, about, highlights, age_group, mrp, price, hsn, art, status FROM products WHERE id = @id AND vendor_id = @vid", new { id, vid = VendorId });
                if (old == null) throw new StoreException("Product not found.", 404);
                bool onlyStock = image == null && old.category_id == v.Cat && old.name == v.Name && old.name_hi == v.Hi && old.about == v.About
                                 && old.highlights == v.High && old.age_group == v.Age && old.mrp == v.Mrp && old.price == v.Price && old.hsn == v.Hsn && old.art == v.Art;
                string status = onlyStock || old.status == "Hidden" ? (string)old.status : "Pending";
                await c.ExecuteAsync(@"UPDATE products SET category_id = @Cat, name = @Name, name_hi = @Hi, about = @About, highlights = @High, age_group = @Age,
                                       mrp = @Mrp, price = @Price, stock = @Stock, hsn = @Hsn, art = @Art, image_file = coalesce(@image, image_file),
                                       status = @status, updated_at = now() WHERE id = @id AND vendor_id = @vid",
                    new { v.Cat, v.Name, v.Hi, v.About, v.High, v.Age, v.Mrp, v.Price, v.Stock, v.Hsn, v.Art, image, status, id, vid = VendorId });
                return Ok(new { success = true, id, message = status == "Pending" ? "Saved. Sent to HEM for approval." : "Stock updated." });
            }

            int newId = await c.ExecuteScalarAsync<int>(@"INSERT INTO products (vendor_id, category_id, name, name_hi, about, highlights, age_group, mrp, price, stock, hsn, art, image_file, status)
                                                         VALUES (@vid, @Cat, @Name, @Hi, @About, @High, @Age, @Mrp, @Price, @Stock, @Hsn, @Art, @image, 'Pending') RETURNING id",
                new { vid = VendorId, v.Cat, v.Name, v.Hi, v.About, v.High, v.Age, v.Mrp, v.Price, v.Stock, v.Hsn, v.Art, image });
            return Ok(new { success = true, id = newId, message = "Saved. Sent to HEM for approval." });
        }

        // ------------------------------------------------------------------ orders
        /// <summary>Vendors see the delivery details they need, never the student's wallet.</summary>
        private static object VendorView(OrderService.OrderRow o) => new
        {
            o.Id, o.OrderNo, o.Status, o.Amount, o.PlacedAt, o.DeliveredAt, o.Items, o.ItemCount, o.FirstArt,
            firstImageUrl = StoreController.ImageUrl(o.FirstImage),
            o.StudentName, o.StudentClass, o.School, o.ReceiverName, o.Mobile, o.Address, o.City, o.State, o.Pincode, o.DeliveryNote,
            o.ReceivedBy, o.HasProof, o.InvoiceId, o.InvoiceNo, o.InvoiceStatus
        };

        [HttpGet("orders")]
        public async Task<IActionResult> Orders()
        {
            await using var c = await _db.OpenAsync();
            var rows = await c.QueryAsync<OrderService.OrderRow>(OrderService.ListSql + " WHERE o.vendor_id = @id ORDER BY o.updated_at DESC", new { id = VendorId });
            return Ok(new { success = true, orders = rows.Select(VendorView) });
        }

        private async Task<OrderService.OrderDetail> MineAsync(Npgsql.NpgsqlConnection c, int id)
        {
            var d = await _orders.DetailAsync(c, id);
            if (d == null || d.Order.VendorId != VendorId) throw new StoreException("Order not found.", 404);
            return d;
        }

        [HttpGet("orders/{id:int}")]
        public async Task<IActionResult> Order(int id)
        {
            await using var c = await _db.OpenAsync();
            var d = await MineAsync(c, id);
            return Ok(new
            {
                success = true,
                order = VendorView(d.Order),
                items = d.Items.Select(i => new { i.ProductId, i.Name, i.Art, imageUrl = StoreController.ImageUrl(i.ImageFile), i.Qty, i.Price, i.Total }),
                events = d.Events
            });
        }

        public class StatusDto { public string? Status { get; set; } public string? Note { get; set; } }

        /// <summary>Accept, or move to Packed / Shipped / Out for delivery. "Delivered" needs the proof call.</summary>
        [HttpPost("orders/{id:int}/status")]
        public async Task<IActionResult> Status(int id, [FromBody] StatusDto m)
        {
            string to = m?.Status ?? "";
            string? note = string.IsNullOrWhiteSpace(m?.Note) ? null : m!.Note!.Trim();
            if (note?.Length > 200) note = note[..200];
            await using var c = await _db.OpenAsync();
            var d = await MineAsync(c, id);
            int from = OrderService.Step(d.Order.Status), next = OrderService.Step(to);
            if (to == "Delivered") throw new StoreException("Upload the delivery photo and the student's code to mark it delivered.");
            if (next != from + 1 || from < OrderService.Step("Assigned")) throw new StoreException($"This order is “{d.Order.Status}”. It cannot be marked “{to}” now.");
            await using var tx = await c.BeginTransactionAsync();
            await _orders.MoveAsync(c, tx, id, d.Order.Status, to, note, Roles.Vendor, Me.Name(User));
            await tx.CommitAsync();
            return Ok(new { success = true, message = to == "Accepted" ? "Order accepted." : $"Status updated: {to}." });
        }

        /// <summary>The shop cannot fulfil it: the order goes back to HEM to give to another shop.</summary>
        [HttpPost("orders/{id:int}/reject")]
        public async Task<IActionResult> Reject(int id, [FromBody] StatusDto m)
        {
            string reason = (m?.Note ?? "").Trim();
            if (reason.Length < 3) throw new StoreException("Please write why you cannot fulfil this order.");
            await using var c = await _db.OpenAsync();
            var d = await MineAsync(c, id);
            if (d.Order.Status != "Assigned") throw new StoreException("Only a new order can be returned. Please call HEM for this order.");
            await using var tx = await c.BeginTransactionAsync();
            await _orders.MoveAsync(c, tx, id, "Assigned", "Verified", "Returned by " + Me.Name(User) + ": " + (reason.Length > 200 ? reason[..200] : reason), Roles.Vendor, Me.Name(User));
            await tx.CommitAsync();
            return Ok(new { success = true, message = "The order is back with HEM. They will give it to another shop." });
        }

        public class ProofForm { public string? Code { get; set; } public string? ReceivedBy { get; set; } public string? Relation { get; set; } public IFormFile? Photo { get; set; } }

        [HttpPost("orders/{id:int}/proof")]
        [RequestSizeLimit(8 * 1024 * 1024)]
        public async Task<IActionResult> Proof(int id, [FromForm] ProofForm f)
        {
            await using var c = await _db.OpenAsync();
            var d = await MineAsync(c, id);
            if (d.Order.Status != "Out for delivery") throw new StoreException("Mark the order “Out for delivery” first.");
            string name = Need(f.ReceivedBy, "receiver's name", 2, 100);
            string relation = f.Relation is "Father" or "Mother" or "Student" or "Guardian" ? f.Relation : "Guardian";
            if ((f.Code ?? "").Trim() != d.Order.DeliveryCode) throw new StoreException("The code does not match. Ask the student or parent for the 4-digit code.");
            string photo = await _files.SaveAsync(f.Photo, "proofs", FileStore.Kind.Image, "delivery photo");

            await using var tx = await c.BeginTransactionAsync();
            string receivedBy = $"{name} ({relation})";
            await c.ExecuteAsync("UPDATE orders SET proof_file = @photo, received_by = @receivedBy WHERE id = @id", new { photo, receivedBy, id }, tx);
            await _orders.MoveAsync(c, tx, id, "Out for delivery", "Delivered", $"Received by {receivedBy} · code matched · photo uploaded", Roles.Vendor, Me.Name(User));
            await tx.CommitAsync();
            return Ok(new { success = true, message = "Delivered! Proof saved." });
        }

        [HttpGet("orders/{id:int}/proof")]
        public async Task<IActionResult> ProofPhoto(int id)
        {
            await using var c = await _db.OpenAsync();
            string? file = await c.ExecuteScalarAsync<string?>("SELECT proof_file FROM orders WHERE id = @id AND vendor_id = @vid", new { id, vid = VendorId });
            var path = _files.PathOf("proofs", file);
            return path == null ? NotFound() : PhysicalFile(path, FileStore.ContentType(path));
        }

        // ------------------------------------------------------------------ invoices and payments
        [HttpGet("invoices")]
        public async Task<IActionResult> Invoices()
        {
            await using var c = await _db.OpenAsync();
            var ready = await c.QueryAsync<OrderService.OrderRow>(OrderService.ListSql + " WHERE o.vendor_id = @id AND o.status = 'Delivered' AND o.invoice_id IS NULL ORDER BY o.delivered_at", new { id = VendorId });
            var invoices = await c.QueryAsync(@"SELECT i.id, i.invoice_no, i.invoice_date, i.amount, i.status, i.review_note, i.submitted_at, i.approved_at, i.pay_mode, i.utr, i.paid_at,
                                                       (SELECT string_agg(o.order_no, ', ' ORDER BY o.id) FROM orders o WHERE o.invoice_id = i.id) AS orders
                                                FROM invoices i WHERE i.vendor_id = @id ORDER BY i.submitted_at DESC", new { id = VendorId });
            var bank = await c.QuerySingleAsync("SELECT bank_name, right(bank_account, 4) AS account_last4, bank_ifsc FROM vendors WHERE id = @id", new { id = VendorId });
            return Ok(new { success = true, ready = ready.Select(VendorView), invoices, bank });
        }

        public class InvoiceForm { public string? InvoiceNo { get; set; } public string? InvoiceDate { get; set; } public string? OrderIds { get; set; } public IFormFile? File { get; set; } }

        /// <summary>Bills HEM for delivered orders. The amount is the total of the chosen orders.</summary>
        [HttpPost("invoices")]
        [RequestSizeLimit(8 * 1024 * 1024)]
        public async Task<IActionResult> SubmitInvoice([FromForm] InvoiceForm f)
        {
            string no = Need(f.InvoiceNo, "invoice number", 1, 50);
            if (!DateTime.TryParseExact(f.InvoiceDate ?? "", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) || date > DateTime.Today.AddDays(1) || date < DateTime.Today.AddYears(-1))
                throw new StoreException("Please choose the invoice date.");
            var ids = (f.OrderIds ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries).Select(x => int.TryParse(x, out var v) ? v : 0).Where(x => x > 0).Distinct().ToArray();
            if (ids.Length == 0) throw new StoreException("Choose at least one delivered order.");
            string file = await _files.SaveAsync(f.File, "invoices", FileStore.Kind.Pdf, "invoice PDF");

            await using var c = await _db.OpenAsync();
            await using var tx = await c.BeginTransactionAsync();
            var ok = (await c.QueryAsync<(int Id, decimal Amount)>(@"SELECT id, amount FROM orders WHERE id = ANY(@ids) AND vendor_id = @vid AND status = 'Delivered' AND invoice_id IS NULL FOR UPDATE",
                new { ids, vid = VendorId }, tx)).ToList();
            if (ok.Count != ids.Length) throw new StoreException("Some orders are not delivered or are already invoiced. Please reload the page.", 409);
            if (await c.ExecuteScalarAsync<bool>("SELECT EXISTS (SELECT 1 FROM invoices WHERE vendor_id = @vid AND lower(invoice_no) = lower(@no))", new { vid = VendorId, no }, tx))
                throw new StoreException("You have already sent an invoice with this number.", 409);
            decimal amount = ok.Sum(x => x.Amount);
            int invoiceId = await c.ExecuteScalarAsync<int>(@"INSERT INTO invoices (vendor_id, invoice_no, invoice_date, amount, file_name) VALUES (@vid, @no, @date, @amount, @file) RETURNING id",
                new { vid = VendorId, no, date, amount, file }, tx);
            await c.ExecuteAsync("UPDATE orders SET invoice_id = @invoiceId WHERE id = ANY(@ids)", new { invoiceId, ids }, tx);
            await tx.CommitAsync();
            return Ok(new { success = true, message = $"Invoice {no} for {Fmt.Rs(amount)} sent to HEM." });
        }

        [HttpGet("invoices/{id:int}/file")]
        public async Task<IActionResult> InvoiceFile(int id)
        {
            await using var c = await _db.OpenAsync();
            string? file = await c.ExecuteScalarAsync<string?>("SELECT file_name FROM invoices WHERE id = @id AND vendor_id = @vid", new { id, vid = VendorId });
            var path = _files.PathOf("invoices", file);
            return path == null ? NotFound() : PhysicalFile(path, "application/pdf");
        }
    }
}
