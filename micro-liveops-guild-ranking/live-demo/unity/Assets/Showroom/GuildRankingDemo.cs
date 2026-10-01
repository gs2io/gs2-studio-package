// What the guild ranking page's hand-written parts share beyond the showroom
// runtime: the guild namespace and kind, and how a guild and a time are
// written. Reaching the player, logging, refusals, player tags and the settle
// pause are the runtime's (`ShowroomRuntime`, `ShowroomLog`, `ShowroomRefusal`,
// `ShowroomPlayerTag`, `ShowroomSettle`).
#nullable enable

using System;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>The guild ranking page's shared helpers.</summary>
    public static class GuildRankingDemo
    {
        /// <summary>The guild namespace and kind the guild packages deploy.</summary>
        public const string GuildNamespace = "Guild";
        public const string GuildKind = "adventurers";

        /// <summary>The guild's own name, the last part of its id.</summary>
        public static string GuildNameOf(string guildId)
        {
            var at = guildId.LastIndexOf(':');
            return at < 0 ? guildId : guildId.Substring(at + 1);
        }

        /// <summary>A UTC time as the page writes it.</summary>
        public static string Utc(DateTime time) => time.ToString("yyyy-MM-dd HH:mm") + " UTC";

        /// <summary>A GS2 time in milliseconds as a UTC time.</summary>
        public static DateTime FromMilliseconds(long milliseconds) =>
            DateTimeOffset.FromUnixTimeMilliseconds(milliseconds).UtcDateTime;
    }
}
