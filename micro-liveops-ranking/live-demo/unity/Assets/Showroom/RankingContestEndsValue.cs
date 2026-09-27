// When the visitor's contest closes, for the page to count down to.
//
// Handed over as a `DateTime`, which the page draws as time left; with no
// contest open the deadline is left unset.
#nullable enable

using System;

using UnityEngine;
using UnityEngine.Events;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>Publishes when the contest closes, whenever it may have changed.</summary>
    [AddComponentMenu("GS2 Studio/Showroom/Contest Ends")]
    public sealed class RankingContestEndsValue : MonoBehaviour
    {
        [SerializeField] private UnityEvent<DateTime> _onUpdate = new UnityEvent<DateTime>();

        public UnityEvent<DateTime> OnUpdate => _onUpdate;

        private RankingContestState? _contest;

        private void OnEnable()
        {
            _contest = RankingContestState.Shared;
            _contest.Updated += Publish;
            Publish();
        }

        private void OnDisable()
        {
            if (_contest != null) _contest.Updated -= Publish;
        }

        private void Publish()
        {
            if (_contest == null) return;
            _onUpdate.Invoke(_contest.EndsAt ?? default);
        }
    }
}
