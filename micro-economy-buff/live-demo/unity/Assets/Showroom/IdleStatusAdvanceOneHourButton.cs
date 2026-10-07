#nullable enable

using UnityEngine;

namespace GS2Studio.Showroom.Demo
{
    [AddComponentMenu("GS2 Studio/Showroom/Advance One Hour")]
    public sealed class IdleStatusAdvanceOneHourButton : DemoClockAdvanceButton
    {
        protected override int Seconds => 60 * 60;
    }
}
