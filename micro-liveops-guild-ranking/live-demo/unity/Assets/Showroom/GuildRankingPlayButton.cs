#nullable enable

using System.Threading.Tasks;

using UnityEngine;

namespace GS2Studio.Showroom.Demo
{
    [AddComponentMenu("GS2 Studio/Showroom/Guild Season Play")]
    public sealed class GuildRankingPlayButton : ShowroomPressButton
    {
        protected override Task<string> Press() => GuildRankingSeasonState.Shared.Play();
    }
}
