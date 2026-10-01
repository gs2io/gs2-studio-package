// Moving the player's clock forward, as the demos that show time do it.
//
// What these demos show builds up over hours or days (idle rewards, a daily
// login reward, a daily season), and a visitor does not wait that long. GS2
// keeps a time offset on each account that the server adds to "now" for every
// request the account's access token signs, so the demo moves that offset
// forward and everything GS2 times moves with it.
//
// No package action sets the offset (it is an account setting, not game
// state) and the Ez SDK has no call for it, so this goes through the core
// SDK's `UpdateTimeOffset`. The shared showroom client may not make that call:
// a demo that advances the clock signs in with a client of its own
// (`live-demo/client-stack.yaml`) whose policy allows it. Without one, GS2
// refuses the advance, and the refusal is reported like any other.
//
// The offset travels in the access token, which is issued at sign-in, so the
// session signs in again once the account has the new offset. The token's own
// `TimeOffset` is left alone: the SDK reads it as part of the session's
// identity, and the account sign-in never fills it, so it stays null and the
// page's subscriptions keep their key.
//
// An advance runs as a press (`DemoClockAdvanceButton` hands it to
// `ShowroomPress`), so it waits its turn with every other press on the page:
// two advances at once would both read the same offset and move the clock
// once, not twice, and a press racing an advance would go out on either clock.
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
    /// <summary>
    /// The one way a demo moves a player's clock, shared by its buttons.
    /// </summary>
    internal static class DemoClockAdvance
    {
        /// <summary>What one advance did.</summary>
        internal readonly struct Outcome
        {
            public Outcome(bool applied, string line)
            {
                Applied = applied;
                Line = line;
            }

            /// <summary>Whether the account has the new offset and the session signed in with it.</summary>
            public bool Applied { get; }

            /// <summary>What the page should say ("" for nothing).</summary>
            public string Line { get; }
        }

        /// <summary>
        /// Moves the signed-in player's clock forward by the seconds given and
        /// signs the session in again with it. A refusal from GS2 to move the
        /// clock is thrown, for the press runner to report; anything that
        /// stops the advance short is in the outcome's line.
        /// </summary>
        public static async Task<Outcome> Advance(Gs2Domain gs2, IGameSession session, int seconds)
        {
            var login = UnityEngine.Object.FindAnyObjectByType<Gs2AutoLoginAction>();
            if (login == null || string.IsNullOrEmpty(login.accountNamespace))
            {
                return new Outcome(false, "The scene names no account namespace to advance the clock in.");
            }

            // Read afresh: another demo on the same account may have moved the
            // clock since this page last looked, and an advance from a stale
            // offset would move it back.
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

            // The account has the new offset whatever happens next, so it is
            // stored before the session is refreshed.
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
