// A line of text about the player's idle time, kept current from the page's
// one idle prediction.
#nullable enable

using UnityEngine;
using UnityEngine.Events;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// Publishes a line about the idle time whenever the prediction moves.
    /// Each concrete label says only what the line reads.
    /// </summary>
    public abstract class IdlePredictionLabel : MonoBehaviour
    {
        [SerializeField] private UnityEvent<string> _onUpdate = new UnityEvent<string>();

        public UnityEvent<string> OnUpdate => _onUpdate;

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
            _onUpdate.Invoke(Format(_prediction));
        }

        /// <summary>The line, from a prediction that has come back.</summary>
        internal abstract string Format(IdlePrediction prediction);

        /// <summary>"3 h 20 min", "45 min", "8 h".</summary>
        internal static string Duration(int minutes)
        {
            var hours = minutes / 60;
            var rest = minutes % 60;
            if (hours == 0) return $"{rest} min";
            return rest == 0 ? $"{hours} h" : $"{hours} h {rest} min";
        }
    }
}
