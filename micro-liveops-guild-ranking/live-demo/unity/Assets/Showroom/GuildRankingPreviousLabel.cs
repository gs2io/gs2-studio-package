// What an earlier season still pays the visitor, as one line.
#nullable enable

using UnityEngine;
using UnityEngine.Events;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>The latest season that is over and not yet received, or that none waits.</summary>
    [AddComponentMenu("GS2 Studio/Showroom/Guild Season Previous")]
    public sealed class GuildRankingPreviousLabel : MonoBehaviour
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
            if (!_season.PastKnown)
            {
                if (_season.PastProblem != null) _onUpdate.Invoke(_season.PastProblem);
                else if (_season.Season == null && _season.SeasonProblem != null) _onUpdate.Invoke("Past seasons are read once a season is open.");
                return;
            }
            var next = _season.Next;
            if (next == null)
            {
                _onUpdate.Invoke("Nothing to receive yet: a season pays once it is over, if you scored in it.");
                return;
            }
            var where = next.GuildDisplayName ?? "a guild that is gone";
            var rank = next.Rank != null ? $"rank {next.Rank}" : "unranked";
            var more = _season.MoreWaiting > 0 ? $" ({_season.MoreWaiting} earlier season(s) wait too)" : "";
            _onUpdate.Invoke($"Season {next.Season} in {where}: {rank} with {next.Score} points, ready to receive{more}");
        }
    }
}
