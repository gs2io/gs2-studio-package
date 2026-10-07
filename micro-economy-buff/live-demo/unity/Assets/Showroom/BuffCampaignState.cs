// Apply the returned context stack to the shared domain so generated actions and manual predictions use the same buffs.
#nullable enable

using System;
using System.Collections;
using System.Collections.Generic;
using System.Threading.Tasks;

using UnityEngine;

using Gs2.Core.Exception;
using Gs2.Gs2Buff;
using Gs2.Gs2Buff.Request;
using Gs2.Gs2Schedule;
using Gs2.Gs2Schedule.Request;
using Gs2.Unity.Core;
using Gs2.Unity.Util;

using GS2Studio.Generated.BuffCampaign.UI;

namespace GS2Studio.Showroom.Demo
{
    internal sealed class BuffCampaignState : MonoBehaviour
    {
        private const string BuffNamespace = "Buff";

        private const string ScheduleNamespace = "Schedule";
        private const string Trigger = "happy-hour";

        /// <summary>Poll occasionally to observe campaign changes made from another page for the same account.</summary>
        private const float BackstopSeconds = 60f;

        /// <summary>Poll briefly after a press because its trigger change may not be visible on the first read.</summary>
        private const float PressReadSeconds = 2f;
        private const int PressReads = 2;

        private const float ExpiredApplySeconds = 3f;

        private static BuffCampaignState? _instance;

        public static BuffCampaignState Shared
        {
            get
            {
                if (_instance == null)
                {
                    var host = new GameObject(nameof(BuffCampaignState));
                    DontDestroyOnLoad(host);
                    _instance = host.AddComponent<BuffCampaignState>();
                }
                return _instance;
            }
        }

        public event Action? Updated;

        public bool HasValue { get; private set; }

        public bool Active { get; private set; }

        public DateTime? EndsAt
        {
            get
            {
                if (_triggerExpiresAt <= 0) return null;
                if (!DemoTimeOffset.TryGet(_userId, out var offset)) return null;
                var ends = DateTimeOffset.FromUnixTimeMilliseconds(_triggerExpiresAt).UtcDateTime
                    .AddSeconds(-offset);
                return ends > DateTime.UtcNow ? ends : null;
            }
        }

        /// <summary>Keep the server timestamp so a changed account offset can move the displayed deadline without another trigger read.</summary>
        private long _triggerExpiresAt;

        private string _userId = "";
        private bool _applying;
        private bool _applyAgain;
        private bool _readingTrigger;
        private bool _readTriggerAgain;

        private float _nextTriggerRead;

        private int _pressReadsLeft;

        private float _nextExpiredApply;

        private readonly ShowroomLatch _triggerFailures = new ShowroomLatch();
        private readonly ShowroomLatch _applyFailures = new ShowroomLatch();

        private readonly List<UnityEngine.Events.UnityEvent> _pressEvents = new List<UnityEngine.Events.UnityEvent>();

        private void OnEnable()
        {
            DemoTimeOffset.Applied += OnClockApplied;
            DemoTimeOffset.Loaded += OnOffsetLoaded;
            StartCoroutine(Run());
        }

        private void OnDisable()
        {
            DemoTimeOffset.Applied -= OnClockApplied;
            DemoTimeOffset.Loaded -= OnOffsetLoaded;
            foreach (var pressed in _pressEvents) pressed.RemoveListener(OnPressed);
            _pressEvents.Clear();
        }

        private IEnumerator Run()
        {
            IGameSession? session;
            while (!ShowroomRuntime.TryGet(out _, out session))
            {
                yield return new WaitForSeconds(0.25f);
            }
            _userId = session.UserId;
            ListenToPresses();
            DemoTimeOffset.TryGet(_userId, out _);
            ReadTrigger();
            Apply();

            var tick = new WaitForSecondsRealtime(1f);
            var wasRunning = EndsAt != null;
            while (true)
            {
                yield return tick;
                var now = Time.realtimeSinceStartup;
                if (now >= _nextTriggerRead) ReadTrigger();
                // Reapply while no future deadline is visible but the last result remains active; space retries to tolerate clock skew.
                if (_triggerExpiresAt > 0 && EndsAt == null && Active && now >= _nextExpiredApply)
                {
                    _nextExpiredApply = now + ExpiredApplySeconds;
                    Apply();
                }
                var running = EndsAt != null;
                if (running != wasRunning) Updated?.Invoke();
                wasRunning = running;
            }
        }

