// The shared countdown uses the device clock; publish the account-offset-adjusted deadline, or default to clear it.
#nullable enable

using System;

using UnityEngine;
using UnityEngine.Events;

namespace GS2Studio.Showroom.Demo
{
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
            var endsAt = _season.SeasonEndsOnDevice ?? default;
            if (_published == endsAt) return;
            _published = endsAt;
            _onUpdate.Invoke(endsAt);
        }
    }
}
