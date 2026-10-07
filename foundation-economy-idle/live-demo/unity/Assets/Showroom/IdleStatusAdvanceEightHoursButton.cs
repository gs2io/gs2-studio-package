#nullable enable

using UnityEngine;

namespace GS2Studio.Showroom.Demo
{
    [AddComponentMenu("GS2 Studio/Showroom/Advance Eight Hours")]
    public sealed class IdleStatusAdvanceEightHoursButton : DemoClockAdvanceButton
    {
        protected override int Seconds => 8 * 60 * 60;
    }
}
