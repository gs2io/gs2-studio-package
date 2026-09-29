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
        /// How long after a list on the page changed a press is refused: a
        /// row that just appeared or vanished moves every button below it,
        /// and a press in that moment may land on a different button than
        /// the visitor aimed at.
        /// </summary>
        private const float SettleSeconds = 0.6f;

        private static float _lastChange = float.NegativeInfinity;

        /// <summary>Says that a list on the page just changed what it shows.</summary>
        public static void MarkChanged() => _lastChange = Time.realtimeSinceStartup;

        /// <summary>
        /// Runs one press, one at a time across the whole page, and says the
        /// outcome in the page's log. What it changed reaches every reader
        /// through the SDK's cache, so nothing is read again here, except:
        /// <paramref name="whenGone"/> runs when GS2 says what was pressed on
        /// no longer exists and the SDK does not correct its cache itself.
        /// Returns whether the press started. <paramref name="pressed"/> is
        /// false for what the page does on its own, which no moving button
        /// can have misdirected.
        /// </summary>
        public static bool Run(FriendPress press, Func<VisitorDomain, Task<string>> action, Action? afterward = null, Action<VisitorDomain>? whenGone = null, bool pressed = true)
        {
            if (_busy)
            {
                Log("One moment: the last press is still going.");
                return false;
            }
            if (pressed && Time.realtimeSinceStartup - _lastChange < SettleSeconds)
            {
                Log("The list just changed; press again.");
                return false;
            }
            if (!TryRuntime(out var gs2, out var session))
            {
                Log("Not signed in yet.");
                return false;
            }
            _busy = true;
            Execute(press, Visitor(gs2!, session!), action, afterward, whenGone);
            return true;
        }

        private static async void Execute(FriendPress press, VisitorDomain visitor, Func<VisitorDomain, Task<string>> action, Action? afterward, Action<VisitorDomain>? whenGone)
        {
            try
            {
                Log(await action(visitor));
            }
            catch (Gs2Exception error)
            {
                Debug.LogWarning($"{nameof(FriendDemo)}: {press} refused: {error}");
                Log(Explain(press, error));
                if (error is NotFoundException) whenGone?.Invoke(visitor);
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

        /// <summary>
        /// The Unfollow SDK call leaves a follow GS2 no longer has in its
        /// cache, and no notification corrects it, so the list is read again.
        /// </summary>
        public static void ForgetFollows(VisitorDomain visitor) => visitor.Follow(WithProfile).InvalidateFollows();

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
            // A full outbox drops its oldest request instead; this refusal means
            // the visitor already has as many friends as GS2 allows.
            if (text.Contains("capacity.error.full")) return "You already have as many friends as GS2 allows (1000); remove one first.";
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
