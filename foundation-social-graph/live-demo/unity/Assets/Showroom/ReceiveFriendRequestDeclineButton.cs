#nullable enable

using System.Threading.Tasks;

using UnityEngine;

using Gs2.Gs2Friend.Request;

using GS2Studio.Generated.ReceiveFriendRequest;

using VisitorDomain = Gs2.Gs2Friend.Domain.Model.UserAccessTokenDomain;

namespace GS2Studio.Showroom.Demo
{
    [AddComponentMenu("GS2 Studio/Showroom/Decline This Friend Request")]
    public sealed class ReceiveFriendRequestDeclineButton : FriendRowButton
    {
        protected override FriendPress Kind => FriendPress.Decline;

        protected override string? RowUserId() => GetComponentInParent<ReceiveFriendRequestHandlerBase>()?.Model?.Id.Value;

        /// <summary>Reuse the row's resolved name so action feedback matches its visible label.</summary>
        protected override string RowName(string userId) =>
            GetComponentInParent<ReceiveFriendRequestHandlerBase>()?.GetComponentInChildren<ReceiveFriendRequestNameLabel>()?.Shown ?? ShowroomPlayerTag.Of(userId);

        protected override async Task<string> Act(VisitorDomain visitor, string userId, string name)
        {
            await visitor.ReceiveFriendRequest(userId).RejectAsync(new RejectRequestRequest());
            return $"Declined the request from {name}.";
        }
    }
}