        private void ListenToPresses()
        {
            foreach (var button in FindObjectsByType<BuffCampaignStartCampaignButton>(
                         FindObjectsInactive.Include, FindObjectsSortMode.None))
            {
                Listen(button.OnCompleted);
            }
            foreach (var button in FindObjectsByType<BuffCampaignEndCampaignButton>(
                         FindObjectsInactive.Include, FindObjectsSortMode.None))
            {
                Listen(button.OnCompleted);
            }
        }

        private void Listen(UnityEngine.Events.UnityEvent pressed)
        {
            pressed.AddListener(OnPressed);
            _pressEvents.Add(pressed);
        }

        private void OnPressed()
        {
            _pressReadsLeft = PressReads;
            ReadTrigger();
        }

        private void OnClockApplied(string userId)
        {
            ReadTrigger();
            Apply();
        }

        private void OnOffsetLoaded(string userId)
        {
            if (userId == _userId) Updated?.Invoke();
        }

        /// <summary>Serialize reads and retain one follow-up so a request during an older read is not lost or completed out of order.</summary>
        private async void ReadTrigger()
        {
            if (!ShowroomRuntime.TryGet(out var gs2, out var session)) return;
            if (_readingTrigger)
            {
                _readTriggerAgain = true;
                return;
            }
            _readingTrigger = true;
            try
            {
                await ReadTriggerOnce(gs2, session);
            }
            finally
            {
                _readingTrigger = false;
                if (_readTriggerAgain && this != null)
                {
                    _readTriggerAgain = false;
                    ReadTrigger();
                }
            }
        }

        private async Task ReadTriggerOnce(Gs2Domain gs2, IGameSession session)
        {
            // Schedule before awaiting so failures retain the remaining press retries or the normal polling delay.
            if (_pressReadsLeft > 0)
            {
                _pressReadsLeft--;
                _nextTriggerRead = Time.realtimeSinceStartup + PressReadSeconds;
            }
            else
            {
                _nextTriggerRead = Time.realtimeSinceStartup + BackstopSeconds;
            }
            long expiresAt;
            try
            {
                var result = await new Gs2ScheduleRestClient(gs2.Super.RestSession).GetTriggerAsync(
                    new GetTriggerRequest()
                        .WithNamespaceName(ScheduleNamespace)
                        .WithTriggerName(Trigger)
                        .WithAccessToken(session.AccessToken.Token));
                expiresAt = result?.Item?.ExpiresAt ?? 0;
            }
            catch (NotFoundException)
            {
                // A missing trigger means no campaign; it is not a failed read to retry immediately.
                expiresAt = 0;
            }
            catch (Exception error)
            {
                if (this != null) _triggerFailures.Fail("The campaign trigger could not be read", error);
                return;
            }
            if (this == null) return;
            _triggerFailures.Succeeded();
            _userId = session.UserId;
            if (expiresAt == _triggerExpiresAt) return;
            _triggerExpiresAt = expiresAt;
            // A changed trigger satisfies the settling probe, so discard the remaining rapid reads.
            _pressReadsLeft = 0;
            _nextTriggerRead = Time.realtimeSinceStartup + BackstopSeconds;
            Apply();
            Updated?.Invoke();
        }

        /// <summary>Retain one follow-up apply because an in-flight result can predate the change that requested it.</summary>
        private async void Apply()
        {
            if (!ShowroomRuntime.TryGet(out var gs2, out var session)) return;
            if (_applying)
            {
                _applyAgain = true;
                return;
            }
            _applying = true;
            try
            {
                var result = await new Gs2BuffRestClient(gs2.Super.RestSession).ApplyBuffAsync(
                    new ApplyBuffRequest()
                        .WithNamespaceName(BuffNamespace)
                        .WithAccessToken(session.AccessToken.Token));
                if (this == null) return;
                gs2.Super.DefaultContextStack = result?.NewContextStack;
                Active = result?.Items != null && result.Items.Length > 0;
                HasValue = true;
                _applyFailures.Succeeded();
                Updated?.Invoke();
            }
            catch (Exception error)
            {
                if (this != null) _applyFailures.Fail("The buff could not be applied", error);
            }
            finally
            {
                _applying = false;
                if (_applyAgain && this != null)
                {
                    _applyAgain = false;
                    Apply();
                }
            }
        }
    }
}
