#nullable enable

using System.Threading.Tasks;

using UnityEngine;

namespace GS2Studio.Showroom.Demo
{
    [AddComponentMenu("GS2 Studio/Showroom/Contest Receive")]
    public sealed class RankingContestReceiveButton : ShowroomPressButton
    {
        protected override Task<string> Press() => RankingContestState.Shared.Receive();
    }
}
