// Accepts the friend request this row shows.
#nullable enable

using System.Threading.Tasks;

using UnityEngine;

using Gs2.Gs2Friend.Request;

using GS2Studio.Generated.ReceiveFriendRequest;

using VisitorDomain = Gs2.Gs2Friend.Domain.Model.UserAccessTokenDomain;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>Accepts the friend request this row shows.</summary>
    [AddComponentMenu("GS2 Studio/Showroom/Accept This Friend Request")]
    public sealed class ReceiveFriendRequestAcceptButton : FriendRowButton
    {
        protected override FriendPress Press => FriendPress.Accept;

        protected override string? RowUserId() => GetComponentInParent<ReceiveFriendRequestHandlerBase>()?.Model?.Id.Value;

        /// <summary>A request carries no profile; the row's name label read it.</summary>
        protected override string RowName(string userId) =>
            GetComponentInParent<ReceiveFriendRequestHandlerBase>()?.GetComponentInChildren<ReceiveFriendRequestNameLabel>()?.Shown ?? FriendDemo.Tag(userId);

        protected override async Task<string> Act(VisitorDomain visitor, string userId, string name)
        {
            await visitor.ReceiveFriendRequest(userId).AcceptAsync(new AcceptRequestRequest());
            return $"You and {name} are now friends.";
        }
    }
}
