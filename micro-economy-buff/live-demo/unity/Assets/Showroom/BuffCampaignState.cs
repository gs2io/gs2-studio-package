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
// its window runs out, and when the demo clock has moved. The trigger is read
// from the REST client every few seconds, which is what notices Start and End
// campaign: both are exchanges run on the server, and nothing tells the page.
//
// Nothing here reloads or invalidates anything.
#nullable enable

using System;
using System.Collections;
using System.Threading.Tasks;

using UnityEngine;

using Gs2.Core.Exception;
using Gs2.Gs2Buff;
using Gs2.Gs2Buff.Request;
using Gs2.Gs2Schedule;
using Gs2.Gs2Schedule.Request;
using Gs2.Unity.Core;
using Gs2.Unity.Util;

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

        /// <summary>How often the trigger is read.</summary>
        private const float PollSeconds = 3f;

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
        /// runs.
        /// </summary>
        public DateTime? EndsAt
        {
            get
            {
                if (_triggerExpiresAt <= 0) return null;
                var ends = DateTimeOffset.FromUnixTimeMilliseconds(_triggerExpiresAt).UtcDateTime
                    .AddSeconds(-DemoTimeOffset.Get(_userId));
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

        private void OnEnable()
        {
            DemoTimeOffset.Applied += OnClockApplied;
            StartCoroutine(Run());
        }

        private void OnDisable()
        {
            DemoTimeOffset.Applied -= OnClockApplied;
        }

        private IEnumerator Run()
        {
            while (!TryRuntime(out _, out _))
            {
                yield return new WaitForSeconds(0.25f);
            }
            ReadTrigger();
            Apply();

            var poll = new WaitForSecondsRealtime(PollSeconds);
            while (true)
            {
                yield return poll;
                ReadTrigger();
                // The window ran out on its own: the stack still carries the
                // buff until it is applied again. This device's clock may run
                // ahead of the server's, so GS2 can still find the buff active;
                // it is asked again every poll until it says otherwise.
                if (_triggerExpiresAt > 0 && EndsAt == null && Active) Apply();
                Updated?.Invoke();
            }
        }

        private void OnClockApplied(string userId)
        {
            ReadTrigger();
            Apply();
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
                expiresAt = 0;
            }
            catch (Exception error)
            {
                Debug.LogError($"{nameof(BuffCampaignState)}: the campaign trigger could not be read: {error}");
                return;
            }
            if (this == null) return;
            _userId = session.UserId;
            if (expiresAt == _triggerExpiresAt) return;
            _triggerExpiresAt = expiresAt;
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
                Updated?.Invoke();
            }
            catch (Exception error)
            {
                Debug.LogError($"{nameof(BuffCampaignState)}: the buff could not be applied: {error}");
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
