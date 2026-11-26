using System.Threading.RateLimiting;
using HemStore.Services;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.RateLimiting;
using Npgsql;

// HEM Store: one ASP.NET Core app that serves both the API (/api/...) and the web pages (wwwroot).
// "dotnet run" starts everything; "dotnet publish" puts everything in one folder.
var builder = WebApplication.CreateBuilder(args);
Dapper.DefaultTypeMap.MatchNamesWithUnderscores = true;

// ---------------------------------------------------------------- database
string cs = builder.Configuration.GetConnectionString("HemStore") ?? "";
if (string.IsNullOrWhiteSpace(cs))
    throw new InvalidOperationException(
        "Connection string 'HemStore' is not set. On a developer machine run: " +
        "dotnet user-secrets set \"ConnectionStrings:HemStore\" \"Host=localhost;Port=5432;Database=HemStore;Username=postgres;Password=...\" " +
        "On the server set the environment variable ConnectionStrings__HemStore.");
builder.Services.AddSingleton(new NpgsqlDataSourceBuilder(cs).Build());

builder.Services.AddMemoryCache();
builder.Services.AddSingleton<Db>();
builder.Services.AddSingleton<SettingsService>();
builder.Services.AddSingleton<FileStore>();
builder.Services.AddScoped<WalletService>();
builder.Services.AddScoped<OrderService>();
builder.Services.AddHttpClient<HemVirtuesClient>(c => c.Timeout = TimeSpan.FromSeconds(15));

// ---------------------------------------------------------------- login
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(o =>
    {
        o.Cookie.Name = ".HemStore.Auth";
        o.Cookie.HttpOnly = true;
        o.Cookie.SameSite = SameSiteMode.Lax;
        o.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        o.ExpireTimeSpan = TimeSpan.FromHours(8);
        o.SlidingExpiration = true;
        // The pages are a single-page app: answer API calls with 401/403 instead of redirecting.
        o.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = 401; return Task.CompletedTask; };
        o.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = 403; return Task.CompletedTask; };
    });
builder.Services.AddAuthorization(o =>
{
    o.AddPolicy(Roles.Student, p => p.RequireRole(Roles.Student));
    o.AddPolicy(Roles.Vendor, p => p.RequireRole(Roles.Vendor));
    o.AddPolicy(Roles.Admin, p => p.RequireRole(Roles.Admin));
});

// Slow down password guessing: 30 login tries a minute per address (a school lab shares one address).
// Vendor and admin accounts also lock for 15 minutes after 5 wrong passwords.
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = 429;
    o.AddPolicy("login", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 30, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});

builder.Services.AddControllers(o => o.Filters.Add<StoreExceptionFilter>());
builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(o => o.MultipartBodyLengthLimit = 25 * 1024 * 1024);

var app = builder.Build();

// ---------------------------------------------------------------- errors as JSON for the API
app.UseExceptionHandler(e => e.Run(async ctx =>
{
    var ex = ctx.Features.Get<IExceptionHandlerFeature>()?.Error;
    var log = ctx.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("HemStore");
    if (ex is StoreException se)
    {
        ctx.Response.StatusCode = se.Status;
        await ctx.Response.WriteAsJsonAsync(new { success = false, message = se.Message });
        return;
    }
    log.LogError(ex, "Unhandled error on {Path}", ctx.Request.Path);
    ctx.Response.StatusCode = 500;
    string msg = app.Environment.IsDevelopment() && ex != null ? "Server error: " + ex.GetBaseException().Message : "Something went wrong. Please try again.";
    await ctx.Response.WriteAsJsonAsync(new { success = false, message = msg });
}));

if (!app.Environment.IsDevelopment()) app.UseHsts();
app.UseHttpsRedirection();

// Basic protection headers for every response.
app.Use(async (ctx, next) =>
{
    ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
    ctx.Response.Headers["X-Frame-Options"] = "DENY";
    ctx.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    await next();
});

// Changes through the API must come from our own pages (a simple guard against cross-site requests).
app.Use(async (ctx, next) =>
{
    if (ctx.Request.Path.StartsWithSegments("/api") && !HttpMethods.IsGet(ctx.Request.Method) && !HttpMethods.IsHead(ctx.Request.Method)
        && !ctx.Request.Headers.ContainsKey("X-Requested-With"))
    {
        ctx.Response.StatusCode = 400;
        await ctx.Response.WriteAsJsonAsync(new { success = false, message = "Invalid request." });
        return;
    }
    await next();
});

app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        // index.html always fresh; scripts and styles carry a version in their link.
        if (ctx.File.Name.EndsWith(".html", StringComparison.OrdinalIgnoreCase))
            ctx.Context.Response.Headers.CacheControl = "no-cache";
    }
});
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// Every other address is a page of the single-page app.
app.MapFallbackToFile("index.html");

app.Run();
