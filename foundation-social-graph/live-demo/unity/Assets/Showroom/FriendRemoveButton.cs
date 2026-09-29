// Removes the friend this row shows, for both players.
#nullable enable

using System.Threading.Tasks;

using UnityEngine;

using Gs2.Gs2Friend.Request;

using GS2Studio.Generated.Friend;

using VisitorDomain = Gs2.Gs2Friend.Domain.Model.UserAccessTokenDomain;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>Removes the friend this row shows, for both players.</summary>
    [AddComponentMenu("GS2 Studio/Showroom/Remove This Friend")]
    public sealed class FriendRemoveButton : FriendRowButton
    {
        protected override FriendPress Press => FriendPress.Remove;

        protected override string? RowUserId() => GetComponentInParent<FriendHandlerBase>()?.Model?.Id.Value;

        protected override string RowName(string userId) =>
            FriendDemo.NameOf(userId, GetComponentInParent<FriendHandlerBase>()?.Model?.PublicProfile);

        protected override async Task<string> Act(VisitorDomain visitor, string userId, string name)
        {
            await visitor.Friend(FriendDemo.WithProfile).DeleteFriendAsync(new DeleteFriendRequest().WithTargetUserId(userId));
            return $"You and {name} are no longer friends.";
        }
    }
}
