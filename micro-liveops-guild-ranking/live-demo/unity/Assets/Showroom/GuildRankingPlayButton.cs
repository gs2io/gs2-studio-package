// Plays once: adds a score to the visitor's total for the season, in their guild.
#nullable enable

using System.Threading.Tasks;

using UnityEngine;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>Plays once for the visitor's guild.</summary>
    [AddComponentMenu("GS2 Studio/Showroom/Guild Season Play")]
    public sealed class GuildRankingPlayButton : ShowroomPressButton
    {
        protected override Task<string> Press() => GuildRankingSeasonState.Shared.Play();
    }
}
