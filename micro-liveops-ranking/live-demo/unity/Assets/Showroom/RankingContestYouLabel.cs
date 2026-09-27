// The visitor's own place on the board, as one line.
#nullable enable

using UnityEngine;
using UnityEngine.Events;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>The visitor's rank and best score, or that they have not played.</summary>
    [AddComponentMenu("GS2 Studio/Showroom/Contest You")]
    public sealed class RankingContestYouLabel : MonoBehaviour
    {
        [SerializeField] private UnityEvent<string> _onUpdate = new UnityEvent<string>();

        public UnityEvent<string> OnUpdate => _onUpdate;

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
            if (_contest == null || !_contest.HasValue) return;
            _onUpdate.Invoke(_contest.Best == null
                ? "Not on the board yet"
                : _contest.Rank != null
                    ? $"Rank {_contest.Rank} with {_contest.Best}"
                    : $"Best {_contest.Best}");
        }
    }
}
