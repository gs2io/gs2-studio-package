// A deadline, read as time left.
//
// A generated `value` component hands the page a `DateTime` rather than a
// string, precisely so the page can decide how a deadline reads. This is how
// the showroom reads every one of them: as the time remaining until it, in
// days when there are days, ticking down while the page is open, and as the
// two words that are not a time — "not set" before a deadline has been given
// and "ended" once it has passed.
//
// A demo that needs a deadline to do something — credit a recovery when it
// arrives, say — writes a behaviour of its own taking `SetDeadline(DateTime)`,
// and the page builder wires the same reading into it beside this one. This
// behaviour draws; it does not decide.
#nullable disable
using System;
using UnityEngine;
using UnityEngine.UI;

namespace GS2Studio.Showroom
{
    [AddComponentMenu("GS2 Studio/Showroom/Showroom Countdown")]
    public sealed class ShowroomCountdown : MonoBehaviour
    {
        /// <summary>
        /// The earliest deadline that means anything. GS2 hands back the epoch
        /// or a zero timestamp for a deadline nobody has set, and neither is a
        /// moment a visitor is waiting for.
        /// </summary>
        private static readonly DateTime Unset = new DateTime(2000, 1, 1, 0, 0, 0, DateTimeKind.Utc);

        [SerializeField] private Text _label;

        private DateTime _deadline;
        private bool _known;

        public void SetDeadline(DateTime deadline)
        {
            _deadline = deadline.ToUniversalTime();
            _known = _deadline > Unset;
            Render();
        }

        private void Update() => Render();

        private void Render()
        {
            if (_label == null) return;
            if (!_known)
            {
                _label.text = "not set";
                return;
            }
            var remaining = _deadline - DateTime.UtcNow;
            if (remaining <= TimeSpan.Zero)
            {
                _label.text = "ended";
                return;
            }
            _label.text = remaining.TotalDays >= 1
                ? $"{(int)remaining.TotalDays}d {remaining.Hours:00}:{remaining.Minutes:00}:{remaining.Seconds:00}"
                : $"{(int)remaining.TotalHours:00}:{remaining.Minutes:00}:{remaining.Seconds:00}";
        }
    }
}
