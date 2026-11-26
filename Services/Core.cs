using System.Globalization;
using System.Security.Claims;
using Dapper;
using Microsoft.Extensions.Caching.Memory;
using Npgsql;

namespace HemStore.Services
{
    /// <summary>A message the user can read (shown as is, with status 400 unless set).</summary>
    public class StoreException : Exception
    {
        public int Status { get; }
        public StoreException(string message, int status = 400) : base(message) => Status = status;
    }

    public static class Roles
    {
        public const string Student = "Student";
        public const string Vendor = "Vendor";
        public const string Admin = "Admin";
    }

    /// <summary>Who is logged in (from the auth cookie).</summary>
    public static class Me
    {
        public static int Id(ClaimsPrincipal u) => int.TryParse(u.FindFirstValue("uid"), out var v) ? v : 0;
        public static string Name(ClaimsPrincipal u) => u.FindFirstValue(ClaimTypes.Name) ?? "";
        public static string Role(ClaimsPrincipal u) => u.FindFirstValue(ClaimTypes.Role) ?? "";
        public static string Label(ClaimsPrincipal u) => $"{Name(u)} ({Role(u)})";
    }

    /// <summary>Database access (Npgsql + Dapper).</summary>
    public class Db
    {
        private readonly NpgsqlDataSource _source;
        public Db(NpgsqlDataSource source) => _source = source;
        public NpgsqlConnection Open() => _source.OpenConnection();
        public async Task<NpgsqlConnection> OpenAsync() => await _source.OpenConnectionAsync();

        /// <summary>True when Database/HemStore_Create.sql has been run.</summary>
        public async Task<bool> ReadyAsync()
        {
            try
            {
                await using var c = await OpenAsync();
                return await c.ExecuteScalarAsync<bool>("SELECT to_regclass('public.wallet_ledger') IS NOT NULL AND to_regclass('public.invoices') IS NOT NULL");
            }
            catch { return false; }
        }
    }

    /// <summary>Store rules set by the admin (Points configuration). Cached for 30 seconds.</summary>
    public class StoreSettings
    {
        public decimal PointValue { get; set; } = 0.5m;
        public int MinRedeem { get; set; } = 200;
        public int MaxRedeemPerMonth { get; set; } = 1000;
        public bool StoreOpen { get; set; } = true;
        public string DeliveryDays { get; set; } = "3-5 days";

        public static readonly string[] Keys = { "point_value", "min_redeem", "max_redeem_per_month", "store_open", "delivery_days" };
    }

    public class SettingsService
    {
        private readonly Db _db;
        private readonly IMemoryCache _cache;
        private const string Key = "store-settings";
        public SettingsService(Db db, IMemoryCache cache) { _db = db; _cache = cache; }

        public async Task<StoreSettings> GetAsync()
        {
            if (_cache.TryGetValue(Key, out StoreSettings? s) && s != null) return s;
            await using var c = await _db.OpenAsync();
            var rows = (await c.QueryAsync<(string Key, string Value)>("SELECT key, value FROM settings")).ToDictionary(r => r.Key, r => r.Value);
            s = new StoreSettings();
            if (rows.TryGetValue("point_value", out var pv) && decimal.TryParse(pv, NumberStyles.Number, CultureInfo.InvariantCulture, out var d) && d > 0) s.PointValue = d;
            if (rows.TryGetValue("min_redeem", out var mr) && int.TryParse(mr, out var i) && i > 0) s.MinRedeem = i;
            if (rows.TryGetValue("max_redeem_per_month", out var mx) && int.TryParse(mx, out var j) && j > 0) s.MaxRedeemPerMonth = j;
            if (rows.TryGetValue("store_open", out var so)) s.StoreOpen = so == "true";
            if (rows.TryGetValue("delivery_days", out var dd) && !string.IsNullOrWhiteSpace(dd)) s.DeliveryDays = dd;
            _cache.Set(Key, s, TimeSpan.FromSeconds(30));
            return s;
        }

        public void Forget() => _cache.Remove(Key);
    }

    public static class Fmt
    {
        public static string Rs(decimal v) => "₹" + v.ToString(v == Math.Round(v) ? "#,##0" : "#,##0.00", CultureInfo.GetCultureInfo("en-IN"));
        /// <summary>Points needed for a rupee amount (rounded up).</summary>
        public static int Points(decimal rupees, decimal pointValue) => (int)Math.Ceiling(rupees / pointValue);
    }
}

namespace HemStore.Services
{
    /// <summary>Messages meant for the user are answered directly (not logged as server errors).</summary>
    public class StoreExceptionFilter : Microsoft.AspNetCore.Mvc.Filters.IExceptionFilter
    {
        public void OnException(Microsoft.AspNetCore.Mvc.Filters.ExceptionContext context)
        {
            if (context.Exception is not StoreException se) return;
            context.Result = new Microsoft.AspNetCore.Mvc.ObjectResult(new { success = false, message = se.Message }) { StatusCode = se.Status };
            context.ExceptionHandled = true;
        }
    }
}
