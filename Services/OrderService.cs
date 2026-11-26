using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Dapper;
using Npgsql;

namespace HemStore.Services
{
    /// <summary>
    /// Orders from cart to doorstep:
    ///   Placed (student) → Verified (admin) → Assigned to a vendor (admin) → Accepted → Packed → Shipped
    ///   → Out for delivery → Delivered (vendor, with the student's 4-digit code and a photo).
    /// Cancelling gives the shopping money back and puts the stock back.
    /// </summary>
    public class OrderService
    {
        public static readonly string[] Flow = { "Placed", "Verified", "Assigned", "Accepted", "Packed", "Shipped", "Out for delivery", "Delivered" };
        public static int Step(string status) => Array.IndexOf(Flow, status);

        private readonly Db _db;
        private readonly SettingsService _settings;
        private readonly HemVirtuesClient _hv;

        public OrderService(Db db, SettingsService settings, HemVirtuesClient hv)
        {
            _db = db;
            _settings = settings;
            _hv = hv;
        }

        // ------------------------------------------------------------------ models
        public class OrderRow
        {
            public int Id { get; set; }
            public string OrderNo { get; set; } = "";
            public int StudentId { get; set; }
            public string StudentName { get; set; } = "";
            public string? StudentClass { get; set; }
            public string? School { get; set; }
            public string ReceiverName { get; set; } = "";
            public string Mobile { get; set; } = "";
            public string Address { get; set; } = "";
            public string City { get; set; } = "";
            public string State { get; set; } = "";
            public string Pincode { get; set; } = "";
            public string? DeliveryNote { get; set; }
            public decimal Amount { get; set; }
            public string Status { get; set; } = "";
            public int? VendorId { get; set; }
            public string? VendorName { get; set; }
            public string? VendorCity { get; set; }
            public string? DeliveryCode { get; set; }
            public string? ReceivedBy { get; set; }
            public bool HasProof { get; set; }
            public string? StudentRating { get; set; }
            public DateTime? StudentReceivedAt { get; set; }
            public string? CancelReason { get; set; }
            public int? InvoiceId { get; set; }
            public string? InvoiceNo { get; set; }
            public string? InvoiceStatus { get; set; }
            public DateTime PlacedAt { get; set; }
            public DateTime? DeliveredAt { get; set; }
            public string? Items { get; set; }          // short text for lists
            public int ItemCount { get; set; }
            public string? FirstArt { get; set; }
            public string? FirstImage { get; set; }
        }

        public class OrderItem
        {
            public int ProductId { get; set; }
            public string Name { get; set; } = "";
            public string? Art { get; set; }
            public string? ImageFile { get; set; }
            public int Qty { get; set; }
            public decimal Price { get; set; }
            public decimal Total => Price * Qty;
        }

        public class OrderEvent
        {
            public string Status { get; set; } = "";
            public string? Note { get; set; }
            public string ByRole { get; set; } = "";
            public string? ByName { get; set; }
            public DateTime At { get; set; }
        }

        public class OrderDetail
        {
            public OrderRow Order { get; set; } = new();
            public List<OrderItem> Items { get; set; } = new();
            public List<OrderEvent> Events { get; set; } = new();
        }

