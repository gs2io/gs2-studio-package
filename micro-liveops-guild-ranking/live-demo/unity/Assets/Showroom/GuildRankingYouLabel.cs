#nullable enable

using UnityEngine;
using UnityEngine.Events;

namespace GS2Studio.Showroom.Demo
{
    [AddComponentMenu("GS2 Studio/Showroom/Guild Season You")]
    public sealed class GuildRankingYouLabel : MonoBehaviour
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
            if (!_season.GuildKnown)
            {
                _onUpdate.Invoke("Reading your guild...");
                return;
            }
            if (_season.GuildId == null)
            {
                _onUpdate.Invoke("Not in a guild");
                return;
            }
            if (_season.Season == null)
            {
                _onUpdate.Invoke("No season is open, so there is nothing to rank yet");
                return;
            }
            if (!_season.StandingKnown)
            {
                _onUpdate.Invoke("Reading your guild's board...");
                return;
            }
            // A truncated board cannot provide a total player count; show a lower bound while another page exists.
            var scored = _season.BoardHasMore
                ? $"more than {GuildRankingSeasonState.BoardSize}"
                : _season.Board.Length.ToString();
            _onUpdate.Invoke(_season.Total == null
                ? "Not on your guild's board yet this season"
                : _season.Rank != null
                    ? $"Rank {_season.Rank} in your guild ({scored} scored so far), with {_season.Total} points"
                    : $"{_season.Total} points this season");
        }
    }
}
