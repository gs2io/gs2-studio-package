// Use the prediction's interval boundary so the countdown shares its cap and clock-offset rules.
// Publish the default deadline when no next reward is known so an earlier countdown is cleared.
#nullable enable

using System;

using UnityEngine;
using UnityEngine.Events;

namespace GS2Studio.Showroom.Demo
{
    [AddComponentMenu("GS2 Studio/Showroom/Next Idle Reward")]
    public sealed class IdleStatusNextRewardValue : MonoBehaviour
    {
        [SerializeField] private UnityEvent<DateTime> _onUpdate = new UnityEvent<DateTime>();

        public UnityEvent<DateTime> OnUpdate => _onUpdate;

        private IdlePrediction? _prediction;

        private void OnEnable()
        {
            _prediction = IdlePrediction.Shared;
            _prediction.Updated += Publish;
            Publish();
        }

        private void OnDisable()
        {
            if (_prediction != null) _prediction.Updated -= Publish;
        }

        private void Publish()
        {
            if (_prediction == null || !_prediction.HasValue) return;
            _onUpdate.Invoke(_prediction.NextRewardAt ?? default);
        }
    }
}
