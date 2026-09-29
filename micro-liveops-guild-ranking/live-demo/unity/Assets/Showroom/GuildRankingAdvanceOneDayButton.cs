// Moves the player's clock forward one day: one season's worth.
//
// A season turns over at 00:00 UTC, and a visitor does not wait until then to
// see the season they played end and pay. The clock moves only for this
// visitor's account, so the season they play in from here on is one their
// guildmates have not reached yet.
#nullable enable

using UnityEngine;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>Moves the signed-in player's clock on GS2 forward one day.</summary>
    [AddComponentMenu("GS2 Studio/Showroom/Advance One Day")]
    public sealed class GuildRankingAdvanceOneDayButton : DemoClockAdvanceButton
    {
        protected override int Seconds => 24 * 60 * 60;
    }
}
