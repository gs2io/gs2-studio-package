#nullable enable

using System.Threading.Tasks;

using UnityEngine;

using Gs2.Gs2Friend.Request;

using GS2Studio.Generated.ReceiveFriendRequest;

using VisitorDomain = Gs2.Gs2Friend.Domain.Model.UserAccessTokenDomain;

namespace GS2Studio.Showroom.Demo
{
    [AddComponentMenu("GS2 Studio/Showroom/Accept This Friend Request")]
    public sealed class ReceiveFriendRequestAcceptButton : FriendRowButton
    {
        protected override FriendPress Kind => FriendPress.Accept;

        protected override string? RowUserId() => GetComponentInParent<ReceiveFriendRequestHandlerBase>()?.Model?.Id.Value;

        /// <summary>Reuse the row's resolved name so action feedback matches its visible label.</summary>
        protected override string RowName(string userId) =>
            GetComponentInParent<ReceiveFriendRequestHandlerBase>()?.GetComponentInChildren<ReceiveFriendRequestNameLabel>()?.Shown ?? ShowroomPlayerTag.Of(userId);

        protected override async Task<string> Act(VisitorDomain visitor, string userId, string name)
        {
            await visitor.ReceiveFriendRequest(userId).AcceptAsync(new AcceptRequestRequest());
            return $"You and {name} are now friends.";
        }
    }
}
