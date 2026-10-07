#nullable enable

using UnityEngine;

namespace GS2Studio.Showroom.Demo
{
    [AddComponentMenu("GS2 Studio/Showroom/Idle Rewards Ready")]
    public sealed class IdleStatusToReceiveLabel : IdlePredictionLabel
    {
        internal override string Format(IdlePrediction prediction)
        {
            var interval = prediction.RewardIntervalMinutes;
            var partial = interval > 0 ? prediction.IdleMinutes % interval : 0;
            var dropped = partial > 0 ? $" (receiving now drops {Duration(partial)})" : "";
            return prediction.ClaimableCoins > 0
                ? $"{prediction.ClaimableCoins} coins{dropped}"
                : $"Nothing yet{dropped}";
        }
    }
}
