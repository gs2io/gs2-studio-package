// What Receive would pay right now.
#nullable enable

using UnityEngine;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// "Ready to receive: 30 coins", or that nothing has built up yet. Receive
    /// drops the minutes short of a full interval, so those are named too.
    /// </summary>
    [AddComponentMenu("GS2 Studio/Showroom/Idle Rewards Ready")]
    public sealed class IdleStatusClaimableLabel : IdlePredictionLabel
    {
        internal override string Format(IdlePrediction prediction)
        {
            var interval = prediction.RewardIntervalMinutes;
            var partial = interval > 0 ? prediction.IdleMinutes % interval : 0;
            var dropped = partial > 0 ? $" (receiving now drops {Duration(partial)})" : "";
            return prediction.ClaimableCoins > 0
                ? $"Ready to receive: {prediction.ClaimableCoins} coins{dropped}"
                : $"Nothing to receive yet{dropped}";
        }
    }
}
