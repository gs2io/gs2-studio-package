#nullable disable
using System;
using UnityEngine;
using UnityEngine.UI;

namespace GS2Studio.Showroom
{
    [AddComponentMenu("GS2 Studio/Showroom/Showroom Countdown")]
    public sealed class ShowroomCountdown : MonoBehaviour
    {
        // Epoch and zero timestamps mean no deadline, not a countdown that already ended.
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
