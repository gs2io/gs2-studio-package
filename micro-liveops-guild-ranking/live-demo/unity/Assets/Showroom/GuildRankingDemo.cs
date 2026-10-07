#nullable enable

using System;

namespace GS2Studio.Showroom.Demo
{
    public static class GuildRankingDemo
    {
        public const string GuildNamespace = "Guild";
        public const string GuildKind = "adventurers";

        // The join field accepts a plain name or a GRN; suffix extraction does not validate the guild identity.
        public static string GuildNameOf(string guildId)
        {
            var at = guildId.LastIndexOf(':');
            return at < 0 ? guildId : guildId.Substring(at + 1);
        }

        // Callers supply UTC values; this format appends a UTC label without converting the input.
        public static string Utc(DateTime time) => time.ToString("yyyy-MM-dd HH:mm") + " UTC";

        public static DateTime FromMilliseconds(long milliseconds) =>
            DateTimeOffset.FromUnixTimeMilliseconds(milliseconds).UtcDateTime;
    }
}