        public const string ListSql = @"
            SELECT o.id, o.order_no, o.student_id, o.student_name, o.student_class, o.school, o.receiver_name, o.mobile, o.address,
                   o.city, o.state, o.pincode, o.delivery_note, o.amount, o.status, o.vendor_id, v.business_name AS vendor_name,
                   v.city AS vendor_city, o.delivery_code, o.received_by, (o.proof_file IS NOT NULL) AS has_proof, o.student_rating,
                   o.student_received_at, o.cancel_reason, o.invoice_id, i.invoice_no, i.status AS invoice_status,
                   o.placed_at, o.delivered_at,
                   (SELECT string_agg(oi.name || CASE WHEN oi.qty > 1 THEN ' ×' || oi.qty ELSE '' END, ', ' ORDER BY oi.id) FROM order_items oi WHERE oi.order_id = o.id) AS items,
                   (SELECT sum(oi.qty)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
                   (SELECT oi.art FROM order_items oi WHERE oi.order_id = o.id ORDER BY oi.id LIMIT 1) AS first_art,
                   (SELECT oi.image_file FROM order_items oi WHERE oi.order_id = o.id ORDER BY oi.id LIMIT 1) AS first_image
            FROM orders o
            LEFT JOIN vendors v ON v.id = o.vendor_id
            LEFT JOIN invoices i ON i.id = o.invoice_id";

        public async Task<OrderDetail?> DetailAsync(NpgsqlConnection c, int orderId)
        {
            var o = await c.QueryFirstOrDefaultAsync<OrderRow>(ListSql + " WHERE o.id = @orderId", new { orderId });
            if (o == null) return null;
            return new OrderDetail
            {
                Order = o,
                Items = (await c.QueryAsync<OrderItem>("SELECT product_id, name, art, image_file, qty, price FROM order_items WHERE order_id = @orderId ORDER BY id", new { orderId })).ToList(),
                Events = (await c.QueryAsync<OrderEvent>("SELECT status, note, by_role, by_name, at FROM order_events WHERE order_id = @orderId ORDER BY at, id", new { orderId })).ToList()
            };
        }

        public static Task AddEventAsync(NpgsqlConnection c, NpgsqlTransaction tx, int orderId, string status, string? note, string byRole, string? byName) =>
            c.ExecuteAsync("INSERT INTO order_events (order_id, status, note, by_role, by_name) VALUES (@orderId, @status, @note, @byRole, @byName)",
                new { orderId, status, note, byRole, byName }, tx);

        // ------------------------------------------------------------------ place
        public class AddressDto
        {
            public string? ReceiverName { get; set; }
            public string? Mobile { get; set; }
            public string? Address { get; set; }
            public string? City { get; set; }
            public string? State { get; set; }
            public string? Pincode { get; set; }
            public string? Note { get; set; }
            public bool ParentChecked { get; set; }
        }

        private static string Need(string? v, string label, int min, int max)
        {
            v = (v ?? "").Trim();
            if (v.Length < min || v.Length > max) throw new StoreException($"Please enter the {label}.");
            return v;
        }

        public async Task<int> PlaceAsync(int studentId, string studentName, AddressDto a)
        {
            var settings = await _settings.GetAsync();
            if (!settings.StoreOpen) throw new StoreException("The store is closed right now. Please try again later.");

            string receiver = Need(a.ReceiverName, "receiver's name", 2, 100);
            string mobile = Regex.Replace(a.Mobile ?? "", @"\D", "");
            if (mobile.Length == 12 && mobile.StartsWith("91")) mobile = mobile[2..];
            if (mobile.Length != 10) throw new StoreException("Please enter a 10-digit mobile number.");
            string address = Need(a.Address, "house, street and area", 5, 300);
            string city = Need(a.City, "city", 2, 80);
            string state = Need(a.State, "state", 2, 80);
            string pin = (a.Pincode ?? "").Trim();
            if (!Regex.IsMatch(pin, @"^[1-9]\d{5}$")) throw new StoreException("Please enter a 6-digit PIN code.");
            string? note = string.IsNullOrWhiteSpace(a.Note) ? null : a.Note.Trim();
            if (note?.Length > 200) throw new StoreException("The delivery note must be 200 characters or fewer.");
            if (!a.ParentChecked) throw new StoreException("Please ask your parent to check the address, then tick the box.");

            // Latest class and school for the order (falls back to the saved copy).
            HemVirtuesClient.Student? hv = null;
            try { hv = await _hv.StudentAsync(studentId); } catch (StoreException) { }

            await using var c = await _db.OpenAsync();
            await using var tx = await c.BeginTransactionAsync();
            await c.ExecuteAsync("SELECT pg_advisory_xact_lock(7101, @studentId)", new { studentId }, tx);

            var cart = (await c.QueryAsync<(int ProductId, int Qty, string Name, string Art, string? ImageFile, decimal Price, int Stock, string Status)>(@"
                SELECT ci.product_id, ci.qty, p.name, p.art, p.image_file, p.price, p.stock, p.status
                FROM cart_items ci JOIN products p ON p.id = ci.product_id
                WHERE ci.student_id = @studentId ORDER BY ci.added_at FOR UPDATE OF p", new { studentId }, tx)).ToList();
            if (cart.Count == 0) throw new StoreException("Your cart is empty.");
            foreach (var x in cart)
            {
                if (x.Status != "Live") throw new StoreException($"“{x.Name}” is not available any more. Please remove it from your cart.");
                if (x.Stock < x.Qty) throw new StoreException(x.Stock == 0 ? $"“{x.Name}” is out of stock. Please remove it from your cart." : $"Only {x.Stock} of “{x.Name}” left. Please change the quantity.");
            }

            decimal amount = cart.Sum(x => x.Price * x.Qty);
            decimal money = await c.ExecuteScalarAsync<decimal>("SELECT coalesce(sum(money), 0) FROM wallet_ledger WHERE student_id = @studentId", new { studentId }, tx);
            if (amount > money) throw new StoreException($"You need {Fmt.Rs(amount - money)} more shopping money for this order.");

            var saved = await c.QueryFirstOrDefaultAsync<(string? Standard, string? Division, string? School)>(
                "SELECT standard, division, school FROM students WHERE student_id = @studentId", new { studentId }, tx);
            string? cls = hv?.ClassLabel ?? string.Join(" – ", new[] { saved.Standard, saved.Division }.Where(x => !string.IsNullOrWhiteSpace(x)));
            string? school = hv?.School ?? saved.School;

            string code = RandomNumberGenerator.GetInt32(1000, 10000).ToString();
            int orderId = await c.ExecuteScalarAsync<int>(@"
                INSERT INTO orders (order_no, student_id, student_name, student_class, school, receiver_name, mobile, address, city, state, pincode,
                                    delivery_note, parent_checked, amount, delivery_code)
                VALUES ('tmp-' || gen_random_uuid(), @studentId, @studentName, @cls, @school, @receiver, @mobile, @address, @city, @state, @pin,
                        @note, true, @amount, @code)
                RETURNING id", new { studentId, studentName, cls, school, receiver, mobile, address, city, state, pin, note, amount, code }, tx);
            string orderNo = $"HS-{DateTime.Now:yyMM}-{orderId:D5}";
            await c.ExecuteAsync("UPDATE orders SET order_no = @orderNo WHERE id = @orderId", new { orderNo, orderId }, tx);

            foreach (var x in cart)
            {
                await c.ExecuteAsync("INSERT INTO order_items (order_id, product_id, name, art, image_file, qty, price) VALUES (@orderId, @ProductId, @Name, @Art, @ImageFile, @Qty, @Price)",
                    new { orderId, x.ProductId, x.Name, x.Art, x.ImageFile, x.Qty, x.Price }, tx);
                await c.ExecuteAsync("UPDATE products SET stock = stock - @Qty, updated_at = now() WHERE id = @ProductId", new { x.Qty, x.ProductId }, tx);
            }
            await c.ExecuteAsync("INSERT INTO wallet_ledger (student_id, kind, money, order_id, note, by_name) VALUES (@studentId, 'order', @neg, @orderId, @note, @studentName)",
                new { studentId, neg = -amount, orderId, note = $"Order {orderNo}", studentName }, tx);
            await c.ExecuteAsync("DELETE FROM cart_items WHERE student_id = @studentId", new { studentId }, tx);
            await AddEventAsync(c, tx, orderId, "Placed", $"Paid {Fmt.Rs(amount)} from shopping money", Roles.Student, studentName);
            await tx.CommitAsync();
            return orderId;
        }

        // ------------------------------------------------------------------ move along
        /// <summary>Moves an order one step, if it is at <paramref name="from"/>. Returns the new detail.</summary>
        public async Task MoveAsync(NpgsqlConnection c, NpgsqlTransaction tx, int orderId, string from, string to, string? note, string byRole, string? byName, int? vendorId = null)
        {
            int n = await c.ExecuteAsync(@"UPDATE orders SET status = @to, updated_at = now(),
                                              vendor_id = CASE WHEN @to = 'Assigned' THEN @vendorId WHEN @to = 'Verified' THEN NULL ELSE vendor_id END,
                                              delivered_at = CASE WHEN @to = 'Delivered' THEN now() ELSE delivered_at END
                                           WHERE id = @orderId AND status = @from",
                new { orderId, from, to, vendorId }, tx);
            if (n == 0) throw new StoreException("This order has already moved on. Please reload the page.", 409);
            await AddEventAsync(c, tx, orderId, to, note, byRole, byName);
        }

        /// <summary>Cancels an order before delivery: money back to the student, stock back to the shelf.</summary>
        public async Task CancelAsync(int orderId, string reason, string byRole, string byName, int? onlyStudentId = null)
        {
            reason = (reason ?? "").Trim();
            if (reason.Length < 3) throw new StoreException("Please write why the order is cancelled.");
            if (reason.Length > 300) reason = reason[..300];

            await using var c = await _db.OpenAsync();
            await using var tx = await c.BeginTransactionAsync();
            var o = await c.QueryFirstOrDefaultAsync<(int StudentId, string Status, decimal Amount, string OrderNo)>(
                "SELECT student_id, status, amount, order_no FROM orders WHERE id = @orderId FOR UPDATE", new { orderId }, tx);
            if (o.OrderNo == null || (onlyStudentId != null && o.StudentId != onlyStudentId)) throw new StoreException("Order not found.", 404);
            if (onlyStudentId != null && o.Status != "Placed") throw new StoreException("This order is already being prepared and cannot be cancelled now. Please contact HEM.");
            if (o.Status is "Delivered" or "Cancelled") throw new StoreException($"This order is {o.Status.ToLower()} and cannot be cancelled.");

            await c.ExecuteAsync("UPDATE orders SET status = 'Cancelled', cancel_reason = @reason, updated_at = now() WHERE id = @orderId", new { orderId, reason }, tx);
            await c.ExecuteAsync(@"UPDATE products p SET stock = p.stock + oi.qty, updated_at = now()
                                   FROM order_items oi WHERE oi.order_id = @orderId AND p.id = oi.product_id", new { orderId }, tx);
            await c.ExecuteAsync("INSERT INTO wallet_ledger (student_id, kind, money, order_id, note, by_name) VALUES (@sid, 'refund', @amount, @orderId, @note, @byName)",
                new { sid = o.StudentId, amount = o.Amount, orderId, note = $"Order {o.OrderNo} cancelled – money returned", byName }, tx);
            await AddEventAsync(c, tx, orderId, "Cancelled", reason, byRole, byName);
            await tx.CommitAsync();
        }
    }
}
