#nullable enable

using UnityEngine;
using UnityEngine.Events;

namespace GS2Studio.Showroom.Demo
{
    [AddComponentMenu("GS2 Studio/Showroom/Campaign Status")]
    public sealed class BuffCampaignStatusLabel : MonoBehaviour
    {
        [SerializeField] private UnityEvent<string> _onUpdate = new UnityEvent<string>();

        public UnityEvent<string> OnUpdate => _onUpdate;

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
            if (_campaign == null || !_campaign.HasValue) return;
            _onUpdate.Invoke(_campaign.Active
                ? "Running: idle rewards are doubled when you receive"
                : "No campaign running");
        }
    }
}
