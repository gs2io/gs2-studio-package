// Receives the reward for the visitor's rank once their contest is over.
#nullable enable

using System.Threading.Tasks;

using UnityEngine;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>Receives the contest reward for the visitor's rank.</summary>
    [AddComponentMenu("GS2 Studio/Showroom/Contest Receive")]
    public sealed class RankingContestReceiveButton : ShowroomPressButton
    {
        protected override Task<string> Press() => RankingContestState.Shared.Receive();
    }
}
