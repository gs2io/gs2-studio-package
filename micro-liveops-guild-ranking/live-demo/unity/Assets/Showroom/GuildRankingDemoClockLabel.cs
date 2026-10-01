// The guild ranking section's demo clock row: the time GS2 sees for this
// player once the demo has moved their clock, so a visitor who advances a day
// sees which side of the 00:00 UTC season turnover they are on. Everything but
// the row's name is `ShowroomDemoClockLabel`'s.
#nullable enable

using UnityEngine;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// Publishes the signed-in player's clock on GS2 (now, plus the offset
    /// their account has) as text.
    /// </summary>
    [AddComponentMenu("GS2 Studio/Showroom/Demo Clock")]
    public sealed class GuildRankingDemoClockLabel : ShowroomDemoClockLabel
    {
    }
}
