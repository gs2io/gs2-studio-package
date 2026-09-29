// Receives the reward for the latest season that is over and not yet received.
#nullable enable

using System.Threading.Tasks;

using UnityEngine;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>Receives a past season's reward for the visitor's rank in their guild.</summary>
    [AddComponentMenu("GS2 Studio/Showroom/Guild Season Receive")]
    public sealed class GuildRankingReceiveButton : GuildSeasonPress
    {
        private protected override Task<string> Press(GuildRankingSeasonState season) => season.Receive();
    }
}
