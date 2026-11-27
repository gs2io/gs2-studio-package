#nullable disable
using System;
using UnityEngine;
using UnityEngine.UI;

using Gs2.Unity.Util;
using Gs2Bind.Clock;

namespace GS2Studio.Showroom
{
    // Counts on GS2's clock for the page's session, which the demo clock advance shifts by the account's time offset.
    [AddComponentMenu("GS2 Studio/Showroom/Showroom Countdown")]
    public sealed class ShowroomCountdown : MonoBehaviour
    {
        [SerializeField] private Text _label;

        private Gs2Countdown _countdown;
        private IGameSession _session;
        private DateTime? _deadline;

        // Until a producer sends a deadline, say there is none rather than keep the row's placeholder.
        private void OnEnable()
        {
            if (!_deadline.HasValue) Render(null);
        }

        /// <summary>Counts down to a deadline on GS2's clock, as GS2 stamps it; the epoch or earlier is no deadline.</summary>
        public void SetDeadline(DateTime deadline)
        {
            _deadline = deadline;
            Restart();
        }

        // Until the page has a session, the count is on UTC alone; start again on the session's clock once it has one.
        private void Update()
        {
            if (_deadline.HasValue && _session == null && ShowroomRuntime.TryGet(out _, out _)) Restart();
            _countdown?.Poll();
        }

        private void Restart()
        {
            _session = ShowroomRuntime.TryGet(out _, out var session) ? session : null;
            _countdown ??= new Gs2Countdown(Render);
            _countdown.Start(_session, _deadline);
        }

        // Gs2Countdown reports no time (GS2's 0 or the epoch) as null and stops after reporting zero.
        private void Render(TimeSpan? remaining)
        {
            if (_label == null) return;
            _label.text = !remaining.HasValue ? "not set"
                : remaining.Value <= TimeSpan.Zero ? "ended"
                : Gs2SessionClock.Format(remaining.Value);
        }
    }
}
