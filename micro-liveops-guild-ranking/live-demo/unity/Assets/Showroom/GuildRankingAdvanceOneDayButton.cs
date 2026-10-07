// Advance only this account to exercise season rollover; guildmates may still be playing an earlier season.
#nullable enable

using UnityEngine;

namespace GS2Studio.Showroom.Demo
{
    [AddComponentMenu("GS2 Studio/Showroom/Advance One Day")]
    public sealed class GuildRankingAdvanceOneDayButton : DemoClockAdvanceButton
    {
        protected override int Seconds => 24 * 60 * 60;
    }
}
