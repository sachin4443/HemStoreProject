using Dapper;
using HemStore.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace HemStore.Controllers
{
    /// <summary>The student's side of the store.</summary>
    [ApiController]
    [Route("api/store")]
    [Authorize(Policy = Roles.Student)]
    public class StoreController : ControllerBase
    {
        private readonly Db _db;
        private readonly WalletService _wallet;
        private readonly OrderService _orders;
        private readonly SettingsService _settings;
        private readonly HemVirtuesClient _hv;
        private readonly FileStore _files;

        public StoreController(Db db, WalletService wallet, OrderService orders, SettingsService settings, HemVirtuesClient hv, FileStore files)
        {
            _db = db;
            _wallet = wallet;
            _orders = orders;
            _settings = settings;
            _hv = hv;
            _files = files;
        }

        private int StudentId => Me.Id(User);

        public static string? ImageUrl(string? file) => string.IsNullOrEmpty(file) ? null : "/media/products/" + file;

        public class ProductDto
        {
            public int Id { get; set; }
            public int CategoryId { get; set; }
            public string Name { get; set; } = "";
            public string? NameHi { get; set; }
            public string? About { get; set; }
            public string? Highlights { get; set; }
            public string AgeGroup { get; set; } = "";
            public decimal? Mrp { get; set; }
            public decimal Price { get; set; }
            public int Stock { get; set; }
            public string Art { get; set; } = "";
            public string? ImageFile { get; set; }
            public string? VendorCity { get; set; }
            public string? ImageUrl => StoreController.ImageUrl(ImageFile);
            public string[] Points => (Highlights ?? "").Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        }

        // ------------------------------------------------------------------ start-up data
        [HttpGet("me")]
        public async Task<IActionResult> MeInfo()
        {
            var settings = await _settings.GetAsync();
            var wallet = await _wallet.SummaryAsync(StudentId);
            await using var c = await _db.OpenAsync();
            var profile = await c.QueryFirstOrDefaultAsync("SELECT student_id, name, username, standard, division, school, mobile, address, city, state, pincode FROM students WHERE student_id = @id", new { id = StudentId });
            var wish = (await c.QueryAsync<int>("SELECT product_id FROM wishlist WHERE student_id = @id", new { id = StudentId })).ToList();
            var cart = (await c.QueryAsync<(int ProductId, int Qty)>("SELECT product_id, qty FROM cart_items WHERE student_id = @id", new { id = StudentId }))
                .ToDictionary(x => x.ProductId.ToString(), x => x.Qty);
            return Ok(new
            {
                success = true,
                profile,
                wallet,
                wishlist = wish,
                cart,
                settings = new { settings.PointValue, settings.MinRedeem, settings.MaxRedeemPerMonth, settings.StoreOpen, settings.DeliveryDays },
                hemVirtuesUrl = _hv.BaseUrl
            });
        }

        [HttpGet("catalog")]
        public async Task<IActionResult> Catalog()
        {
            await using var c = await _db.OpenAsync();
            var cats = await c.QueryAsync("SELECT id, slug, name, name_hi AS \"nameHi\", color, tint, art FROM categories WHERE is_active ORDER BY sort_order, name");
            var products = await c.QueryAsync<ProductDto>(@"
                SELECT p.id, p.category_id, p.name, p.name_hi, p.about, p.highlights, p.age_group, p.mrp, p.price, p.stock, p.art, p.image_file, v.city AS vendor_city
                FROM products p JOIN categories k ON k.id = p.category_id AND k.is_active
                LEFT JOIN vendors v ON v.id = p.vendor_id
                WHERE p.status = 'Live' AND (p.vendor_id IS NULL OR v.status = 'Active')
                ORDER BY p.price, p.name");
            return Ok(new { success = true, categories = cats, products });
        }

        // ------------------------------------------------------------------ wallet
        [HttpGet("wallet")]
        public async Task<IActionResult> Wallet()
        {
            var summary = await _wallet.SummaryAsync(StudentId, fresh: true);
            await using var c = await _db.OpenAsync();
            var ledger = await c.QueryAsync(@"SELECT l.kind, l.points, l.money, l.note, l.at, o.id AS order_id
                                              FROM wallet_ledger l LEFT JOIN orders o ON o.id = l.order_id
                                              WHERE l.student_id = @id ORDER BY l.at DESC, l.id DESC LIMIT 100", new { id = StudentId });
            return Ok(new { success = true, wallet = summary, ledger });
        }

        public class RedeemDto { public int Points { get; set; } }

        [HttpPost("redeem")]
        public async Task<IActionResult> Redeem([FromBody] RedeemDto m)
        {
            var w = await _wallet.RedeemAsync(StudentId, m?.Points ?? 0, Me.Name(User));
            return Ok(new { success = true, wallet = w, message = $"{Fmt.Rs(Math.Round((m?.Points ?? 0) * w.PointValue, 2))} added to your shopping money!" });
        }

        // ------------------------------------------------------------------ wishlist
        [HttpPost("wishlist/{productId:int}")]
        public async Task<IActionResult> ToggleWish(int productId)
        {
            await using var c = await _db.OpenAsync();
            int removed = await c.ExecuteAsync("DELETE FROM wishlist WHERE student_id = @id AND product_id = @productId", new { id = StudentId, productId });
            if (removed == 0)
            {
                if (!await c.ExecuteScalarAsync<bool>("SELECT EXISTS (SELECT 1 FROM products WHERE id = @productId AND status = 'Live')", new { productId }))
                    throw new StoreException("This product is not available.", 404);
                await c.ExecuteAsync("INSERT INTO wishlist (student_id, product_id) VALUES (@id, @productId) ON CONFLICT DO NOTHING", new { id = StudentId, productId });
            }
            var ids = await c.QueryAsync<int>("SELECT product_id FROM wishlist WHERE student_id = @id", new { id = StudentId });
            return Ok(new { success = true, saved = removed == 0, wishlist = ids, message = removed == 0 ? "Saved in your wishlist" : "Removed from your wishlist" });
        }

        // ------------------------------------------------------------------ cart
        public class CartDto { public int Qty { get; set; } public bool Add { get; set; } }

        private async Task<object> CartAsync(Npgsql.NpgsqlConnection c) =>
            (await c.QueryAsync<(int ProductId, int Qty)>("SELECT product_id, qty FROM cart_items WHERE student_id = @id", new { id = StudentId }))
                .ToDictionary(x => x.ProductId.ToString(), x => x.Qty);

        /// <summary>Sets the quantity (or adds one when Add is true).</summary>
        [HttpPost("cart/{productId:int}")]
        public async Task<IActionResult> SetCart(int productId, [FromBody] CartDto m)
        {
            await using var c = await _db.OpenAsync();
            var p = await c.QueryFirstOrDefaultAsync<(string Name, int Stock, string Status)>("SELECT name, stock, status FROM products WHERE id = @productId", new { productId });
            if (p.Name == null || p.Status != "Live") throw new StoreException("This product is not available.", 404);
            int current = await c.ExecuteScalarAsync<int?>("SELECT qty FROM cart_items WHERE student_id = @id AND product_id = @productId", new { id = StudentId, productId }) ?? 0;
            int qty = m?.Add == true ? Math.Max(current, 1) : (m?.Qty ?? 1);
            if (qty < 1 || qty > 10) throw new StoreException("You can order 1 to 10 of one item.");
            if (qty > p.Stock) throw new StoreException(p.Stock == 0 ? "Sorry, this is out of stock." : $"Only {p.Stock} left in stock.");
            await c.ExecuteAsync(@"INSERT INTO cart_items (student_id, product_id, qty) VALUES (@id, @productId, @qty)
                                   ON CONFLICT (student_id, product_id) DO UPDATE SET qty = EXCLUDED.qty", new { id = StudentId, productId, qty });
            return Ok(new { success = true, cart = await CartAsync(c), message = current == 0 ? p.Name + " added to cart" : "Cart updated" });
        }

        [HttpDelete("cart/{productId:int}")]
        public async Task<IActionResult> RemoveCart(int productId)
        {
            await using var c = await _db.OpenAsync();
            await c.ExecuteAsync("DELETE FROM cart_items WHERE student_id = @id AND product_id = @productId", new { id = StudentId, productId });
            return Ok(new { success = true, cart = await CartAsync(c) });
        }

        // ------------------------------------------------------------------ orders
        [HttpPost("orders")]
        public async Task<IActionResult> Place([FromBody] OrderService.AddressDto m)
        {
            int id = await _orders.PlaceAsync(StudentId, Me.Name(User), m ?? new());
            return Ok(new { success = true, id, message = "Your order is placed!" });
        }

        [HttpGet("orders")]
        public async Task<IActionResult> Orders()
        {
            await using var c = await _db.OpenAsync();
            var rows = await c.QueryAsync<OrderService.OrderRow>(OrderService.ListSql + " WHERE o.student_id = @id ORDER BY o.placed_at DESC", new { id = StudentId });
            return Ok(new { success = true, orders = rows.Select(StudentView) });
        }

        /// <summary>The student never sees vendor money details or the invoice; the code is shown until delivery.</summary>
        private static object StudentView(OrderService.OrderRow o) => new
        {
            o.Id, o.OrderNo, o.Status, o.Amount, o.PlacedAt, o.DeliveredAt, o.Items, o.ItemCount, o.FirstArt,
            firstImageUrl = ImageUrl(o.FirstImage),
            o.ReceiverName, o.Mobile, o.Address, o.City, o.State, o.Pincode, o.DeliveryNote,
            deliveryCode = o.Status is "Delivered" or "Cancelled" ? null : o.DeliveryCode,
            o.ReceivedBy, o.HasProof, o.StudentRating, o.StudentReceivedAt, o.CancelReason,
            vendorName = o.VendorName, vendorCity = o.VendorCity
        };

        [HttpGet("orders/{id:int}")]
        public async Task<IActionResult> Order(int id)
        {
            await using var c = await _db.OpenAsync();
            var d = await _orders.DetailAsync(c, id);
            if (d == null || d.Order.StudentId != StudentId) throw new StoreException("Order not found.", 404);
            return Ok(new
            {
                success = true,
                order = StudentView(d.Order),
                items = d.Items.Select(i => new { i.ProductId, i.Name, i.Art, imageUrl = ImageUrl(i.ImageFile), i.Qty, i.Price, i.Total }),
                events = d.Events.Select(e => new { e.Status, e.Note, e.At, by = e.ByRole == Roles.Vendor ? "Shop" : e.ByRole == Roles.Admin ? "HEM team" : e.ByRole })
            });
        }

        public class ReceivedDto { public string? Rating { get; set; } }

        [HttpPost("orders/{id:int}/received")]
        public async Task<IActionResult> Received(int id, [FromBody] ReceivedDto m)
        {
            string rating = m?.Rating is "Love it" or "Good" or "Okay" ? m.Rating : "Love it";
            await using var c = await _db.OpenAsync();
            int n = await c.ExecuteAsync(@"UPDATE orders SET student_rating = @rating, student_received_at = coalesce(student_received_at, now())
                                           WHERE id = @id AND student_id = @sid AND status = 'Delivered'", new { id, sid = StudentId, rating });
            if (n == 0) throw new StoreException("This order is not delivered yet.");
            return Ok(new { success = true, message = "Thank you! Enjoy your gift." });
        }

        public class CancelDto { public string? Reason { get; set; } }

        [HttpPost("orders/{id:int}/cancel")]
        public async Task<IActionResult> Cancel(int id, [FromBody] CancelDto m)
        {
            await _orders.CancelAsync(id, string.IsNullOrWhiteSpace(m?.Reason) ? "Cancelled by the student" : m!.Reason!, Roles.Student, Me.Name(User), StudentId);
            return Ok(new { success = true, message = "Order cancelled. The money is back in your wallet." });
        }

        [HttpGet("orders/{id:int}/proof")]
        public async Task<IActionResult> Proof(int id)
        {
            await using var c = await _db.OpenAsync();
            string? file = await c.ExecuteScalarAsync<string?>("SELECT proof_file FROM orders WHERE id = @id AND student_id = @sid", new { id, sid = StudentId });
            var path = _files.PathOf("proofs", file);
            if (path == null) return NotFound();
            Response.Headers.CacheControl = "private, max-age=300";
            return PhysicalFile(path, FileStore.ContentType(path));
        }
    }
}
