using Dapper;
using Npgsql;

namespace HemStore.Services
{
    /// <summary>
    /// A student's store wallet.
    ///   Points available = points earned in HEM Virtues + admin adjustments − points already redeemed.
    ///   Shopping money   = money from redeemed points − orders + refunds.
    /// HEM Virtues keeps the earned total; this store keeps every redemption, order and refund.
    /// </summary>
    public class WalletService
    {
        private readonly Db _db;
        private readonly HemVirtuesClient _hv;
        private readonly SettingsService _settings;

        public WalletService(Db db, HemVirtuesClient hv, SettingsService settings)
        {
            _db = db;
            _hv = hv;
            _settings = settings;
        }

        public class Summary
        {
            public int Earned { get; set; }
            public int Redeemed { get; set; }
            public int Adjusted { get; set; }
            public int Available => Math.Max(0, Earned + Adjusted - Redeemed);
            public decimal Money { get; set; }
            public int RedeemedThisMonth { get; set; }
            public decimal PointValue { get; set; }
            public int MinRedeem { get; set; }
            public int MaxRedeemPerMonth { get; set; }
            /// <summary>True when HEM Virtues could not be reached and the last known total is shown.</summary>
            public bool Stale { get; set; }
        }

        private const string TotalsSql = @"
            SELECT coalesce(-sum(points) FILTER (WHERE kind = 'redeem'), 0)::int AS Redeemed,
                   coalesce(sum(points) FILTER (WHERE kind = 'adjust'), 0)::int AS Adjusted,
                   coalesce(sum(money), 0) AS Money,
                   coalesce(-sum(points) FILTER (WHERE kind = 'redeem' AND at >= date_trunc('month', now())), 0)::int AS RedeemedThisMonth
            FROM wallet_ledger WHERE student_id = @studentId";

        /// <summary>Saves the latest HEM Virtues profile so admins and orders have it.</summary>
        public static async Task RememberStudentAsync(NpgsqlConnection c, HemVirtuesClient.Student s, NpgsqlTransaction? tx = null)
        {
            await c.ExecuteAsync(@"
                INSERT INTO students (student_id, name, username, standard, division, school, mobile, email, address, city, state, pincode, last_total_points, last_seen_at)
                VALUES (@StudentId, @Name, @Username, @Standard, @Division, @School, @Mobile, @Email, @Address, @City, @State, @Pincode, @TotalPoints, now())
                ON CONFLICT (student_id) DO UPDATE SET
                    name = EXCLUDED.name, username = EXCLUDED.username, standard = EXCLUDED.standard, division = EXCLUDED.division,
                    school = EXCLUDED.school, mobile = EXCLUDED.mobile, email = EXCLUDED.email, address = EXCLUDED.address,
                    city = EXCLUDED.city, state = EXCLUDED.state, pincode = EXCLUDED.pincode,
                    last_total_points = EXCLUDED.last_total_points, last_seen_at = now()", s, tx);
        }

        public async Task<Summary> SummaryAsync(int studentId, bool fresh = false)
        {
            var settings = await _settings.GetAsync();
            await using var c = await _db.OpenAsync();
            var sum = await c.QuerySingleAsync<Summary>(TotalsSql, new { studentId });
            sum.PointValue = settings.PointValue;
            sum.MinRedeem = settings.MinRedeem;
            sum.MaxRedeemPerMonth = settings.MaxRedeemPerMonth;
            try
            {
                var s = await _hv.StudentAsync(studentId, fresh);
                sum.Earned = s.TotalPoints;
                await RememberStudentAsync(c, s);
            }
            catch (StoreException)
            {
                // Show the last known total; redeeming always asks HEM Virtues again.
                sum.Earned = await c.ExecuteScalarAsync<int?>("SELECT last_total_points FROM students WHERE student_id = @studentId", new { studentId }) ?? 0;
                sum.Stale = true;
            }
            return sum;
        }

        /// <summary>Turns points into shopping money. Always checks the live total in HEM Virtues.</summary>
        public async Task<Summary> RedeemAsync(int studentId, int points, string byName)
        {
            var settings = await _settings.GetAsync();
            if (!settings.StoreOpen) throw new StoreException("The store is closed right now. Please try again later.");
            // Students choose any number of points (slider); only what they have and the monthly limit apply.
            if (points < 1) throw new StoreException("Choose how many points to redeem.");

            var hv = await _hv.StudentAsync(studentId, fresh: true);

            await using var c = await _db.OpenAsync();
            await using var tx = await c.BeginTransactionAsync();
            await RememberStudentAsync(c, hv, tx);
            // One wallet change at a time per student (stops double clicks from redeeming twice).
            await c.ExecuteAsync("SELECT pg_advisory_xact_lock(7101, @studentId)", new { studentId }, tx);
            var sum = await c.QuerySingleAsync<Summary>(TotalsSql, new { studentId }, tx);
            sum.Earned = hv.TotalPoints;

            if (points > sum.Available) throw new StoreException($"You have {sum.Available} points. You cannot redeem {points}.");
            if (sum.RedeemedThisMonth + points > settings.MaxRedeemPerMonth)
                throw new StoreException($"You can redeem up to {settings.MaxRedeemPerMonth} points in a month. {Math.Max(0, settings.MaxRedeemPerMonth - sum.RedeemedThisMonth)} left this month.");

            decimal money = Math.Round(points * settings.PointValue, 2);
            await c.ExecuteAsync(@"INSERT INTO wallet_ledger (student_id, kind, points, money, note, by_name)
                                   VALUES (@studentId, 'redeem', @neg, @money, @note, @byName)",
                new { studentId, neg = -points, money, note = $"Redeemed {points} points at {Fmt.Rs(settings.PointValue)} each", byName }, tx);
            await tx.CommitAsync();
            return await SummaryAsync(studentId);
        }
    }
}
