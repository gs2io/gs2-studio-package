// How far the demos have moved a player's clock.
//
// Shared by every demo that shows GS2 time on a moved clock: the label
// (`ShowroomDemoClockLabel`), the advance (`DemoClockAdvance`) and whatever
// a demo times against GS2 (a countdown, a season's end).
//
// GS2 keeps the offset on the account and carries it into every access token
// the account signs in with, so the server needs nothing from here. The page
// does: advancing adds to what the account already has, and every time the
// page shows (a clock, a countdown to something GS2 timed) is GS2's time less
// the offset.
//
// The account is shared by every demo served from the same origin, and any of
// them may have moved its clock, so the offset is read from the account itself
// rather than remembered by the page. No read-only call returns the account to
// a client, so it is read by signing in to the account service once more with
// the credentials the page signed in with: `Authentication` answers with the
// account, offset included. That also stamps the account's last sign-in time,
// which the demos do not use. It is read once per page, and again right before
// the clock is advanced, so an advance always adds to the account's latest
// offset.
//
// The page's own session carries the offset the account had when it signed
// in. Another page that advances the clock afterwards changes the account but
// not this page's token, so for a while the offset read here can be ahead of
// the one this page's requests carry. Advancing from this page signs it in
// again, which settles that.
#nullable enable

using System;
using System.Threading.Tasks;

using UnityEngine;

using Gs2.Gs2Account;
using Gs2.Gs2Account.Request;
using Gs2.Unity.Util;
using Gs2Bind.Gs2Account;

namespace GS2Studio.Showroom
{
    /// <summary>
    /// The time offset, in seconds, the signed-in player's account has on GS2.
    /// </summary>
    public static class DemoTimeOffset
    {
        /// <summary>
        /// The largest offset GS2 accepts: ten years, in seconds.
        /// </summary>
        public const int MaxSeconds = 315360000;

        /// <summary>How long to wait before reading the account again after a read failed.</summary>
        private const float RetrySeconds = 30f;

        /// <summary>
        /// Raised after <see cref="Set"/> stores a new offset, with the player
        /// it belongs to. The session signs in with it next; see
        /// <see cref="Applied"/>.
        /// </summary>
        public static event Action<string>? Changed;

        /// <summary>
        /// Raised once the session has signed in again with the new offset,
        /// with the player it belongs to. What the server reports from here on
        /// is on the new clock; before it, reads still go out on the old one.
        /// </summary>
        public static event Action<string>? Applied;

        /// <summary>
        /// Raised when the offset was read from the account and differs from
        /// what was known (including when nothing was), with the player it
        /// belongs to. The session already signed in with it, so nothing needs
        /// to be read again for it; only what is shown on this device's clock
        /// moves.
        /// </summary>
        public static event Action<string>? Loaded;

        private static string? _userId;
        private static int _seconds;
        private static Task<bool>? _reading;
        private static float _retryAt = float.NegativeInfinity;
        private static bool _failureLogged;

        /// <summary>Whether the player's offset is known yet.</summary>
        public static bool Has(string userId) => userId.Length > 0 && _userId == userId;

        /// <summary>
        /// The player's offset, or 0 while it is not known yet. Use
        /// <see cref="TryGet"/> where 0 would be taken for the answer.
        /// </summary>
        public static int Get(string userId) => Has(userId) ? _seconds : 0;

        /// <summary>
        /// The player's offset, when it is known. When it is not, a read from
        /// the account is started (at most one at a time, and not again soon
        /// after a failure) and <see cref="Loaded"/> is raised once it lands.
        /// </summary>
        public static bool TryGet(string userId, out int seconds)
        {
            if (Has(userId))
            {
                seconds = _seconds;
                return true;
            }
            seconds = 0;
            if (_reading == null && Time.realtimeSinceStartup >= _retryAt) _ = Read();
            return false;
        }

        /// <summary>
        /// Store the offset the player's account now has, and tell whoever
        /// shows it. Called once the account has taken it.
        /// </summary>
        public static void Set(string userId, int seconds)
        {
            _userId = userId;
            _seconds = seconds;
            Changed?.Invoke(userId);
        }

        /// <summary>
        /// Tell whoever reads the server that the session now carries the
        /// player's stored offset.
        /// </summary>
        public static void NotifyApplied(string userId)
        {
            Applied?.Invoke(userId);
        }

        /// <summary>
        /// Reads the signed-in player's offset from their account on GS2.
        /// Returns whether it was read; a read already out is joined rather
        /// than repeated. A failure is logged once until a read succeeds again.
        /// </summary>
        public static async Task<bool> Read()
        {
            if (_reading != null) return await _reading;
            _reading = ReadOnce();
            try
            {
                return await _reading;
            }
            finally
            {
                _reading = null;
            }
        }

        private static async Task<bool> ReadOnce()
        {
            if (!ShowroomRuntime.TryGet(out var gs2, out var session)) return false;
            var login = UnityEngine.Object.FindAnyObjectByType<Gs2AutoLoginAction>();
            var userId = session.UserId;
            if (login == null || string.IsNullOrEmpty(login.accountNamespace) ||
                login.userId != userId || string.IsNullOrEmpty(login.password))
            {
                return Failed("the scene holds no credentials for the signed-in account");
            }

            int seconds;
            try
            {
                var result = await new Gs2AccountRestClient(gs2.Super.RestSession).AuthenticationAsync(
                    new AuthenticationRequest()
                        .WithNamespaceName(login.accountNamespace)
                        .WithUserId(userId)
                        .WithPassword(login.password)
                        .WithKeyId(new AccountSetting().keyId));
                seconds = result?.Item?.TimeOffset ?? 0;
            }
            catch (Exception error)
            {
                return Failed($"{error.GetType().Name}: {error.Message}");
            }

            _retryAt = float.NegativeInfinity;
            _failureLogged = false;
            var changed = !Has(userId) || _seconds != seconds;
            _userId = userId;
            _seconds = seconds;
            if (changed) Loaded?.Invoke(userId);
            return true;
        }

        private static bool Failed(string reason)
        {
            _retryAt = Time.realtimeSinceStartup + RetrySeconds;
            if (!_failureLogged)
            {
                _failureLogged = true;
                Debug.LogError($"{nameof(DemoTimeOffset)}: the account's time offset could not be read: {reason}");
            }
            return false;
        }
    }
}
