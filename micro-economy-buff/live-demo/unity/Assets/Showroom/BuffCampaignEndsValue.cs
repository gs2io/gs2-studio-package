// When the campaign ends, for the page to count down to.
//
// Handed over as a `DateTime`, which the page draws as time left. The end is
// the campaign trigger's, moved from the demo clock onto this device's; with no
// campaign running the deadline is left unset.
#nullable enable

using System;

using UnityEngine;
using UnityEngine.Events;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>Publishes when the campaign ends, whenever it may have changed.</summary>
    [AddComponentMenu("GS2 Studio/Showroom/Campaign Ends")]
    public sealed class BuffCampaignEndsValue : MonoBehaviour
    {
        [SerializeField] private UnityEvent<DateTime> _onUpdate = new UnityEvent<DateTime>();

        public UnityEvent<DateTime> OnUpdate => _onUpdate;

        private BuffCampaignState? _campaign;

        private void OnEnable()
        {
            _campaign = BuffCampaignState.Shared;
            _campaign.Updated += Publish;
            Publish();
        }

        private void OnDisable()
        {
            if (_campaign != null) _campaign.Updated -= Publish;
        }

        private void Publish()
        {
            if (_campaign == null) return;
            _onUpdate.Invoke(_campaign.EndsAt ?? default);
        }
    }
}
