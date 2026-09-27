// Whether the visitor's contest is open, as one line.
#nullable enable

using UnityEngine;
using UnityEngine.Events;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>That the contest is open, or what the visitor can do instead.</summary>
    [AddComponentMenu("GS2 Studio/Showroom/Contest Status")]
    public sealed class RankingContestStatusLabel : MonoBehaviour
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
            _onUpdate.Invoke(_contest.Open
                ? "Open: play while the time lasts"
                : _contest.Received
                    ? "Over: reward received"
                    : _contest.Best != null
                        ? "Over: your reward is ready to receive"
                        : "Not started");
        }
    }
}
