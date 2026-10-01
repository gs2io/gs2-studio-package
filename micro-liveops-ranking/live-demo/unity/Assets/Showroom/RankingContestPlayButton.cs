// Plays once: a score from 1 to the ranking's limit, kept only if it beats the
// visitor's best.
#nullable enable

using System.Threading.Tasks;

using UnityEngine;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>Plays once while the visitor's contest is open.</summary>
    [AddComponentMenu("GS2 Studio/Showroom/Contest Play")]
    public sealed class RankingContestPlayButton : ShowroomPressButton
    {
        protected override Task<string> Press() => RankingContestState.Shared.Play();
    }
}
