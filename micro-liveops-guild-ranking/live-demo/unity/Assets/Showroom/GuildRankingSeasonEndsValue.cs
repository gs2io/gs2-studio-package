// When the season being played turns over, for the page to count down to.
//
// Handed over as a `DateTime`, which the page draws as time left. It is the
// schedule event's current repeat end, the next 00:00 UTC; until the event has
// been read the deadline is left unset.
#nullable enable

using System;

using UnityEngine;
using UnityEngine.Events;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>Publishes when the season ends, whenever it may have changed.</summary>
    [AddComponentMenu("GS2 Studio/Showroom/Guild Season Ends")]
    public sealed class GuildRankingSeasonEndsValue : MonoBehaviour
    {
        [SerializeField] private UnityEvent<DateTime> _onUpdate = new UnityEvent<DateTime>();

        public UnityEvent<DateTime> OnUpdate => _onUpdate;

        private GuildRankingSeasonState? _season;
        private DateTime? _published;

        private void OnEnable()
        {
            _season = GuildRankingSeasonState.Shared;
            _season.Updated += Publish;
            _published = null;
            Publish();
        }

        private void OnDisable()
        {
            if (_season != null) _season.Updated -= Publish;
        }

        private void Publish()
        {
            if (_season == null) return;
            var endsAt = _season.SeasonEndsAt ?? default;
            if (_published == endsAt) return;
            _published = endsAt;
            _onUpdate.Invoke(endsAt);
        }
    }
}
