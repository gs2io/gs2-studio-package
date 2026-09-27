// Moves the player's clock forward eight hours: far enough to reach the cap.
#nullable enable

using UnityEngine;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>Moves the signed-in player's clock on GS2 forward eight hours.</summary>
    [AddComponentMenu("GS2 Studio/Showroom/Advance Eight Hours")]
    public sealed class IdleStatusAdvanceEightHoursButton : DemoClockAdvanceButton
    {
        protected override int Seconds => 8 * 60 * 60;
    }
}
