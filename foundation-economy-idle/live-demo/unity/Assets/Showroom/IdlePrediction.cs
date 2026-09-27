// What the player's idle time has built up to, read from GS2 by hand.
//
// GS2-Idle does not store the idle time: it works it out from the clock each
// time the status is read. So the status the SDK caches never changes while
// time passes, and a bound label would show its first value for good. GS2's
// prediction does the working out on the server and returns the idle time and
// what Receive would pay right now; it is read here straight from the REST
// client, because the SDK's own prediction keeps only the rewards and does not
// cache the status either.
//
// Between reads the idle time is carried forward a minute at a time on the
// page, up to the cap, and read again when it crosses into a new interval (the
// rewards change there), when the demo clock has moved and the session carries
// it, when the status changes (Receive), and once a minute besides.
//
// Nothing here reloads or invalidates anything.
#nullable enable

using System;
using System.Collections;
using System.Threading.Tasks;

using Cysharp.Threading.Tasks;
using UnityEngine;

using Gs2.Core.Model;
using Gs2.Gs2Idle;
using Gs2.Gs2Idle.Request;
using Gs2.Unity.Core;
using Gs2.Unity.Util;
using Gs2.Util.LitJson;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// The player's idle time and what it would pay, kept current for the
    /// page's labels. One per page, made by the first label that asks.
    /// </summary>
    internal sealed class IdlePrediction : MonoBehaviour
    {
        /// <summary>The idle namespace and category the feature package deploys.</summary>
        private const string Namespace = "Idle";
        private const string Category = "Idle";

        /// <summary>How long a read stays trusted before it is made again.</summary>
        private const float RefreshSeconds = 60f;

        /// <summary>
        /// How soon to try again while nothing has been read yet. A read that
        /// fails after that waits the full <see cref="RefreshSeconds"/>, so a
        /// lasting failure is not asked every second.
        /// </summary>
        private const float FirstReadRetrySeconds = 5f;

        private static IdlePrediction? _instance;

        /// <summary>The page's one prediction, made on first use.</summary>
        public static IdlePrediction Shared
        {
            get
            {
                if (_instance == null)
                {
                    var host = new GameObject(nameof(IdlePrediction));
                    DontDestroyOnLoad(host);
                    _instance = host.AddComponent<IdlePrediction>();
                }
                return _instance;
            }
        }

        /// <summary>Raised whenever what the labels show may have changed, and once a second.</summary>
        public event Action? Updated;

        /// <summary>Whether a read has come back yet.</summary>
        public bool HasValue { get; private set; }

        /// <summary>How long a player may stay away and still be counting.</summary>
        public int MaximumIdleMinutes { get; private set; }

        /// <summary>How often being away pays, or 0 until the category is read.</summary>
        public int RewardIntervalMinutes { get; private set; }

        /// <summary>The free currency Receive would pay at the last read.</summary>
        public long ClaimableCoins { get; private set; }

        /// <summary>
        /// The idle time now: the last read, carried forward by the minutes
        /// since, up to the cap.
        /// </summary>
        public int IdleMinutes
        {
            get
            {
                var carried = _readIdleMinutes + (int)((Time.realtimeSinceStartup - _readAt) / 60f);
                return MaximumIdleMinutes > 0 ? Math.Min(MaximumIdleMinutes, carried) : carried;
            }
        }

        private int _readIdleMinutes;
        private float _readAt;
        private float _attemptedAt = float.NegativeInfinity;
        private float _intervalAttemptedAt = float.NegativeInfinity;
        private bool _reading;

        /// <summary>
        /// Set when a read is asked for while one is out. That read may have
        /// gone out on the old clock, so another follows it rather than the
        /// request being dropped.
        /// </summary>
        private bool _readAgain;
        private Action? _unsubscribe;

        private void OnEnable()
        {
            DemoTimeOffset.Applied += OnClockApplied;
            StartCoroutine(Run());
        }

        private void OnDisable()
        {
            DemoTimeOffset.Applied -= OnClockApplied;
            _unsubscribe?.Invoke();
            _unsubscribe = null;
        }

        private IEnumerator Run()
        {
            Gs2Domain? gs2;
            IGameSession? session;
            while (!TryRuntime(out gs2, out session))
            {
                yield return new WaitForSeconds(0.25f);
            }

            // Receive changes the stored status, and the SDK hears that.
            _unsubscribe = new Gs2Bind.Gs2Idle.StatusLoader(Namespace, Category).Subscribe(
                gs2!, session!, (_, _, _) => Task.CompletedTask, () => Read());
            ReadInterval();
            Read();

            var second = new WaitForSecondsRealtime(1f);
            while (true)
            {
                yield return second;
                var now = Time.realtimeSinceStartup;
                if (RewardIntervalMinutes <= 0 && now - _intervalAttemptedAt >= RefreshSeconds) ReadInterval();
                if (!HasValue)
                {
                    if (now - _attemptedAt >= FirstReadRetrySeconds) Read();
                    continue;
                }
                var crossed = RewardIntervalMinutes > 0 &&
                    IdleMinutes / RewardIntervalMinutes != _readIdleMinutes / RewardIntervalMinutes;
                if (crossed || now - _attemptedAt >= RefreshSeconds) Read();
                Updated?.Invoke();
            }
        }

        private void OnClockApplied(string userId)
        {
            Read();
        }

        private async void ReadInterval()
        {
            if (!TryRuntime(out var gs2, out var session)) return;
            _intervalAttemptedAt = Time.realtimeSinceStartup;
            try
            {
                var category = await new Gs2Bind.Gs2Idle.CategoryModelLoader(Namespace, Category)
                    .Load(gs2!, session!);
                if (this == null || category == null) return;
                RewardIntervalMinutes = category.RewardIntervalMinutes;
                Updated?.Invoke();
            }
            catch (Exception error)
            {
                Debug.LogError($"{nameof(IdlePrediction)}: the idle category could not be read: {error}");
            }
        }

        /// <summary>
        /// Asks GS2 for the idle time and the rewards now. One read is out at
        /// a time; asking during it makes one more when it returns.
        /// </summary>
        private async void Read()
        {
            // Resolved on every read: the session is the one signed in now.
            if (!TryRuntime(out var gs2, out var session)) return;
            if (_reading)
            {
                _readAgain = true;
                return;
            }
            _reading = true;
            _attemptedAt = Time.realtimeSinceStartup;
            try
            {
                var result = await new Gs2IdleRestClient(gs2!.Super.RestSession).PredictionAsync(
                    new PredictionRequest()
                        .WithNamespaceName(Namespace)
                        .WithCategoryName(Category)
                        .WithAccessToken(session!.AccessToken.Token));
                if (this == null) return;
                _readIdleMinutes = result?.Status?.IdleMinutes ?? 0;
                MaximumIdleMinutes = result?.Status?.MaximumIdleMinutes ?? 0;
                ClaimableCoins = CoinsIn(result?.Items);
                _readAt = Time.realtimeSinceStartup;
                HasValue = true;
                Updated?.Invoke();
            }
            catch (Exception error)
            {
                Debug.LogError($"{nameof(IdlePrediction)}: the idle prediction failed: {error}");
            }
            finally
            {
                _reading = false;
                if (_readAgain && this != null)
                {
                    _readAgain = false;
                    Read();
                }
            }
        }

        /// <summary>
        /// The free currency the rewards deposit. GS2 merges the deposits of
        /// every interval into one, so this is usually one action.
        /// </summary>
        private static long CoinsIn(AcquireAction[]? actions)
        {
            long coins = 0;
            if (actions == null) return coins;
            foreach (var action in actions)
            {
                if (action?.Action != "Gs2Money2:DepositByUserId" || string.IsNullOrEmpty(action.Request)) continue;
                var request = JsonMapper.ToObject(action.Request);
                // GS2 sometimes hands a request back encoded once more, as a
                // JSON string holding the object.
                if (request.IsString) request = JsonMapper.ToObject((string)request);
                if (!request.IsObject || !request.Keys.Contains("depositTransactions")) continue;
                var deposits = request["depositTransactions"];
                if (deposits == null || !deposits.IsArray) continue;
                foreach (JsonData deposit in deposits)
                {
                    if (deposit == null || !deposit.IsObject || !deposit.Keys.Contains("count")) continue;
                    var count = deposit["count"];
                    if (count != null && long.TryParse(count.ToString(), out var value)) coins += value;
                }
            }
            return coins;
        }

        private static bool TryRuntime(out Gs2Domain? gs2, out IGameSession? session)
        {
            gs2 = null;
            session = null;
            var runtime = FindAnyObjectByType<GS2Studio.Generated.Runtime.Gs2HolderRuntimeContextProvider>();
            return runtime != null && runtime.TryGet(out gs2, out session) && gs2 != null && session != null;
        }
    }
}
