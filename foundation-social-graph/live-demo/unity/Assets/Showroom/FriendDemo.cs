// What the friend page's hand-written parts share beyond the showroom runtime:
// the friend namespace, how a press reaches GS2 as the visitor, explaining
// GS2's refusals in the press's terms, and the name a player goes by. Reaching
// the player, running presses, logging, player tags and the settle pause are
// the runtime's (`ShowroomRuntime`, `ShowroomPress`, `ShowroomLog`,
// `ShowroomPlayerTag`, `ShowroomSettle`).
#nullable enable

using System;
using System.Threading.Tasks;

using Gs2.Core.Exception;
using Gs2.Unity.Core;
using Gs2.Unity.Util;

using VisitorDomain = Gs2.Gs2Friend.Domain.Model.UserAccessTokenDomain;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>The friend page's shared helpers.</summary>
    public static class FriendDemo
    {
        /// <summary>The friend namespace the feature package deploys.</summary>
        public const string Namespace = "Friend";

        /// <summary>
        /// Friends and follows are always read with profiles. The SDK keys its
        /// cache by this flag, so every reader and writer on the page uses the
        /// same value, including the generated rows.
        /// </summary>
        public const bool WithProfile = true;

        /// <summary>The SDK's domain for the signed-in player in the friend namespace.</summary>
        public static VisitorDomain Visitor(Gs2Domain gs2, IGameSession session) =>
            gs2.Super.Friend.Namespace(Namespace).AccessToken(session.AccessToken);

        /// <summary>
        /// Runs one press as the visitor through the page's press runner, and
        /// explains a refusal in the press's terms. What it changed reaches
        /// every reader through the SDK's cache, so nothing is read again
        /// here, except: <paramref name="whenGone"/> runs when GS2 says what
        /// was pressed on no longer exists and the SDK does not correct its
        /// cache itself. <paramref name="pressed"/> is false for what the page
        /// does on its own. Returns whether the press started.
        /// </summary>
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

        /// <summary>
        /// The Unfollow SDK call leaves a follow GS2 no longer has in its
        /// cache, and no notification corrects it, so the list is read again.
        /// </summary>
        public static void ForgetFollows(VisitorDomain visitor) => visitor.Follow(WithProfile).InvalidateFollows();

        /// <summary>
        /// Says why GS2 refused, for the refusals a visitor can meet; null
        /// leaves any other refusal to the press runner.
        ///
        /// GS2-Friend's SDK has no exception types for these refusals, so they
        /// are recognised by GS2's client error codes. A profile text that is
        /// too long is a request validation GS2 gives no code, so it is
        /// recognised by its kind and the field GS2 names.
        /// </summary>
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
            // A full outbox drops its oldest request instead; this refusal means
            // the visitor already has as many friends as GS2 allows.
            if (ShowroomRefusal.HasCode(error, "friend.sendFriendRequest.capacity.full")) return "You already have as many friends as GS2 allows (1000); remove one first.";
            if (ShowroomRefusal.HasAnyCode(
                    error,
                    "friend.sendFriendRequest.targetUserId.duplicate",
                    "friend.friend.targetUserId.duplicate",
                    "friend.followUser.targetUserId.duplicate",
                    "friend.blackList.targetUserId.duplicate"))
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
            if (ShowroomRefusal.HasCode(error, "friend.sendFriendRequest.targetUserId.self")) return "That id is not another player's: you cannot do this to yourself.";
            if (error is BadRequestException &&
                ShowroomRefusal.IsAnyComponent(error, "publicProfile", "followerProfile", "friendProfile"))
            {
                return "That profile text is too long.";
            }
            return null;
        }

        /// <summary>The name a player goes by: what they chose, or their tag.</summary>
        public static string NameOf(string userId, string? publicProfile) =>
            string.IsNullOrWhiteSpace(publicProfile) ? ShowroomPlayerTag.Of(userId) : publicProfile!.Trim();
    }
}
