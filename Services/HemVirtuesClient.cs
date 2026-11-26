using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

namespace HemStore.Services
{
    /// <summary>
    /// Talks to HEM Virtues, which owns student accounts and points.
    /// Every request is signed with the shared secret (HemVirtues:SharedSecret), the same
    /// secret HEM Virtues has as HemStore:SharedSecret. Set it with "dotnet user-secrets"
    /// on a developer machine, or as an environment variable on the server.
    /// </summary>
    public class HemVirtuesClient
    {
        public const string Audience = "hemstore";
        private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

        private readonly HttpClient _http;
        private readonly IConfiguration _config;
        private readonly IMemoryCache _cache;
        private readonly ILogger<HemVirtuesClient> _logger;

        public HemVirtuesClient(HttpClient http, IConfiguration config, IMemoryCache cache, ILogger<HemVirtuesClient> logger)
        {
            _http = http;
            _config = config;
            _cache = cache;
            _logger = logger;
        }

        public string BaseUrl => (_config["HemVirtues:BaseUrl"] ?? "").TrimEnd('/');
        private string Secret => _config["HemVirtues:SharedSecret"] ?? "";
        public bool IsConfigured => BaseUrl.StartsWith("http", StringComparison.OrdinalIgnoreCase) && Secret.Length >= 32;

        public class Student
        {
            public int StudentId { get; set; }
            public string Name { get; set; } = "";
            public string? Username { get; set; }
            public string? Mobile { get; set; }
            public string? Email { get; set; }
            public string? PhotoUrl { get; set; }
            public string? Standard { get; set; }
            public string? Division { get; set; }
            public string? RollNo { get; set; }
            public string? School { get; set; }
            public string? Address { get; set; }
            public string? City { get; set; }
            public string? State { get; set; }
            public string? Pincode { get; set; }
            public bool IsActive { get; set; }
            public int TotalPoints { get; set; }
            public string ClassLabel => string.Join(" – ", new[] { Standard, Division }.Where(x => !string.IsNullOrWhiteSpace(x)));
        }

        private class Envelope { public bool Success { get; set; } public string? Message { get; set; } public Student? Student { get; set; } }

        // ---------------------------------------------------------------- signing
        private byte[] Sign(string text)
        {
            using var h = new HMACSHA256(Encoding.UTF8.GetBytes(Secret));
            return h.ComputeHash(Encoding.UTF8.GetBytes(text));
        }

        private static string B64Url(byte[] b) => Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        private static byte[] FromB64Url(string s)
        {
            s = s.Replace('-', '+').Replace('_', '/');
            return Convert.FromBase64String(s + new string('=', (4 - s.Length % 4) % 4));
        }

        private HttpRequestMessage Signed(HttpMethod method, string path, string body = "")
        {
            string ts = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
            var req = new HttpRequestMessage(method, BaseUrl + path);
            req.Headers.Add("X-HemStore-Timestamp", ts);
            req.Headers.Add("X-HemStore-Signature", B64Url(Sign(ts + "\n" + method.Method.ToUpperInvariant() + "\n" + path + "\n" + body)));
            if (body.Length > 0) req.Content = new StringContent(body, Encoding.UTF8, "application/json");
            return req;
        }

        private async Task<(int Status, Envelope? Data)> SendAsync(HttpRequestMessage req)
        {
            if (!IsConfigured) throw new StoreException("HEM Store is not connected to HEM Virtues yet. Please try again later.", 503);
            try
            {
                using var res = await _http.SendAsync(req);
                var data = await res.Content.ReadFromJsonAsync<Envelope>(Json);
                return ((int)res.StatusCode, data);
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException or NotSupportedException)
            {
                _logger.LogWarning(ex, "HEM Virtues could not be reached");
                throw new StoreException("HEM Virtues could not be reached. Please try again in a minute.", 503);
            }
        }

        // ---------------------------------------------------------------- calls
        /// <summary>Checks a student's HEM Virtues ID and password (the store never stores passwords).</summary>
        public async Task<Student> LoginAsync(string username, string password)
        {
            string body = JsonSerializer.Serialize(new { username, password }, Json);
            var (status, data) = await SendAsync(Signed(HttpMethod.Post, "/api/hemstore-bridge/login", body));
            if (status == 200 && data?.Student != null) { Remember(data.Student); return data.Student; }
            if (status == 401 && data?.Message == "Invalid signature.")
                throw new StoreException("HEM Store is not connected to HEM Virtues correctly. Please tell the HEM team.", 503);
            throw new StoreException(data?.Message ?? "Login failed. Please try again.", status is 401 or 403 ? 401 : 503);
        }

        /// <summary>Student profile and total points. Cached for one minute unless <paramref name="fresh"/>.</summary>
        public async Task<Student> StudentAsync(int studentId, bool fresh = false)
        {
            string key = "hv-student:" + studentId;
            if (!fresh && _cache.TryGetValue(key, out Student? s) && s != null) return s;
            var (status, data) = await SendAsync(Signed(HttpMethod.Get, "/api/hemstore-bridge/students/" + studentId));
            if (status == 200 && data?.Student != null) { Remember(data.Student); return data.Student; }
            if (status == 404) throw new StoreException("Your HEM Virtues account was not found.", 401);
            throw new StoreException(data?.Message ?? "HEM Virtues could not be reached. Please try again in a minute.", 503);
        }

        private void Remember(Student s) => _cache.Set("hv-student:" + s.StudentId, s, TimeSpan.FromMinutes(1));

        public class Ticket { public int Sid { get; set; } public string? Aud { get; set; } public long Iat { get; set; } public long Exp { get; set; } public string? Jti { get; set; } }

        /// <summary>Reads a "Redeem" ticket from HEM Virtues: checks the signature, the audience and the time.</summary>
        public Ticket? ReadTicket(string? ticket)
        {
            if (!IsConfigured || string.IsNullOrEmpty(ticket) || ticket.Length > 2000) return null;
            var parts = ticket.Split('.');
            if (parts.Length != 2) return null;
            try
            {
                byte[] expected = Sign(parts[0]), given = FromB64Url(parts[1]);
                if (given.Length != expected.Length || !CryptographicOperations.FixedTimeEquals(given, expected)) return null;
                var t = JsonSerializer.Deserialize<Ticket>(FromB64Url(parts[0]), Json);
                long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                if (t == null || t.Aud != Audience || t.Sid <= 0 || string.IsNullOrEmpty(t.Jti)) return null;
                if (t.Exp < now || t.Iat > now + 60 || t.Exp - t.Iat > 600) return null;
                return t;
            }
            catch { return null; }
        }
    }
}
