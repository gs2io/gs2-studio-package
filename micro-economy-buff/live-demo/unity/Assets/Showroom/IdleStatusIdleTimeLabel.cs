// How long the player has been away, against the cap.
#nullable enable

using UnityEngine;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>"Away 3 h 20 min of 8 h", and "(full)" once the cap is reached.</summary>
    [AddComponentMenu("GS2 Studio/Showroom/Idle Time")]
    public sealed class IdleStatusIdleTimeLabel : IdlePredictionLabel
    {
        internal override string Format(IdlePrediction prediction)
        {
            var idle = prediction.IdleMinutes;
            var maximum = prediction.MaximumIdleMinutes;
            var full = maximum > 0 && idle >= maximum ? " (full: receive to start counting again)" : "";
            return $"Away {Duration(idle)} of {Duration(maximum)}{full}";
        }
    }
}
