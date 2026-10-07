#nullable enable

using System;
using System.Threading.Tasks;

using Gs2.Core.Exception;
using Gs2.Gs2Friend.Exception;
using Gs2.Unity.Core;
using Gs2.Unity.Util;

using VisitorDomain = Gs2.Gs2Friend.Domain.Model.UserAccessTokenDomain;

namespace GS2Studio.Showroom.Demo
{
    public static class FriendDemo
    {
        public const string Namespace = "Friend";

        /// <summary>Keep the profile flag consistent with generated readers because it participates in SDK cache identity.</summary>
        public const bool WithProfile = true;

        public static VisitorDomain Visitor(Gs2Domain gs2, IGameSession session) =>
            gs2.Super.Friend.Namespace(Namespace).AccessToken(session.AccessToken);

        public static bool Run(
            FriendPress press,
            UnityEngine.Object owner,
            Func<VisitorDomain, Task<string>> action,
            Action? whenGone = null,
            bool pressed = true)
        {
            return ShowroomPress.Run(new ShowroomPressOptions
            {
                Name = $"Friend {press}",
                Pressed = pressed,
                Owner = owner,
                Explain = error => Explain(press, error),
                WhenGone = whenGone,
            }, (gs2, session) => action(Visitor(gs2, session)));
        }

        /// <summary>Invalidate the profile-bearing follow list after a stale-row refusal so readers stop offering the removed row.</summary>
        public static void ForgetFollows(VisitorDomain visitor) => visitor.Follow(WithProfile).InvalidateFollows();

        /// <summary>Match profile validation by error kind and field so unrelated bad requests retain the default report.</summary>
        public static string? Explain(FriendPress press, Gs2Exception error)
        {
            if (error is NotFoundException)
            {
                return press switch
                {
                    FriendPress.Cancel => "That request is already gone: they answered it, or it was cancelled.",
                    FriendPress.Accept or FriendPress.Decline => "That request is gone: they cancelled it.",
                    FriendPress.Remove => "You are no longer friends.",
                    FriendPress.Unfollow => "You no longer follow that player.",
                    _ => "That is gone.",
                };
            }
            if (error is SendRequestCapacityFullException) return "You already have as many friends as GS2 allows (1000); remove one first.";
            if (error is DuplicateFriendRequestException ||
                error is AlreadyFriendException ||
                error is AlreadyFollowingException ||
                error is AlreadyInBlackListException)
            {
                return press switch
                {
                    FriendPress.Send =>
                        "No new request was sent: you are already friends, you already asked, or they asked you first. " +
                        "If they asked you, accept their request instead.",
                    FriendPress.Follow => "You already follow that player.",
                    _ => "That was already done.",
                };
            }
            if (error is SendRequestToSelfException) return "That id is not another player's: you cannot do this to yourself.";
            if (error is BadRequestException &&
                ShowroomRefusal.IsAnyComponent(error, "publicProfile", "followerProfile", "friendProfile"))
            {
                return "That profile text is too long.";
            }
            return null;
        }

        public static string NameOf(string userId, string? publicProfile) =>
            string.IsNullOrWhiteSpace(publicProfile) ? ShowroomPlayerTag.Of(userId) : publicProfile!.Trim();
    }
}
