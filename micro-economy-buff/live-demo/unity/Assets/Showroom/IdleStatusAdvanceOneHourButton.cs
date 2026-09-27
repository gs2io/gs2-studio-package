// Moves the player's clock forward one hour: one idle interval's worth.
#nullable enable

using UnityEngine;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>Moves the signed-in player's clock on GS2 forward one hour.</summary>
    [AddComponentMenu("GS2 Studio/Showroom/Advance One Hour")]
    public sealed class IdleStatusAdvanceOneHourButton : DemoClockAdvanceButton
    {
        protected override int Seconds => 60 * 60;
    }
}
