#nullable enable

using UnityEngine;

namespace GS2Studio.Showroom.Demo
{
    [AddComponentMenu("GS2 Studio/Showroom/Advance One Day")]
    public sealed class LoginRewardCollectionAdvanceOneDayButton : DemoClockAdvanceButton
    {
        protected override int Seconds => 24 * 60 * 60;
    }
}
