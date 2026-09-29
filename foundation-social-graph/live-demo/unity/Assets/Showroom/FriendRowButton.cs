// A press on one generated row of the friend page: the row names the other
// player, and the press acts on them through the SDK.
//
// None of these presses is an action the package can host (GS2-Friend has no
// transactions to delegate), so each is a small hand-written button shaped
// like a generated one: a `Button` to wire and an `OnCompleted` to raise,
// which is what the page knows how to draw. The row's handler is found in the
// parents, the way generated components find theirs.
#nullable enable

using System.Threading.Tasks;

using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

using Gs2.Unity.Util;

using VisitorDomain = Gs2.Gs2Friend.Domain.Model.UserAccessTokenDomain;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>A press that acts on the player this row shows.</summary>
    public abstract class FriendRowButton : MonoBehaviour
    {
        [SerializeField] private Button? _button;

        /// <summary>Raised once the press went through.</summary>
        [SerializeField] private UnityEvent _onCompleted = new UnityEvent();

        /// <summary>
        /// Never raised: a refusal is explained on the page's log in the
        /// press's own terms instead of as GS2's raw error. It is declared
        /// because a row's action is the pair, and the page wires the failure
        /// side of every button it draws.
        /// </summary>
        [SerializeField] private ErrorEvent _onFailed = new ErrorEvent();

        public UnityEvent OnCompleted => _onCompleted;
        public ErrorEvent OnFailed => _onFailed;

        private bool _wired;

        /// <summary>What the press is, for explaining a refusal.</summary>
        protected abstract FriendPress Press { get; }

        /// <summary>The other player's id, read from the row; null while the row is still arriving.</summary>
        protected abstract string? RowUserId();

        /// <summary>
        /// The name the row shows for the other player; their tag when the
        /// row carries no profile.
        /// </summary>
        protected virtual string RowName(string userId) => FriendDemo.Tag(userId);

        /// <summary>Acts on the other player and says what was done, naming them as the row does.</summary>
        protected abstract Task<string> Act(VisitorDomain visitor, string userId, string name);

        /// <summary>
        /// Corrects the SDK's cache when GS2 says the other player is no
        /// longer there and the SDK leaves it as it was; nothing by default.
        /// </summary>
        protected virtual void WhenGone(VisitorDomain visitor) { }

        private void OnEnable()
        {
            if (_button == null || _wired) return;
            _button.onClick.AddListener(OnClicked);
            _wired = true;
        }

        private void OnDisable()
        {
            if (_button == null || !_wired) return;
            _button.onClick.RemoveListener(OnClicked);
            _wired = false;
        }

        private void OnClicked()
        {
            var userId = RowUserId();
            if (string.IsNullOrEmpty(userId)) return;
            var name = RowName(userId!);
            var completed = false;
            FriendDemo.Run(Press, async visitor =>
            {
                var message = await Act(visitor, userId!, name);
                completed = true;
                return message;
            }, () =>
            {
                if (completed && this != null) _onCompleted.Invoke();
            }, WhenGone);
        }
    }
}
