// The campaign's state, and the buff it grants applied to the page's session.
//
// GS2 hands a player the buffs active now as a signed context stack; the
// client sends it with later requests and the services scale what they pay by
// it. The SDK's own apply builds a whole new GS2 domain around the stack, so
// the stack is asked for straight from the REST client and set as the default
// on the page's one domain, where every call, the generated Receive included,
// picks it up.
//
// A buff is judged active when it is applied, and it stays in the stack until
// the moment it was active until. So the buff is applied again whenever that
// can have changed: at sign-in, when the campaign trigger starts or ends, when
// its window runs out, and when the demo clock has moved.
//
// Start and End campaign are exchanges run on the server, and nothing tells
// the page, so the trigger is read from the REST client. A trigger that is not
// pulled answers NotFound, which is the settled "no campaign" rather than a
// failure: nothing but a press changes it. So it is read when the page starts,
// in the moments after this page's own Start or End press, after the clock
// moved, and otherwise only now and then, for a press on another page signed
// in to the same account. The window running out needs no read: its end is
// known and checked against the clock every second.
//
// Nothing here reloads or invalidates anything.
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
    /// <summary>
    /// Whether the campaign runs and when it ends, kept current for the page's
    /// labels, with the buff applied to match. One per page, made by the first
    /// label that asks.
    /// </summary>
    internal sealed class BuffCampaignState : MonoBehaviour
    {
        /// <summary>The buff namespace the feature package deploys.</summary>
        private const string BuffNamespace = "Buff";

        /// <summary>The schedule namespace and the trigger that opens the campaign.</summary>
        private const string ScheduleNamespace = "Schedule";
        private const string Trigger = "happy-hour";

        /// <summary>
        /// How often the trigger is read when nothing on this page can have
        /// changed it: a press on another page signed in to the same account.
        /// </summary>
        private const float BackstopSeconds = 60f;

        /// <summary>
        /// A press is read at once and then <see cref="PressReads"/> more
        /// times, <see cref="PressReadSeconds"/> apart. The exchange behind a
        /// press finishes on the server, so the first read after it can come
        /// too early; the reads stop once one sees the trigger move.
        /// </summary>
        private const float PressReadSeconds = 2f;
        private const int PressReads = 2;

        /// <summary>
        /// How often the buff is applied again while the window has run out on
        /// this device's clock but GS2 still finds the buff active.
        /// </summary>
        private const float ExpiredApplySeconds = 3f;

        private static BuffCampaignState? _instance;

        /// <summary>The page's campaign, made on first use.</summary>
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

        /// <summary>Raised whenever what the labels show may have changed.</summary>
        public event Action? Updated;

        /// <summary>Whether the buff has been applied once yet.</summary>
        public bool HasValue { get; private set; }

        /// <summary>Whether the buff is in the page's session now.</summary>
        public bool Active { get; private set; }

        /// <summary>
        /// When the campaign ends, on this device's clock, or null while none
        /// runs or the account's clock offset is not read yet.
        /// </summary>
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

        /// <summary>The trigger's end on the demo clock, in milliseconds, or 0 without one.</summary>
        private long _triggerExpiresAt;

        private string _userId = "";
        private bool _applying;
        private bool _applyAgain;
        private bool _readingTrigger;
        private bool _readTriggerAgain;

        /// <summary>When the trigger is read next, on the realtime clock.</summary>
        private float _nextTriggerRead;

        /// <summary>How many of the reads that follow a press are still to come.</summary>
        private int _pressReadsLeft;

        private float _nextExpiredApply;

        /// <summary>Set while a failure has been logged, so a lasting one is logged once.</summary>
        private bool _triggerFailureLogged;
        private bool _applyFailureLogged;

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
            while (!TryRuntime(out _, out session))
            {
                yield return new WaitForSeconds(0.25f);
            }
            _userId = session!.UserId;
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
                // The window ran out on its own: the stack still carries the
                // buff until it is applied again. This device's clock may run
                // ahead of the server's, so GS2 can still find the buff active;
                // it is asked again every few seconds until it says otherwise.
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

        /// <summary>
        /// Hears the page's Start and End campaign buttons, which are the
        /// presses on this page that move the trigger.
        /// </summary>
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

        /// <summary>The account's clock offset was read: the window's end on this device moved.</summary>
        private void OnOffsetLoaded(string userId)
        {
            if (userId == _userId) Updated?.Invoke();
        }

        /// <summary>
        /// Reads the campaign trigger, and applies the buff again when it has
        /// started, ended or moved. One read is out at a time; asking during it
        /// makes one more when it returns, so an older answer cannot land last.
        /// </summary>
        private async void ReadTrigger()
        {
            if (!TryRuntime(out var gs2, out var session)) return;
            if (_readingTrigger)
            {
                _readTriggerAgain = true;
                return;
            }
            _readingTrigger = true;
            try
            {
                await ReadTriggerOnce(gs2!, session!);
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
            // The next read is due on the backstop, or sooner while a press
            // is settling; a read that fails waits for the backstop too.
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
                // Not pulled: no campaign, until a press pulls it.
                expiresAt = 0;
            }
            catch (Exception error)
            {
                if (!_triggerFailureLogged)
                {
                    _triggerFailureLogged = true;
                    Debug.LogError($"{nameof(BuffCampaignState)}: the campaign trigger could not be read: {error}");
                }
                return;
            }
            if (this == null) return;
            _triggerFailureLogged = false;
            _userId = session.UserId;
            if (expiresAt == _triggerExpiresAt) return;
            _triggerExpiresAt = expiresAt;
            // The press has landed; the rest of its reads are not needed.
            _pressReadsLeft = 0;
            _nextTriggerRead = Time.realtimeSinceStartup + BackstopSeconds;
            Apply();
            Updated?.Invoke();
        }

        /// <summary>
        /// Asks GS2 for the buffs active now and sets them as the page's
        /// default context stack. One apply is out at a time; asking during it
        /// makes one more when it returns, since the first may predate the
        /// change that asked.
        /// </summary>
        private async void Apply()
        {
            if (!TryRuntime(out var gs2, out var session)) return;
            if (_applying)
            {
                _applyAgain = true;
                return;
            }
            _applying = true;
            try
            {
                var result = await new Gs2BuffRestClient(gs2!.Super.RestSession).ApplyBuffAsync(
                    new ApplyBuffRequest()
                        .WithNamespaceName(BuffNamespace)
                        .WithAccessToken(session!.AccessToken.Token));
                if (this == null) return;
                gs2.Super.DefaultContextStack = result?.NewContextStack;
                Active = result?.Items != null && result.Items.Length > 0;
                HasValue = true;
                _applyFailureLogged = false;
                Updated?.Invoke();
            }
            catch (Exception error)
            {
                if (!_applyFailureLogged)
                {
                    _applyFailureLogged = true;
                    Debug.LogError($"{nameof(BuffCampaignState)}: the buff could not be applied: {error}");
                }
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

        private static bool TryRuntime(out Gs2Domain? gs2, out IGameSession? session)
        {
            gs2 = null;
            session = null;
            var runtime = FindAnyObjectByType<GS2Studio.Generated.Runtime.Gs2HolderRuntimeContextProvider>();
            return runtime != null && runtime.TryGet(out gs2, out session) && gs2 != null && session != null;
        }
    }
}
