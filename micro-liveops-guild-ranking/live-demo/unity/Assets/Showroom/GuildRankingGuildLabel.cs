// Which season it is and which guild the visitor's plays count for, as one line.
#nullable enable

using UnityEngine;
using UnityEngine.Events;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>The season and the visitor's guild, or what is missing to play.</summary>
    [AddComponentMenu("GS2 Studio/Showroom/Guild Season Guild")]
    public sealed class GuildRankingGuildLabel : MonoBehaviour
    {
        [SerializeField] private UnityEvent<string> _onUpdate = new UnityEvent<string>();

        public UnityEvent<string> OnUpdate => _onUpdate;

        private GuildRankingSeasonState? _season;

        private void OnEnable()
        {
            _season = GuildRankingSeasonState.Shared;
            _season.Updated += Publish;
            Publish();
        }

        private void OnDisable()
        {
            if (_season != null) _season.Updated -= Publish;
        }

        private void Publish()
        {
            if (_season == null) return;
            var season = _season.Season == null
                ? _season.SeasonProblem ?? "Reading the season..."
                : $"Season {_season.Season}" +
                  (_season.SeasonEndsAt != null ? $", ends {GuildRankingDemo.Utc(_season.SeasonEndsAt.Value)}." : ".");
            var guild = !_season.GuildKnown
                ? "Reading your guild..."
                : _season.GuildId == null
                    ? "You are not in a guild: found or join one above to play."
                    : $"Your plays count for {_season.GuildDisplayName ?? "your guild"}.";
            _onUpdate.Invoke($"{season} {guild}");
        }
    }
}
