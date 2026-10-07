// Refreshing the session is required because GS2 takes the time offset from its access token.
// Keep advances in ShowroomPress: concurrent read-modify-write operations can lose increments.
#nullable enable

using System;
using System.Threading.Tasks;

using UnityEngine;

using Gs2.Gs2Account.Request;
using Gs2.Unity.Core;
using Gs2.Unity.Util;
using Gs2Bind.Gs2Account;

namespace GS2Studio.Showroom
{
    internal static class DemoClockAdvance
    {
        internal readonly struct Outcome
        {
            public Outcome(bool applied, string line)
            {
                Applied = applied;
                Line = line;
            }

            public bool Applied { get; }

            public string Line { get; }
        }

        public static async Task<Outcome> Advance(Gs2Domain gs2, IGameSession session, int seconds)
        {
            var login = UnityEngine.Object.FindAnyObjectByType<Gs2AutoLoginAction>();
            if (login == null || string.IsNullOrEmpty(login.accountNamespace))
            {
                return new Outcome(false, "The scene names no account namespace to advance the clock in.");
            }

            // Another page may have advanced this account; reusing our offset could move it back.
            var userId = session.UserId;
            if (!await DemoTimeOffset.Read())
            {
                return new Outcome(false, "The demo clock could not be read from GS2, so it was not moved. Try again in a moment.");
            }
            var next = (long)DemoTimeOffset.Get(userId) + seconds;
            if (next > DemoTimeOffset.MaxSeconds)
            {
                return new Outcome(false, "The demo clock is already as far ahead as GS2 allows (ten years).");
            }

            await gs2.Super.Account
                .Namespace(login.accountNamespace)
                .Account(userId)
                .UpdateTimeOffsetAsync(new UpdateTimeOffsetRequest().WithTimeOffset((int)next));

            // Keep the local offset aligned with the updated account even if session refresh fails.
            DemoTimeOffset.Set(userId, (int)next);

            try
            {
                await session.RefreshAsync();
            }
            catch (Exception error)
            {
                Debug.LogWarning($"[showroom] {nameof(DemoClockAdvance)}: refreshing the session failed: {error}");
                return new Outcome(
                    false,
                    "The clock moved forward, but signing in again failed, so this page still " +
                    "runs on the old time. Reload the page: the next sign-in carries the new offset.");
            }
            DemoTimeOffset.NotifyApplied(userId);
            return new Outcome(true, "");
        }
    }
}
