// When the next interval pays, for the page to count down to.
//
// Handed over as a `DateTime`, which the page draws as time left, the way it
// draws a stamina's next recovery. The moment comes from the page's idle
// prediction rather than from the status: GS2's own next-reward time is
// measured from now rather than from the interval boundary. Once the cap has
// stopped the count there is no next reward, and the deadline is left unset.
#nullable enable

using System;

using UnityEngine;
using UnityEngine.Events;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>Publishes when the next idle reward lands, whenever the prediction moves.</summary>
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
