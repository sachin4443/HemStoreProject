using System.Security.Claims;
using System.Text.RegularExpressions;
using Dapper;
using HemStore.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace HemStore.Controllers
{
    /// <summary>Logins for students (HEM Virtues ID or the "Redeem" ticket), vendors and admins.</summary>
    [ApiController]
    public class AuthController : ControllerBase
    {
        private static readonly PasswordHasher<object> Hasher = new();
        private static readonly object HashUser = new();
        private static readonly Regex EmailPattern = new(@"^[^@\s]+@[^@\s]+\.[^@\s]+$", RegexOptions.Compiled);
        private const int MaxFails = 5;

        private readonly Db _db;
        private readonly HemVirtuesClient _hv;
        private readonly ILogger<AuthController> _logger;

        public AuthController(Db db, HemVirtuesClient hv, ILogger<AuthController> logger)
        {
            _db = db;
            _hv = hv;
            _logger = logger;
        }

        public static string Hash(string password) => Hasher.HashPassword(HashUser, password);
        public static bool Verify(string hash, string password) =>
            !string.IsNullOrEmpty(hash) && Hasher.VerifyHashedPassword(HashUser, hash, password) != PasswordVerificationResult.Failed;

        public static void CheckPassword(string password)
        {
            if (password.Length < 8 || password.Length > 100) throw new StoreException("The password must be 8 to 100 characters.");
            if (!password.Any(char.IsLetter) || !password.Any(char.IsDigit)) throw new StoreException("The password must have letters and numbers.");
        }

        public static string CleanEmail(string? email)
        {
            string e = (email ?? "").Trim();
            if (e.Length > 200 || !EmailPattern.IsMatch(e)) throw new StoreException("Please enter a valid email address.");
            return e;
        }

        private async Task SignInAsync(string role, int id, string name, bool remember = false)
        {
            var identity = new ClaimsIdentity(new[]
            {
                new Claim("uid", id.ToString()),
                new Claim(ClaimTypes.Name, name),
                new Claim(ClaimTypes.Role, role)
            }, CookieAuthenticationDefaults.AuthenticationScheme);
            await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity),
                new AuthenticationProperties { IsPersistent = remember, IssuedUtc = DateTimeOffset.UtcNow });
        }

        // ------------------------------------------------------------------ status
        [HttpGet("api/auth/status")]
        public async Task<IActionResult> Status()
        {
            bool ready = await _db.ReadyAsync();
            bool needsSetup = false;
            if (ready)
            {
                await using var c = await _db.OpenAsync();
                needsSetup = !await c.ExecuteScalarAsync<bool>("SELECT EXISTS (SELECT 1 FROM admins)");
            }
            return Ok(new { success = true, databaseReady = ready, needsSetup, hemVirtuesConnected = _hv.IsConfigured, hemVirtuesUrl = _hv.BaseUrl });
        }

        [HttpGet("api/auth/me")]
        public IActionResult MeInfo()
        {
            if (User.Identity?.IsAuthenticated != true) return Ok(new { success = true, loggedIn = false });
            return Ok(new { success = true, loggedIn = true, role = Me.Role(User), id = Me.Id(User), name = Me.Name(User), hemVirtuesUrl = _hv.BaseUrl });
        }

        // ------------------------------------------------------------------ first admin (only while there is none)
        public class SetupDto { public string? Name { get; set; } public string? Email { get; set; } public string? Password { get; set; } }

        [HttpPost("api/auth/setup")]
        [EnableRateLimiting("login")]
        public async Task<IActionResult> Setup([FromBody] SetupDto m)
        {
            if (!await _db.ReadyAsync()) throw new StoreException("Run Database/HemStore_Create.sql first.", 503);
            await using (var check = await _db.OpenAsync())
                if (await check.ExecuteScalarAsync<bool>("SELECT EXISTS (SELECT 1 FROM admins)"))
                    throw new StoreException("The first admin is already set up. Please log in.", 409);
            string name = (m?.Name ?? "").Trim();
            if (name.Length < 2 || name.Length > 100) throw new StoreException("Please enter your name.");
            string email = CleanEmail(m?.Email);
            CheckPassword(m?.Password ?? "");

            await using var c = await _db.OpenAsync();
            await using var tx = await c.BeginTransactionAsync();
            await c.ExecuteAsync("LOCK TABLE admins IN EXCLUSIVE MODE", transaction: tx);
            if (await c.ExecuteScalarAsync<bool>("SELECT EXISTS (SELECT 1 FROM admins)", transaction: tx))
                throw new StoreException("The first admin is already set up. Please log in.", 409);
            int id = await c.ExecuteScalarAsync<int>("INSERT INTO admins (name, email, password_hash) VALUES (@name, @email, @hash) RETURNING id",
                new { name, email, hash = Hash(m!.Password!) }, tx);
            await tx.CommitAsync();
            await SignInAsync(Roles.Admin, id, name);
            _logger.LogInformation("First HEM Store admin {Email} created", email);
            return Ok(new { success = true, message = "Admin account created.", role = Roles.Admin });
        }

        // ------------------------------------------------------------------ student
        public class StudentLoginDto { public string? Username { get; set; } public string? Password { get; set; } public bool Remember { get; set; } }

        /// <summary>Student logs in on the store with the same ID and password as HEM Virtues.</summary>
        [HttpPost("api/auth/student")]
        [EnableRateLimiting("login")]
        public async Task<IActionResult> StudentLogin([FromBody] StudentLoginDto m)
        {
            string username = (m?.Username ?? "").Trim(), password = m?.Password ?? "";
            if (username.Length == 0 || password.Length == 0) throw new StoreException("Enter your HEM Virtues ID and password.");
            var s = await _hv.LoginAsync(username, password);
            await using (var c = await _db.OpenAsync()) await WalletService.RememberStudentAsync(c, s);
            await SignInAsync(Roles.Student, s.StudentId, s.Name, m?.Remember == true);
            return Ok(new { success = true, role = Roles.Student, name = s.Name });
        }

        /// <summary>"Redeem" button on the HEM Virtues dashboard lands here with a 2-minute, one-time ticket.</summary>
        [HttpGet("sso")]
        public async Task<IActionResult> Sso(string? ticket, string? to)
        {
            string page = to is "orders" or "wallet" ? to : "home";
            var t = _hv.ReadTicket(ticket);
            if (t == null) return Redirect("/#login?expired=1");

            await using var c = await _db.OpenAsync();
            // Each ticket works once: a copied or reused link is refused.
            int fresh = await c.ExecuteAsync(@"INSERT INTO sso_tickets_used (jti, student_id, expires_at)
                                               VALUES (@jti, @sid, to_timestamp(@exp)) ON CONFLICT (jti) DO NOTHING",
                new { jti = t.Jti, sid = t.Sid, exp = t.Exp });
            if (fresh == 0) return Redirect("/#login?expired=1");
            await c.ExecuteAsync("DELETE FROM sso_tickets_used WHERE expires_at < now() - interval '1 day'");

            HemVirtuesClient.Student s;
            try { s = await _hv.StudentAsync(t.Sid, fresh: true); }
            catch (StoreException) { return Redirect("/#login?offline=1"); }
            if (!s.IsActive) return Redirect("/#login?inactive=1");

            await WalletService.RememberStudentAsync(c, s);
            await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            await SignInAsync(Roles.Student, s.StudentId, s.Name);
            return Redirect("/#s-" + page);
        }

        // ------------------------------------------------------------------ vendor and admin
        public class EmailLoginDto { public string? Email { get; set; } public string? Password { get; set; } }

        [HttpPost("api/auth/vendor")]
        [EnableRateLimiting("login")]
        public Task<IActionResult> VendorLogin([FromBody] EmailLoginDto m) => EmailLoginAsync("vendors", Roles.Vendor, m);

        [HttpPost("api/auth/admin")]
        [EnableRateLimiting("login")]
        public Task<IActionResult> AdminLogin([FromBody] EmailLoginDto m) => EmailLoginAsync("admins", Roles.Admin, m);

        private record Account(int Id, string Name, string PasswordHash, string Status, int FailedLogins, DateTime? LockedUntil);

        private async Task<IActionResult> EmailLoginAsync(string table, string role, EmailLoginDto? m)
        {
            string email = (m?.Email ?? "").Trim(), password = m?.Password ?? "";
            if (email.Length == 0 || password.Length == 0) throw new StoreException("Enter your email and password.");

            await using var c = await _db.OpenAsync();
            string sql = table == "vendors"
                ? "SELECT id, business_name AS name, password_hash, status, failed_logins, locked_until FROM vendors WHERE lower(email) = lower(@email)"
                : "SELECT id, name, password_hash, CASE WHEN is_active THEN 'Active' ELSE 'Inactive' END AS status, failed_logins, locked_until FROM admins WHERE lower(email) = lower(@email)";
            var a = await c.QueryFirstOrDefaultAsync<Account>(sql, new { email });

            const string wrong = "Wrong email or password.";
            if (a == null) { Hash(password); throw new StoreException(wrong, 401); }   // same time as a real check
            if (a.LockedUntil > DateTime.UtcNow)
                throw new StoreException("Too many wrong passwords. Please try again in 15 minutes.", 423);

            if (!Verify(a.PasswordHash, password))
            {
                await c.ExecuteAsync($@"UPDATE {table} SET failed_logins = failed_logins + 1,
                                        locked_until = CASE WHEN failed_logins + 1 >= {MaxFails} THEN now() + interval '15 minutes' ELSE locked_until END
                                        WHERE id = @id", new { id = a.Id });
                throw new StoreException(wrong, 401);
            }

            if (a.Status != "Active")
                throw new StoreException(a.Status switch
                {
                    "Pending" => "Your shop is waiting for HEM approval. You will get an e-mail when it is approved.",
                    "Rejected" => "Your application was not approved. Please contact the HEM team.",
                    "Suspended" => "Your shop is paused. Please contact the HEM team.",
                    _ => "This account is not active."
                }, 403);

            await c.ExecuteAsync($"UPDATE {table} SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = @id", new { id = a.Id });
            await SignInAsync(role, a.Id, a.Name);
            return Ok(new { success = true, role, name = a.Name });
        }

        [HttpPost("api/auth/logout")]
        public async Task<IActionResult> Logout()
        {
            await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Ok(new { success = true });
        }
    }
}
