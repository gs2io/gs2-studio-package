// What the friend page's hand-written parts share: reaching the signed-in
// player, running one press at a time, saying why GS2 refused, and the short
// name a player goes by until they choose one.
#nullable enable

using System;
using System.Linq;
using System.Threading.Tasks;

using UnityEngine;

using Gs2.Core.Exception;
using Gs2.Unity.Core;
using Gs2.Unity.Util;

using VisitorDomain = Gs2.Gs2Friend.Domain.Model.UserAccessTokenDomain;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>What a press is about, so a refusal can be explained in its terms.</summary>
    public enum FriendPress
    {
        Send,
        Cancel,
        Accept,
        Decline,
        Remove,
        Follow,
        Unfollow,
        SaveProfile,
    }

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

        private static bool _busy;
        private static ShowroomPage? _page;

        /// <summary>The signed-in player's SDK handles, once signed in.</summary>
        public static bool TryRuntime(out Gs2Domain? gs2, out IGameSession? session)
        {
            gs2 = null;
            session = null;
            var runtime = UnityEngine.Object.FindAnyObjectByType<GS2Studio.Generated.Runtime.Gs2HolderRuntimeContextProvider>();
            return runtime != null && runtime.TryGet(out gs2, out session) && gs2 != null && session != null;
        }

        /// <summary>The SDK's domain for the signed-in player in the friend namespace.</summary>
        public static VisitorDomain Visitor(Gs2Domain gs2, IGameSession session) =>
            gs2.Super.Friend.Namespace(Namespace).AccessToken(session.AccessToken);

        /// <summary>
        /// Runs one press, one at a time across the whole page, and says the
        /// outcome in the page's log. What it changed reaches every reader
        /// through the SDK's cache, so nothing is read again here.
        /// </summary>
        public static async void Run(FriendPress press, Func<VisitorDomain, Task<string>> action, Action? afterward = null)
        {
            if (_busy)
            {
                Log("One moment: the last press is still going.");
                return;
            }
            if (!TryRuntime(out var gs2, out var session))
            {
                Log("Not signed in yet.");
                return;
            }
            _busy = true;
            try
            {
                Log(await action(Visitor(gs2!, session!)));
            }
            catch (Gs2Exception error)
            {
                Debug.LogWarning($"{nameof(FriendDemo)}: {press} refused: {error}");
                Log(Explain(press, error));
            }
            catch (Exception error)
            {
                Debug.LogError($"{nameof(FriendDemo)}: {press} failed: {error}");
                Log($"Failed: {error.Message}");
            }
            finally
            {
                _busy = false;
            }
            afterward?.Invoke();
        }

        /// <summary>Says why GS2 refused, for the refusals a visitor can meet.</summary>
        public static string Explain(FriendPress press, Gs2Exception error)
        {
            var text = string.Join(" ", error.Errors?.Select(detail => detail.message) ?? Array.Empty<string>()) + " " + error.Message;
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
            if (text.Contains("capacity.error.full")) return "You have too many requests waiting; cancel one first.";
            if (text.Contains("error.duplicate"))
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
            if (text.Contains("targetUserId.error.invalid")) return "That id is not another player's: you cannot do this to yourself.";
            if (text.Contains("Profile.error.tooLong")) return "That profile text is too long.";
            return $"GS2 refused: {error.Message}";
        }

        /// <summary>
        /// A short, stable name for a player who has not chosen one: the same
        /// id always reads the same.
        /// </summary>
        public static string Tag(string? userId)
        {
            unchecked
            {
                var hash = 2166136261u;
                foreach (var character in userId ?? "")
                {
                    hash = (hash ^ character) * 16777619u;
                }
                return $"Player {hash & 0xFFFF:X4}";
            }
        }

        /// <summary>The name a player goes by: what they chose, or their tag.</summary>
        public static string NameOf(string userId, string? publicProfile) =>
            string.IsNullOrWhiteSpace(publicProfile) ? Tag(userId) : publicProfile!.Trim();

        public static void Log(string message)
        {
            if (_page == null) _page = UnityEngine.Object.FindAnyObjectByType<ShowroomPage>();
            if (_page != null) _page.Log(message);
            else Debug.LogWarning($"{nameof(FriendDemo)}: {message}");
        }
    }
}
