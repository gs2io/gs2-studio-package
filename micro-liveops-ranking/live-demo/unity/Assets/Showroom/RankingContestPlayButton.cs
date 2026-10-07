#nullable enable

using System.Threading.Tasks;

using UnityEngine;

namespace GS2Studio.Showroom.Demo
{
    [AddComponentMenu("GS2 Studio/Showroom/Contest Play")]
    public sealed class RankingContestPlayButton : ShowroomPressButton
    {
        protected override Task<string> Press() => RankingContestState.Shared.Play();
    }
}
