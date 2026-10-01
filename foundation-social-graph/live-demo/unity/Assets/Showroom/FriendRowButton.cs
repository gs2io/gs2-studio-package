// A press on one generated row of the friend page: the row names the other
// player, and the press acts on them through the SDK.
//
// None of these presses is an action the package can host (GS2-Friend has no
// transactions to delegate), so each is a small hand-written button shaped
// like a generated one (`ShowroomPressButton`): a `Button` to wire, an
// `OnCompleted` to raise and an `OnFailed` the page reports through, which is
// what the page knows how to draw. The press waits its turn with every other
// press on the page. The row's handler is found in the parents, the way
// generated components find theirs.
#nullable enable

using System.Threading.Tasks;

using Gs2.Core.Exception;

using VisitorDomain = Gs2.Gs2Friend.Domain.Model.UserAccessTokenDomain;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>A press that acts on the player this row shows.</summary>
    public abstract class FriendRowButton : ShowroomPressButton
    {
        /// <summary>What the press is, for explaining a refusal.</summary>
        protected abstract FriendPress Kind { get; }

        /// <summary>The other player's id, read from the row; null while the row is still arriving.</summary>
        protected abstract string? RowUserId();

        /// <summary>
        /// The name the row shows for the other player; their tag when the
        /// row carries no profile.
        /// </summary>
        protected virtual string RowName(string userId) => ShowroomPlayerTag.Of(userId);

        /// <summary>Acts on the other player and says what was done, naming them as the row does.</summary>
        protected abstract Task<string> Act(VisitorDomain visitor, string userId, string name);

        /// <summary>
        /// Corrects the SDK's cache when GS2 says the other player is no
        /// longer there and the SDK leaves it as it was; nothing by default.
        /// </summary>
        protected virtual void WhenGone(VisitorDomain visitor) { }

        protected override string PressName => $"Friend {Kind}";

        protected override string? Explain(Gs2Exception error) => FriendDemo.Explain(Kind, error);

        protected override async Task<string> Press()
        {
            var userId = RowUserId();
            // A row still arriving has nobody to act on yet.
            if (string.IsNullOrEmpty(userId)) return "";
            if (!ShowroomRuntime.TryGet(out var gs2, out var session)) return "Not signed in yet.";
            var visitor = FriendDemo.Visitor(gs2, session);
            var name = RowName(userId!);
            try
            {
                return await Act(visitor, userId!, name);
            }
            catch (NotFoundException)
            {
                WhenGone(visitor);
                throw;
            }
        }
    }
}
