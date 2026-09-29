// Cancels the friend request this row shows.
#nullable enable

using System.Threading.Tasks;

using UnityEngine;

using Gs2.Gs2Friend.Request;

using GS2Studio.Generated.SendFriendRequest;

using VisitorDomain = Gs2.Gs2Friend.Domain.Model.UserAccessTokenDomain;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>Cancels the friend request this row shows.</summary>
    [AddComponentMenu("GS2 Studio/Showroom/Cancel This Friend Request")]
    public sealed class SendFriendRequestCancelButton : FriendRowButton
    {
        protected override FriendPress Press => FriendPress.Cancel;

        protected override string? RowUserId() => GetComponentInParent<SendFriendRequestHandlerBase>()?.Model?.Id.Value;

        /// <summary>A request carries no profile; the row's name label read it.</summary>
        protected override string RowName(string userId) =>
            GetComponentInParent<SendFriendRequestHandlerBase>()?.GetComponentInChildren<SendFriendRequestNameLabel>()?.Shown ?? FriendDemo.Tag(userId);

        protected override async Task<string> Act(VisitorDomain visitor, string userId, string name)
        {
            await visitor.SendFriendRequest(userId).DeleteAsync(new DeleteRequestRequest());
            return $"Cancelled your request to {name}.";
        }
    }
}
