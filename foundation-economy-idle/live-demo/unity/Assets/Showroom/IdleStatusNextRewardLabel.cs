// How long until the next interval pays.
//
// Worked out on the page from the idle time and the interval rather than read
// from the status: GS2's own next-reward time is measured from now rather than
// from the interval boundary, so it does not say when the next reward comes.
#nullable enable

using UnityEngine;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>"Next reward in 40 min", or that the cap has stopped the count.</summary>
    [AddComponentMenu("GS2 Studio/Showroom/Next Idle Reward")]
    public sealed class IdleStatusNextRewardLabel : IdlePredictionLabel
    {
        internal override string Format(IdlePrediction prediction)
        {
            var interval = prediction.RewardIntervalMinutes;
            var idle = prediction.IdleMinutes;
            if (prediction.MaximumIdleMinutes > 0 && idle >= prediction.MaximumIdleMinutes)
                return "No more rewards build up until you receive";
            if (interval <= 0) return "";
            return $"Next reward in about {Duration(interval - idle % interval)}";
        }
    }
}
