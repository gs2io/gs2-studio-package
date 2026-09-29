// Stops following the player this row shows.
#nullable enable

using System.Threading.Tasks;

using UnityEngine;

using Gs2.Gs2Friend.Request;

using GS2Studio.Generated.Follow;

using VisitorDomain = Gs2.Gs2Friend.Domain.Model.UserAccessTokenDomain;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>Stops following the player this row shows.</summary>
    [AddComponentMenu("GS2 Studio/Showroom/Unfollow This Player")]
    public sealed class FollowUnfollowButton : FriendRowButton
    {
        protected override FriendPress Press => FriendPress.Unfollow;

        protected override string? RowUserId() => GetComponentInParent<FollowHandlerBase>()?.Model?.Id.Value;

        protected override async Task<string> Act(VisitorDomain visitor, string userId)
        {
            await visitor.Follow(FriendDemo.WithProfile).FollowUser(userId).UnfollowAsync(new UnfollowRequest());
            return $"You no longer follow {FriendDemo.Tag(userId)}.";
        }
    }
}
