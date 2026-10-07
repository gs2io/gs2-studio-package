// Other pages share this account, so a cached offset may be stale. Authentication returns
// the current account offset without replacing this page's session token.
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
    internal static class DemoTimeOffset
    {
        public const int MaxSeconds = 315360000;

        private const float RetrySeconds = 30f;

        // Server reads must wait for Applied to use the new clock.
        public static event Action<string>? Changed;

        // Requests use the old token until refresh succeeds, even after Changed fires.
        public static event Action<string>? Applied;

        // Loading an account offset does not refresh this page's token; do not treat it as Applied.
        public static event Action<string>? Loaded;

        private static string? _userId;
        private static int _seconds;
        private static Task<bool>? _reading;
        private static float _retryAt = float.NegativeInfinity;
        private static bool _failureLogged;

        public static bool Has(string userId) => userId.Length > 0 && _userId == userId;

        // Call TryGet when an unknown offset must not be mistaken for a confirmed zero.
        public static int Get(string userId) => Has(userId) ? _seconds : 0;

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

        public static void Set(string userId, int seconds)
        {
            _userId = userId;
            _seconds = seconds;
            Changed?.Invoke(userId);
        }

        public static void NotifyApplied(string userId)
        {
            Applied?.Invoke(userId);
        }

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
                // The request carried a password, so log codes and types without echoed text.
                return Failed(ShowroomErrors.Summary(error));
            }

            _retryAt = float.NegativeInfinity;
            _failureLogged = false;
            var changed = !Has(userId) || _seconds != seconds;
            _userId = userId;
            _seconds = seconds;
            if (changed) Loaded?.Invoke(userId);
            return true;
        }

        // Static state otherwise survives entering Play Mode with domain reload disabled.
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetOnPlay()
        {
            Changed = null;
            Applied = null;
            Loaded = null;
            _userId = null;
            _seconds = 0;
            _reading = null;
            _retryAt = float.NegativeInfinity;
            _failureLogged = false;
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
