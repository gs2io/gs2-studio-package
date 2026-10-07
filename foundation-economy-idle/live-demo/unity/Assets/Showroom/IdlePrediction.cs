// Read fresh prediction data because elapsed time can change rewards without a stored-status notification.
// Send the shared context stack so estimates include the currently applied buff.
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
    internal sealed class IdlePrediction : MonoBehaviour
    {
        private const string Namespace = "Idle";
        private const string Category = "Idle";

        private const float RefreshSeconds = 60f;

        /// <summary>Retry initial reads sooner so labels need not stay empty for the normal refresh interval.</summary>
        private const float FirstReadRetrySeconds = 5f;

        private static IdlePrediction? _instance;

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

        public event Action? Updated;

        public bool HasValue { get; private set; }

        public int MaximumIdleMinutes { get; private set; }

        public int RewardIntervalMinutes { get; private set; }

        public long ClaimableCoins { get; private set; }

        /// <summary>Advance the display between server reads; waiting for status events would freeze elapsed time.</summary>
        public int IdleMinutes
        {
            get
            {
                var started = IdleStartedAt;
                var idle = started != null
                    ? (int)Math.Floor((DateTime.UtcNow - started.Value).TotalMinutes)
                    : _readIdleMinutes + (int)((Time.realtimeSinceStartup - _readAt) / 60f);
                idle = Math.Max(0, idle);
                return MaximumIdleMinutes > 0 ? Math.Min(MaximumIdleMinutes, idle) : idle;
            }
        }

        /// <summary>Leave the countdown unset when the start is unknown or the cap prevents another reward.</summary>
        public DateTime? NextRewardAt
        {
            get
            {
                var started = IdleStartedAt;
                var interval = RewardIntervalMinutes;
                if (started == null || interval <= 0) return null;
                var idle = IdleMinutes;
                if (MaximumIdleMinutes > 0 && idle >= MaximumIdleMinutes) return null;
                return started.Value.AddMinutes((idle / interval + 1) * interval);
            }
        }

        /// <summary>Capped elapsed minutes no longer locate the real start, so infer it only below the cap.</summary>
        private DateTime? IdleStartedAt
        {
            get
            {
                var interval = RewardIntervalMinutes;
                if (_readNextRewardsAt <= 0 || interval <= 0) return null;
                if (MaximumIdleMinutes > 0 && _readIdleMinutes >= MaximumIdleMinutes) return null;
                // Wait for the account offset before converting the server timestamp to this device's clock.
                if (!DemoTimeOffset.TryGet(_userId, out var offset)) return null;
                return DateTimeOffset.FromUnixTimeMilliseconds(_readNextRewardsAt).UtcDateTime
                    .AddMinutes(-(interval + _readIdleMinutes))
                    .AddSeconds(-offset);
            }
        }

        private int _readIdleMinutes;
        private long _readNextRewardsAt;
        private string _userId = "";

        /// <summary>Space interval-crossing reads because the device can see the boundary before the server does.</summary>
        private float _crossingReadAt = float.NegativeInfinity;

        private const float CrossingReadSeconds = 3f;
        private float _readAt;

        private string? _readContextStack;
        private float _attemptedAt = float.NegativeInfinity;
        private float _intervalAttemptedAt = float.NegativeInfinity;
        private bool _reading;

        /// <summary>Keep a follow-up request when a read is in flight; its result may predate the clock or context change.</summary>
        private bool _readAgain;
        private Action? _unsubscribe;

        private readonly ShowroomInbox _inbox = new ShowroomInbox();

        private readonly ShowroomLatch _readFailures = new ShowroomLatch();

        private readonly ShowroomLatch _intervalFailures = new ShowroomLatch();

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
            _inbox.Clear();
        }

        private void Update()
        {
            _inbox.Drain();
        }

        private IEnumerator Run()
        {
            Gs2Domain? gs2;
            IGameSession? session;
            while (!ShowroomRuntime.TryGet(out gs2, out session))
            {
                yield return new WaitForSeconds(0.25f);
            }

            // Marshal subscription work through Update because the callback may run off the Unity thread.
            _unsubscribe = new Gs2Bind.Gs2Idle.StatusLoader(Namespace, Category).Subscribe(
                gs2, session, (_, _, _) => Task.CompletedTask, () => _inbox.Post(Read));
            ReadInterval();
            Read();

            var second = new WaitForSecondsRealtime(1f);
            while (true)
            {
                yield return second;
                var now = Time.realtimeSinceStartup;
                if (HasValue && ContextStackChanged()) Read();
                if (RewardIntervalMinutes <= 0 && now - _intervalAttemptedAt >= RefreshSeconds) ReadInterval();
                if (!HasValue)
                {
                    if (now - _attemptedAt >= FirstReadRetrySeconds) Read();
                    continue;
                }
                var crossed = RewardIntervalMinutes > 0 &&
                    IdleMinutes / RewardIntervalMinutes != _readIdleMinutes / RewardIntervalMinutes;
                if (crossed && now - _crossingReadAt >= CrossingReadSeconds)
                {
                    _crossingReadAt = now;
                    Read();
                }
                else if (now - _attemptedAt >= RefreshSeconds) Read();
                Updated?.Invoke();
            }
        }

        private void OnClockApplied(string userId)
        {
            Read();
            // Repeat the prediction after clock refresh to catch a change not visible to the immediate read.
            StartCoroutine(ReadAfter(3f));
        }

        private IEnumerator ReadAfter(float seconds)
        {
            yield return new WaitForSecondsRealtime(seconds);
            Read();
        }

        private async void ReadInterval()
        {
            if (!ShowroomRuntime.TryGet(out var gs2, out var session)) return;
            _intervalAttemptedAt = Time.realtimeSinceStartup;
            try
            {
                var category = await new Gs2Bind.Gs2Idle.CategoryModelLoader(Namespace, Category)
                    .Load(gs2, session);
                if (this == null || category == null) return;
                _intervalFailures.Succeeded();
                RewardIntervalMinutes = category.RewardIntervalMinutes;
                Updated?.Invoke();
            }
            catch (Exception error)
            {
                if (this != null) _intervalFailures.Fail("The idle category could not be read", error);
            }
        }

        private async void Read()
        {
            // Resolve the session again so reads do not keep credentials captured before a clock refresh.
            if (!ShowroomRuntime.TryGet(out var gs2, out var session)) return;
            if (_reading)
            {
                _readAgain = true;
                return;
            }
            _reading = true;
            _attemptedAt = Time.realtimeSinceStartup;
            var contextStack = gs2.Super.DefaultContextStack;
            try
            {
                var result = await new Gs2IdleRestClient(gs2.Super.RestSession).PredictionAsync(
                    new PredictionRequest()
                        .WithNamespaceName(Namespace)
                        .WithCategoryName(Category)
                        .WithAccessToken(session.AccessToken.Token)
                        .WithContextStack(contextStack));
                if (this == null) return;
                _readFailures.Succeeded();
                _readIdleMinutes = result?.Status?.IdleMinutes ?? 0;
                _readNextRewardsAt = result?.Status?.NextRewardsAt ?? 0;
                // Retain the response owner so later clock conversion uses that player's latest offset.
                _userId = session.UserId;
                // Record the context only after success so a failed read leaves its change detectable.
                _readContextStack = contextStack;
                MaximumIdleMinutes = result?.Status?.MaximumIdleMinutes ?? 0;
                ClaimableCoins = CoinsIn(result?.Items);
                _readAt = Time.realtimeSinceStartup;
                HasValue = true;
                Updated?.Invoke();
            }
            catch (Exception error)
            {
                if (this != null) _readFailures.Fail("The idle prediction could not be read", error);
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

        private static long CoinsIn(AcquireAction[]? actions)
        {
            long coins = 0;
            if (actions == null) return coins;
            foreach (var action in actions)
            {
                if (action?.Action != "Gs2Money2:DepositByUserId" || string.IsNullOrEmpty(action.Request)) continue;
                var request = JsonMapper.ToObject(action.Request);
                // A string-valued request wraps another JSON value; decode it before inspecting deposits.
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

        private bool ContextStackChanged()
        {
            return ShowroomRuntime.TryGet(out var gs2, out _) && gs2.Super.DefaultContextStack != _readContextStack;
        }
    }
}
