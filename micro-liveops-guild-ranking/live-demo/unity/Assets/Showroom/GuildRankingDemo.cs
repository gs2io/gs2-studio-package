// What the guild ranking page's hand-written parts share: reaching the
// signed-in player, holding presses while the page moves under the cursor,
// saying why GS2 refused, and the short name an anonymous player goes by.
#nullable enable

using System;
using System.Linq;

using UnityEngine;

using Gs2.Core.Exception;
using Gs2.Unity.Core;
using Gs2.Unity.Util;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>The guild ranking page's shared helpers.</summary>
    public static class GuildRankingDemo
    {
        /// <summary>The guild namespace and kind the guild packages deploy.</summary>
        public const string GuildNamespace = "Guild";
        public const string GuildKind = "adventurers";

        /// <summary>
        /// How long after something on the page changed size a press is
        /// refused: the lobby, the board and the generated guild rows all
        /// grow and shrink, and every button below them moves, so a press in
        /// that moment may land on a different button than the visitor aimed
        /// at.
        /// </summary>
        private const float SettleSeconds = 0.6f;

        private static float _lastChange = float.NegativeInfinity;
        private static ShowroomPage? _page;

        /// <summary>Says that something on the page just changed what it shows.</summary>
        public static void MarkChanged() => _lastChange = Time.realtimeSinceStartup;

        /// <summary>
        /// Whether a press may go ahead now. When it may not, the visitor is
        /// told to press again.
        /// </summary>
        public static bool Settled()
        {
            if (Time.realtimeSinceStartup - _lastChange >= SettleSeconds) return true;
            Log("The page just changed; press again.");
            return false;
        }

        /// <summary>The signed-in player's SDK handles, once signed in.</summary>
        public static bool TryRuntime(out Gs2Domain? gs2, out IGameSession? session)
        {
            gs2 = null;
            session = null;
            var runtime = UnityEngine.Object.FindAnyObjectByType<GS2Studio.Generated.Runtime.Gs2HolderRuntimeContextProvider>();
            return runtime != null && runtime.TryGet(out gs2, out session) && gs2 != null && session != null;
        }

        /// <summary>Whether GS2 refused for the given reason.</summary>
        public static bool Refused(Gs2Exception error, string reason) =>
            error.Errors?.Any(detail => detail.message?.EndsWith("." + reason) == true) == true;

        /// <summary>
        /// A short, stable name for an anonymous player: the same id always
        /// reads the same, and two ids rarely read alike.
        /// </summary>
        public static string Tag(string? userId)
        {
            unchecked
            {
                var hash = 2166136261u;
                foreach (var character in userId ?? "")
                {
                    hash = (hash ^ character) * 16777619u;
                }
                return $"Player {hash & 0xFFFF:X4}";
            }
        }

        /// <summary>Puts a line in the page's log, since a browser hides the console.</summary>
        public static void Log(string message)
        {
            if (message.Length == 0) return;
            _page ??= UnityEngine.Object.FindAnyObjectByType<ShowroomPage>();
            if (_page != null) _page.Log(message);
            else Debug.LogWarning($"{nameof(GuildRankingDemo)}: {message}");
        }

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
