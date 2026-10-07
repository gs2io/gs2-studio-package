// Publish the default deadline when no future end is known so the countdown clears its previous value.
#nullable enable

using System;

using UnityEngine;
using UnityEngine.Events;

namespace GS2Studio.Showroom.Demo
{
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
