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
// SDK's `UpdateTimeOffset`. The shared client may not make that call; this
// demo signs in with its own (`live-demo/client-stack.yaml`), whose policy
// allows it.
//
// The offset travels in the access token, which is issued at sign-in, so the
// session signs in again once the account has the new offset. The token's own
// `TimeOffset` is left alone: the SDK reads it as part of the session's
// identity, and the account sign-in never fills it, so it stays null and the
// page's subscriptions keep their key.
#nullable enable

using System;
using System.Threading.Tasks;

using UnityEngine;

using Gs2.Core.Exception;
using Gs2.Gs2Account.Request;
using Gs2.Unity.Util;
using Gs2Bind.Gs2Account;

using GS2Studio.Generated.Runtime;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// The one way this demo moves a player's clock, shared by its buttons.
    /// </summary>
    internal static class DemoClockAdvance
    {
        /// <summary>
        /// Whether one advance is already on its way. Two at once would both
        /// read the same offset and move the clock once, not twice.
        /// </summary>
        private static bool _running;

        /// <summary>
        /// Moves the signed-in player's clock forward by the seconds given and
        /// signs the session in again with it. Returns whether both happened;
        /// a refusal from GS2 goes to <paramref name="failed"/> and anything
        /// else to <paramref name="report"/>.
        /// </summary>
        public static async Task<bool> Advance(
            int seconds, Action<string> report, Action<Gs2Exception> failed)
        {
            if (_running)
            {
                report("The clock is still moving.");
                return false;
            }
            _running = true;
            try
            {
                return await AdvanceOnce(seconds, report, failed);
            }
            finally
            {
                _running = false;
            }
        }

        private static async Task<bool> AdvanceOnce(
            int seconds, Action<string> report, Action<Gs2Exception> failed)
        {
            var runtime = UnityEngine.Object.FindAnyObjectByType<Gs2HolderRuntimeContextProvider>();
            if (runtime == null || !runtime.TryGet(out var gs2, out var session) ||
                gs2 == null || session == null)
            {
                report("The GS2 runtime context is not available.");
                return false;
            }

            var login = UnityEngine.Object.FindAnyObjectByType<Gs2AutoLoginAction>();
            if (login == null || string.IsNullOrEmpty(login.accountNamespace))
            {
                report("The scene names no account namespace to advance the clock in.");
                return false;
            }

            // Read afresh: another demo on the same account may have moved the
            // clock since this page last looked, and an advance from a stale
            // offset would move it back.
            var userId = session.UserId;
            if (!await DemoTimeOffset.Read())
            {
                report("The demo clock could not be read from GS2, so it was not moved. Try again in a moment.");
                return false;
            }
            var next = (long)DemoTimeOffset.Get(userId) + seconds;
            if (next > DemoTimeOffset.MaxSeconds)
            {
                report("The demo clock is already as far ahead as GS2 allows (ten years).");
                return false;
            }

            try
            {
                await gs2.Super.Account
                    .Namespace(login.accountNamespace)
                    .Account(userId)
                    .UpdateTimeOffsetAsync(new UpdateTimeOffsetRequest().WithTimeOffset((int)next));
            }
            catch (Gs2Exception error)
            {
                failed(error);
                Debug.LogError($"{nameof(DemoClockAdvance)}: advancing failed: {error}");
                return false;
            }
            catch (Exception error)
            {
                report($"Advancing the clock failed: {error.Message}");
                Debug.LogError($"{nameof(DemoClockAdvance)}: advancing failed: {error}");
                return false;
            }

            // The account has the new offset whatever happens next, so it is
            // stored before the session is refreshed.
            DemoTimeOffset.Set(userId, (int)next);

            try
            {
                await session.RefreshAsync();
            }
            catch (Exception error)
            {
                report(
                    "The clock moved forward, but signing in again failed, so this page still " +
                    "runs on the old time. Reload the page: the next sign-in carries the new offset.");
                Debug.LogError($"{nameof(DemoClockAdvance)}: refreshing the session failed: {error}");
                return false;
            }
            DemoTimeOffset.NotifyApplied(userId);
            return true;
        }
    }
}
