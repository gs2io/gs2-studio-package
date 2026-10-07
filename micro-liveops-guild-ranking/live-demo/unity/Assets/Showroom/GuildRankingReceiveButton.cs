#nullable enable

using System.Threading.Tasks;

using UnityEngine;

namespace GS2Studio.Showroom.Demo
{
    [AddComponentMenu("GS2 Studio/Showroom/Guild Season Receive")]
    public sealed class GuildRankingReceiveButton : ShowroomPressButton
    {
        protected override Task<string> Press() => GuildRankingSeasonState.Shared.Receive();
    }
}
