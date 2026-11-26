using System.Reflection;
using Npgsql;

namespace HemStore.Services
{
    /// <summary>
    /// Runs when the app starts: creates the HemStore database if it does not exist, then runs
    /// Database/HemStore_Create.sql (built into the app). The script only adds what is missing,
    /// so running it at every start is safe and quick. Switch off with HemStore:AutoMigrate = false.
    /// </summary>
    public static class DbMigrator
    {
        public static async Task RunAsync(string connectionString, ILogger log)
        {
            var target = new NpgsqlConnectionStringBuilder(connectionString);
            string dbName = target.Database ?? throw new InvalidOperationException("The HemStore connection string has no Database name.");

            // 1. Create the database when it is missing (connects to the "postgres" database for that).
            var admin = new NpgsqlConnectionStringBuilder(connectionString) { Database = "postgres", Pooling = false };
            await using (var c = new NpgsqlConnection(admin.ConnectionString))
            {
                await c.OpenAsync();
                await using var check = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = @n)", c);
                check.Parameters.AddWithValue("n", dbName);
                if (!(bool)(await check.ExecuteScalarAsync())!)
                {
                    string quoted = "\"" + dbName.Replace("\"", "\"\"") + "\"";
                    await using var create = new NpgsqlCommand($"CREATE DATABASE {quoted} ENCODING 'UTF8'", c);
                    await create.ExecuteNonQueryAsync();
                    log.LogInformation("Database {Db} created", dbName);
                }
            }

            // 2. Tables, indexes and starter rows (only what is missing).
            string sql;
            await using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("HemStore.Database.HemStore_Create.sql")
                                 ?? throw new InvalidOperationException("HemStore_Create.sql is not built into the app."))
            using (var r = new StreamReader(s))
                sql = await r.ReadToEndAsync();

            await using (var c = new NpgsqlConnection(new NpgsqlConnectionStringBuilder(connectionString) { Pooling = false }.ConnectionString))
            {
                await c.OpenAsync();
                // One app instance at a time runs the script.
                await using (var lk = new NpgsqlCommand("SELECT pg_advisory_lock(7100)", c)) await lk.ExecuteNonQueryAsync();
                try
                {
                    await using var cmd = new NpgsqlCommand(sql, c) { CommandTimeout = 120 };
                    await cmd.ExecuteNonQueryAsync();
                }
                finally
                {
                    await using var ul = new NpgsqlCommand("SELECT pg_advisory_unlock(7100)", c);
                    await ul.ExecuteNonQueryAsync();
                }
            }
            log.LogInformation("Database {Db} is up to date", dbName);
        }
    }
}
