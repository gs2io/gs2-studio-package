// The friend page's own region: the visitor's id to hand to another player,
// their profile to edit, and a way to look another player up by id and act on
// them.
//
// GS2-Friend has no search: a player is found by the id GS2 gave them, so the
// visitor copies their own id to the other player and pastes or types the
// other player's. None of this is an action a package can host, so it is a
// hand-written region. The lists below it are the generated rows; each of
// their rows carries its own hand-written buttons too.
//
// Reads go through the SDK's domain and are watched in its cache: the
// visitor's profile, friends, follows and friend requests each way, and the
// public profile of the player looked up. GS2's notifications clear or update
// those caches when the other player sends, cancels, answers or removes, and
// the SDK's own writes update them after a press, so the panel hears every
// change without asking GS2 on a timer. GS2 does not announce profile edits,
// so another player's name is as fresh as the SDK's cache of it.
//
// The SDK can hand a watcher an empty list while it is still reading the list
// again, so an empty list is read again through the domain before it is
// believed. The domain answers from the cache while the cache holds the list,
// so this costs nothing while all is well. A watch that failed to start is
// tried again every 30 seconds.
#nullable enable

using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Linq;
using System.Text.RegularExpressions;

using UnityEngine;
using UnityEngine.UI;

using Cysharp.Threading.Tasks;
using Cysharp.Threading.Tasks.Linq;

using Gs2.Gs2Friend.Model;
using Gs2.Gs2Friend.Request;

using VisitorDomain = Gs2.Gs2Friend.Domain.Model.UserAccessTokenDomain;
using FollowDomain = Gs2.Gs2Friend.Domain.Model.FollowAccessTokenDomain;
using PublicProfileDomain = Gs2.Gs2Friend.Domain.Model.PublicProfileDomain;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>Draws the visitor's id, profile and player lookup into the region the page gives it.</summary>
    [AddComponentMenu("GS2 Studio/Showroom/Profile and Friends")]
    public sealed class ProfileFriendsPanel : MonoBehaviour
    {
        /// <summary>How often a watch that failed to start is tried again.</summary>
        private const float TickSeconds = 30f;
        private const int NameLimit = 32;
        private const int ProfileLimit = 128;

        /// <summary>The shape of the ids GS2-Account gives players.</summary>
        private static readonly Regex PlayerId = new Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$");

        private static readonly Color RowColor = new Color(0.16f, 0.15f, 0.22f, 1f);
        private static readonly Color LightText = new Color(0.922f, 0.91f, 0.949f, 1f);
        private static readonly Color MutedText = new Color(0.643f, 0.616f, 0.729f, 1f);

        [SerializeField] private RectTransform? _panel;
        [SerializeField] private Button? _buttonTemplate;
        [SerializeField] private Font? _font;

        private InputField? _ownIdField;
        private InputField? _publicField;
        private InputField? _friendField;
        private InputField? _followerField;
        private InputField? _targetField;
        private RectTransform? _result;
        private Coroutine? _signingIn;

        /// <summary>What the clipboard is being asked to do, until it answers.</summary>
        private enum Clipboard
        {
            Idle,
            Copying,
            Pasting,
        }

        private Clipboard _clipboard;

        /// <summary>
        /// How long the clipboard may take to answer. A browser can leave a
        /// permission prompt open, or never settle, and the buttons would
        /// otherwise wait for it forever.
        /// </summary>
        private const float ClipboardSeconds = 10f;
        private float _clipboardDeadline;

        /// <summary>The visitor, set once they are signed in.</summary>
        private Gs2.Unity.Core.Gs2Domain? _gs2;
        private VisitorDomain? _visitor;
        private FollowDomain? _follow;
        private string _userId = "";

        /// <summary>
        /// What the SDK said, handed over to the main thread. Update applies
        /// everything that arrived since the last frame and then draws once.
        /// </summary>
        private readonly ConcurrentQueue<Action> _inbox = new ConcurrentQueue<Action>();
        private float _nextTick;

        private readonly Watch _profileWatch = new Watch();
        private readonly Watch _friendsWatch = new Watch();
        private readonly Watch _sentWatch = new Watch();
        private readonly Watch _receivedWatch = new Watch();
        private readonly Watch _followsWatch = new Watch();
        private readonly Watch _targetWatch = new Watch();

        /// <summary>What was read; null until it has been.</summary>
        private Profile? _profile;
        private FriendUser[]? _friends;
        private SendFriendRequest[]? _sent;
        private ReceiveFriendRequest[]? _received;
        private FollowUser[]? _follows;

        /// <summary>The player looked up, and their public profile once read.</summary>
        private string? _targetId;
        private PublicProfile? _targetProfile;
        private bool _targetFailed;

        /// <summary>The profile fields are filled from GS2 until the visitor types in them.</summary>
        private bool _profileEdited;
        private bool _filling;
        private bool _defaultNameTried;

        /// <summary>What the result area was last drawn from; null before the first draw.</summary>
        private string? _shown;

        private void OnEnable()
        {
            if (_panel == null || _buttonTemplate == null || _font == null)
            {
                FriendDemo.Log("The friend panel was baked without its region, button or font.");
                return;
            }
            if (_result == null) Build();
            _signingIn = StartCoroutine(WaitForSignIn());
        }

        private void OnDisable()
        {
            if (_signingIn != null) StopCoroutine(_signingIn);
            _signingIn = null;
            StopWatching();
        }

        private IEnumerator WaitForSignIn()
        {
            while (!FriendDemo.TryRuntime(out _, out _))
            {
                yield return new WaitForSeconds(0.25f);
            }
            _signingIn = null;
            StartWatching();
        }

        private void Build()
        {
            var panel = _panel!;
            Caption(panel, "Your player id. Give it to another player so they can find you.", 15, MutedText);
            _ownIdField = Field(panel, "OwnId", "Signing in...", 64);
            _ownIdField.readOnly = true;
            Press(panel, "Copy your id", Copy);

            Caption(panel, "Your profile", 15, MutedText);
            _publicField = Field(panel, "PublicProfile", "Your name, which everyone sees", NameLimit);
            _friendField = Field(panel, "FriendProfile", "What only your friends see", ProfileLimit);
            _followerField = Field(panel, "FollowerProfile", "What only your followers see", ProfileLimit);
            foreach (var field in new[] { _publicField, _friendField, _followerField })
            {
                field.onValueChanged.AddListener(_ =>
                {
                    if (!_filling) _profileEdited = true;
                });
            }
            Press(panel, "Save your profile", SaveProfile);

            Caption(panel, "Find a player by their id", 15, MutedText);
            _targetField = Field(panel, "TargetId", "Paste or type another player's id", 64);
            Press(panel, "Paste an id", Paste);
            Press(panel, "Look them up", LookUp);

            _result = Child("Result", panel);
            var layout = _result.gameObject.AddComponent<VerticalLayoutGroup>();
            layout.spacing = 8;
            layout.childControlWidth = true;
            layout.childControlHeight = true;
            layout.childForceExpandWidth = true;
            layout.childForceExpandHeight = false;

            Caption(panel,
                "GS2 does not announce profile edits, so a name another player changed shows here " +
                "once your lists are read again (at most 15 minutes, or on reload).", 13, MutedText);
        }

        // ------------------------------------------------------------------
        // Watching

        private void StartWatching()
        {
            if (!FriendDemo.TryRuntime(out var gs2, out var session)) return;
            _gs2 = gs2;
            _visitor = FriendDemo.Visitor(gs2!, session!);
            _follow = _visitor.Follow(FriendDemo.WithProfile);
            _userId = session!.UserId;
            Debug.Log($"{nameof(ProfileFriendsPanel)}: signed in as {_userId}");
            if (_ownIdField != null) _ownIdField.text = _userId;
            _nextTick = Time.realtimeSinceStartup + TickSeconds;
            WatchProfile();
            WatchFriends();
            WatchSent();
            WatchReceived();
            WatchFollows();
            if (_targetId != null) WatchTarget(_targetId);
            Draw();
        }

        /// <summary>
        /// Drops every subscription, so the SDK holds no callback into a
        /// disabled or destroyed panel, and forgets what was read.
        /// </summary>
        private void StopWatching()
        {
            _profileWatch.Stop();
            _friendsWatch.Stop();
            _sentWatch.Stop();
            _receivedWatch.Stop();
            _followsWatch.Stop();
            _targetWatch.Stop();
            while (_inbox.TryDequeue(out _)) { }
            _gs2 = null;
            _visitor = null;
            _follow = null;
            _profile = null;
            _friends = null;
            _sent = null;
            _received = null;
            _follows = null;
            _targetProfile = null;
            _targetFailed = false;
            _shown = null;
        }

        private void Update()
        {
            PollClipboard();
            if (_visitor == null) return;
            var arrived = false;
            while (_inbox.TryDequeue(out var apply))
            {
                apply();
                arrived = true;
            }
            if (arrived) Draw();
            if (Time.realtimeSinceStartup >= _nextTick) Tick();
        }

        /// <summary>
        /// Every 30 seconds, tries again a watch that failed to start, and
        /// naming a visitor whose naming could not start.
        /// </summary>
        private void Tick()
        {
            _nextTick = Time.realtimeSinceStartup + TickSeconds;
            if (_profileWatch.Failed) WatchProfile();
            // Naming waits for any press that was running when the profile arrived.
            if (_profile != null) NameIfUnnamed(_profile);
            if (_friendsWatch.Failed) WatchFriends();
            if (_sentWatch.Failed) WatchSent();
            if (_receivedWatch.Failed) WatchReceived();
            if (_followsWatch.Failed) WatchFollows();
            if (_targetWatch.Failed && _targetId != null) WatchTarget(_targetId);
        }

        /// <summary>Hands an SDK callback to the main thread, for as long as its watch lasts.</summary>
        private void Post(Watch watch, int ticket, Action apply) =>
            _inbox.Enqueue(() =>
            {
                if (watch.Is(ticket)) apply();
            });

        /// <summary>
        /// Reads a watched list again through the domain and hands what it
        /// read over. The domain answers from the cache while the cache holds
        /// the list, and otherwise reads it from GS2 and caches it, which also
        /// tells every watcher.
        /// </summary>
        private async void Reread<T>(Watch watch, int ticket, Func<IUniTaskAsyncEnumerable<T>> read, Action<T[]> apply, string what)
        {
            try
            {
                var items = await read().ToArrayAsync();
                if (watch.Is(ticket)) apply(items);
            }
            catch (Exception error)
            {
                // Tick starts the watch again, so the list is not left unknown.
                if (!watch.Fail(ticket)) return;
                Debug.LogWarning($"{nameof(ProfileFriendsPanel)}: {what} could not be read again: {error}");
            }
        }

        /// <summary>
        /// Subscribes to one of the visitor's lists. An empty list may only
        /// mean the cache no longer holds it, so it is read again first.
        /// </summary>
        private async void WatchList<T>(
            Watch watch,
            Func<Action<T[]>, UniTask<ulong>> subscribe,
            Action<ulong> unsubscribe,
            Func<IUniTaskAsyncEnumerable<T>> read,
            Action<T[]> store,
            string what)
        {
            if (_visitor == null) return;
            var ticket = watch.Start();
            void Apply(T[]? items) => Post(watch, ticket, () => store(items ?? Array.Empty<T>()));
            void Reread() => this.Reread(watch, ticket, read, Apply, what);
            try
            {
                var id = await subscribe(items =>
                {
                    if (items == null || items.Length == 0) Reread();
                    else Apply(items);
                });
                watch.Attach(ticket, () => unsubscribe(id));
            }
            catch (Exception error)
            {
                if (!watch.Fail(ticket)) return;
                Debug.LogError($"{nameof(ProfileFriendsPanel)}: {what} could not be read: {error}");
                FriendDemo.Log($"{char.ToUpperInvariant(what[0])}{what.Substring(1)} could not be read: {error.Message}");
            }
        }

        private void WatchFriends()
        {
            var visitor = _visitor!;
            WatchList<FriendUser>(_friendsWatch,
                callback => visitor.SubscribeFriendsWithInitialCallAsync(callback, FriendDemo.WithProfile),
                id => visitor.UnsubscribeFriends(id, FriendDemo.WithProfile),
                () => visitor.FriendsAsync(FriendDemo.WithProfile),
                items => _friends = Store(_friends, items, friend => friend.UserId),
                "your friends");
        }

        private void WatchSent()
        {
            var visitor = _visitor!;
            WatchList<SendFriendRequest>(_sentWatch,
                callback => visitor.SubscribeSendRequestsWithInitialCallAsync(callback),
                id => visitor.UnsubscribeSendRequests(id),
                () => visitor.SendRequestsAsync(),
                items => _sent = Store(_sent, items, request => request.TargetUserId),
                "the requests you sent");
        }

        private void WatchReceived()
        {
            var visitor = _visitor!;
            WatchList<ReceiveFriendRequest>(_receivedWatch,
                callback => visitor.SubscribeReceiveRequestsWithInitialCallAsync(callback),
                id => visitor.UnsubscribeReceiveRequests(id),
                () => visitor.ReceiveRequestsAsync(),
                items => _received = Store(_received, items, request => request.UserId),
                "the requests sent to you");
        }

        private void WatchFollows()
        {
            var follow = _follow!;
            WatchList<FollowUser>(_followsWatch,
                callback => follow.SubscribeFollowsWithInitialCallAsync(callback),
                id => follow.UnsubscribeFollows(id),
                () => follow.FollowsAsync(),
                items => _follows = Store(_follows, items, follow => follow.UserId),
                "the players you follow");
        }

        /// <summary>
        /// Keeps what a list now holds, and tells the page when the players
        /// on it changed: rows appear or vanish then, and presses wait a
        /// moment for the buttons to settle.
        /// </summary>
        private static T[] Store<T>(T[]? before, T[] after, Func<T, string?> key)
        {
            if (before == null || !before.Select(key).SequenceEqual(after.Select(key))) FriendDemo.MarkChanged();
            return after;
        }

        /// <summary>
        /// The visitor's own profile. GS2 creates it on the first read; a
        /// visitor who has no name yet is given their tag, once.
        /// </summary>
        private async void WatchProfile()
        {
            var visitor = _visitor;
            if (visitor == null) return;
            var profile = visitor.Profile();
            var ticket = _profileWatch.Start();
            try
            {
                var id = await profile.SubscribeWithInitialCallAsync(model => Post(_profileWatch, ticket, () =>
                {
                    if (model == null) return;
                    _profile = model;
                    FillProfileFields(model);
                    NameIfUnnamed(model);
                }));
                _profileWatch.Attach(ticket, () => profile.Unsubscribe(id));
            }
            catch (Exception error)
            {
                if (!_profileWatch.Fail(ticket)) return;
                Debug.LogError($"{nameof(ProfileFriendsPanel)}: your profile could not be read: {error}");
                FriendDemo.Log($"Your profile could not be read: {error.Message}");
            }
        }

        /// <summary>The public profile of the player looked up.</summary>
        private async void WatchTarget(string userId)
        {
            var gs2 = _gs2;
            if (gs2 == null) return;
            PublicProfileDomain profile = gs2.Super.Friend.Namespace(FriendDemo.Namespace).User(userId).PublicProfile();
            var ticket = _targetWatch.Start();
            _targetProfile = null;
            _targetFailed = false;
            try
            {
                var id = await profile.SubscribeWithInitialCallAsync(model => Post(_targetWatch, ticket, () =>
                {
                    if (model != null) _targetProfile = model;
                }));
                _targetWatch.Attach(ticket, () => profile.Unsubscribe(id));
            }
            catch (Exception error)
            {
                if (!_targetWatch.Fail(ticket)) return;
                Debug.LogWarning($"{nameof(ProfileFriendsPanel)}: the profile of {userId} could not be read: {error}");
                _inbox.Enqueue(() =>
                {
                    _targetFailed = true;
                });
            }
        }

        /// <summary>
        /// Puts GS2's profile into the fields, unless the visitor has typed
        /// in them since: their edit is not overwritten before they save.
        /// </summary>
        private void FillProfileFields(Profile profile)
        {
            if (_profileEdited || _publicField == null || _friendField == null || _followerField == null) return;
            _filling = true;
            _publicField.text = profile.PublicProfile ?? "";
            _friendField.text = profile.FriendProfile ?? "";
            _followerField.text = profile.FollowerProfile ?? "";
            _filling = false;
        }

        /// <summary>
        /// A visitor starts with no name, which another player would see as a
        /// bare id, so the first read names them after their tag.
        /// </summary>
        private void NameIfUnnamed(Profile profile)
        {
            if (_defaultNameTried || !string.IsNullOrWhiteSpace(profile.PublicProfile)) return;
            var name = FriendDemo.Tag(_userId);
            // Tried again on the next profile read when the press could not start.
            _defaultNameTried = FriendDemo.Run(FriendPress.SaveProfile, async visitor =>
            {
                await visitor.Profile().UpdateAsync(new UpdateProfileRequest()
                    .WithPublicProfile(name)
                    .WithFriendProfile(profile.FriendProfile ?? "")
                    .WithFollowerProfile(profile.FollowerProfile ?? ""));
                return $"You go by {name} until you choose a name below.";
            }, pressed: false);
        }

        // ------------------------------------------------------------------
        // Drawing

        /// <summary>What the visitor and the player looked up are to each other.</summary>
        private void Draw()
        {
            if (_result == null) return;
            // Rebuilt only when what it shows changes, so a button is not
            // replaced under the cursor by an identical one.
            var shown = Signature();
            if (shown == _shown) return;
            _shown = shown;
            // The panel sits above the lists, so redrawing it can move every
            // row button below; presses wait for that too. It is marked only
            // when what is shown changed, so a press lands at most once in
            // the pause and the next one goes through.
            FriendDemo.MarkChanged();
            Clear(_result);
            if (_targetId == null) return;
            if (_targetId == _userId)
            {
                Caption(_result, "That is your own id. Look up another player's.", 16, LightText);
                return;
            }
            var targetId = _targetId;
            var name = _targetProfile == null
                ? (_targetFailed ? $"{FriendDemo.Tag(targetId)} (their profile could not be read)" : $"{FriendDemo.Tag(targetId)} (reading...)")
                : FriendDemo.NameOf(targetId, _targetProfile.Value);
            Caption(_result, name, 18, LightText);
            if (_targetProfile != null && string.IsNullOrWhiteSpace(_targetProfile.Value))
            {
                // GS2 creates a profile on the first read, so an id nobody
                // uses reads as a player without a name.
                Caption(_result, "This player has no name yet. Check the id if you expected one.", 14, MutedText);
            }
            if (_friends == null || _sent == null || _received == null || _follows == null)
            {
                Caption(_result, "Reading your lists...", 15, MutedText);
                return;
            }

            if (_friends.Any(friend => friend.UserId == targetId))
            {
                Caption(_result, "You are friends.", 15, MutedText);
                Press(_result, "Remove friend", () => Remove(targetId));
            }
            else if (_sent.Any(request => request.TargetUserId == targetId))
            {
                Caption(_result, "You asked to be friends. Waiting for their answer.", 15, MutedText);
                Press(_result, "Cancel your request", () => Cancel(targetId));
            }
            else if (_received.Any(request => request.UserId == targetId))
            {
                Caption(_result, "They asked to be friends.", 15, MutedText);
                Press(_result, "Accept their request", () => Answer(targetId, true));
                Press(_result, "Decline their request", () => Answer(targetId, false));
            }
            else
            {
                Press(_result, "Send a friend request", () => Send(targetId));
            }

            if (_follows.Any(follow => follow.UserId == targetId))
            {
                Press(_result, "Unfollow", () => Unfollow(targetId));
            }
            else
            {
                Press(_result, "Follow", () => Follow(targetId));
            }
        }

        /// <summary>Everything the result area draws from, as one comparable value.</summary>
        private string Signature()
        {
            var targetId = _targetId;
            if (targetId == null) return "";
            bool? Has<T>(T[]? items, Func<T, string?> key) => items?.Any(item => key(item) == targetId);
            return string.Join("|",
                targetId,
                _userId,
                _targetProfile == null ? "(unread)" : "=" + (_targetProfile.Value ?? ""),
                _targetFailed,
                Has(_friends, friend => friend.UserId),
                Has(_sent, request => request.TargetUserId),
                Has(_received, request => request.UserId),
                Has(_follows, follow => follow.UserId));
        }

        // ------------------------------------------------------------------
        // Pressing

        private void Copy()
        {
            if (_userId.Length == 0 || _clipboard != Clipboard.Idle) return;
            _clipboard = Clipboard.Copying;
            _clipboardDeadline = Time.realtimeSinceStartup + ClipboardSeconds;
            ShowroomClipboard.Copy(_userId);
        }

        private void Paste()
        {
            if (_clipboard != Clipboard.Idle) return;
            _clipboard = Clipboard.Pasting;
            _clipboardDeadline = Time.realtimeSinceStartup + ClipboardSeconds;
            ShowroomClipboard.Paste();
        }

        /// <summary>
        /// Hands over what the clipboard answered. A refusal is not a failure
        /// of the page: the browser decides, so the visitor is told how to do
        /// it by hand.
        /// </summary>
        private void PollClipboard()
        {
            if (_clipboard == Clipboard.Idle) return;
            var outcome = ShowroomClipboard.Poll(out var text);
            if (outcome == ShowroomClipboard.Outcome.Waiting)
            {
                if (Time.realtimeSinceStartup < _clipboardDeadline) return;
                // The browser has not answered; a late answer is dropped.
                ShowroomClipboard.Abandon();
                outcome = ShowroomClipboard.Outcome.Refused;
                text = "no answer";
            }
            var doing = _clipboard;
            _clipboard = Clipboard.Idle;
            if (doing == Clipboard.Copying)
            {
                FriendDemo.Log(outcome == ShowroomClipboard.Outcome.Done
                    ? "Copied your id. Send it to the other player."
                    : $"The browser did not let the page copy ({text}). Select the id above and copy it, or read it out.");
                return;
            }
            if (outcome != ShowroomClipboard.Outcome.Done)
            {
                FriendDemo.Log($"The browser did not let the page paste ({text}). Type the id into the field instead.");
                return;
            }
            if (_targetField != null) _targetField.text = text.Trim();
            LookUp();
        }

        private void LookUp()
        {
            var id = (_targetField?.text ?? "").Trim().ToLowerInvariant();
            if (id.Length == 0)
            {
                FriendDemo.Log("Paste or type another player's id first.");
                return;
            }
            if (!PlayerId.IsMatch(id))
            {
                FriendDemo.Log("That does not look like a player id: it has 36 letters, digits and dashes, like the one above.");
                return;
            }
            _targetId = id;
            _targetProfile = null;
            _targetFailed = false;
            if (id != _userId) WatchTarget(id);
            else _targetWatch.Stop();
            Draw();
        }

        private void SaveProfile()
        {
            var publicProfile = (_publicField?.text ?? "").Trim();
            var friendProfile = (_friendField?.text ?? "").Trim();
            var followerProfile = (_followerField?.text ?? "").Trim();
            if (publicProfile.Length == 0)
            {
                FriendDemo.Log("Choose a name first: other players see it on your requests.");
                return;
            }
            FriendDemo.Run(FriendPress.SaveProfile, async visitor =>
            {
                await visitor.Profile().UpdateAsync(new UpdateProfileRequest()
                    .WithPublicProfile(publicProfile)
                    .WithFriendProfile(friendProfile)
                    .WithFollowerProfile(followerProfile));
                _profileEdited = false;
                return "Saved your profile.";
            });
        }

        private void Send(string targetId) =>
            FriendDemo.Run(FriendPress.Send, async visitor =>
            {
                await visitor.SendRequestAsync(new SendRequestRequest().WithTargetUserId(targetId));
                return $"Sent a friend request to {TargetName(targetId)}.";
            });

        private void Cancel(string targetId) =>
            FriendDemo.Run(FriendPress.Cancel, async visitor =>
            {
                await visitor.SendFriendRequest(targetId).DeleteAsync(new DeleteRequestRequest());
                return $"Cancelled your request to {TargetName(targetId)}.";
            });

        private void Answer(string targetId, bool accept) =>
            FriendDemo.Run(accept ? FriendPress.Accept : FriendPress.Decline, async visitor =>
            {
                var request = visitor.ReceiveFriendRequest(targetId);
                if (accept) await request.AcceptAsync(new AcceptRequestRequest());
                else await request.RejectAsync(new RejectRequestRequest());
                return accept
                    ? $"You and {TargetName(targetId)} are now friends."
                    : $"Declined the request from {TargetName(targetId)}.";
            });

        private void Remove(string targetId) =>
            FriendDemo.Run(FriendPress.Remove, async visitor =>
            {
                await visitor.Friend(FriendDemo.WithProfile).DeleteFriendAsync(new DeleteFriendRequest().WithTargetUserId(targetId));
                return $"You and {TargetName(targetId)} are no longer friends.";
            });

        private void Follow(string targetId) =>
            FriendDemo.Run(FriendPress.Follow, async visitor =>
            {
                await visitor.Follow(FriendDemo.WithProfile).FollowAsync(new FollowRequest().WithTargetUserId(targetId));
                return $"You follow {TargetName(targetId)}.";
            });

        private void Unfollow(string targetId) =>
            FriendDemo.Run(FriendPress.Unfollow, async visitor =>
            {
                await visitor.Follow(FriendDemo.WithProfile).FollowUser(targetId).UnfollowAsync(new UnfollowRequest());
                return $"You no longer follow {TargetName(targetId)}.";
            }, whenGone: FriendDemo.ForgetFollows);

        private string TargetName(string targetId) =>
            _targetId == targetId && _targetProfile != null
                ? FriendDemo.NameOf(targetId, _targetProfile.Value)
                : FriendDemo.Tag(targetId);

        /// <summary>
        /// One subscription. Stopping it, or starting it again, retires its
        /// ticket: whatever the SDK reports under an old ticket is dropped,
        /// and a subscription that finishes starting after that is dropped at
        /// once.
        /// </summary>
        private sealed class Watch
        {
            private int _ticket;
            private Action? _unsubscribe;

            public bool Running { get; private set; }
            public bool Failed { get; private set; }

            public int Start()
            {
                Stop();
                Running = true;
                return _ticket;
            }

            public bool Is(int ticket) => Running && ticket == _ticket;

            public void Attach(int ticket, Action unsubscribe)
            {
                if (Is(ticket)) _unsubscribe = unsubscribe;
                else unsubscribe();
            }

            public bool Fail(int ticket)
            {
                if (!Is(ticket)) return false;
                Running = false;
                Failed = true;
                return true;
            }

            public void Stop()
            {
                _ticket++;
                Running = false;
                Failed = false;
                var unsubscribe = _unsubscribe;
                _unsubscribe = null;
                unsubscribe?.Invoke();
            }
        }

        // ------------------------------------------------------------------
        // Building blocks

        private InputField Field(RectTransform parent, string name, string placeholderText, int limit)
        {
            var field = Child(name, parent);
            field.gameObject.AddComponent<Image>().color = RowColor;
            field.gameObject.AddComponent<LayoutElement>().minHeight = 48;
            var placeholder = FieldText(field, "Placeholder", placeholderText, MutedText);
            placeholder.fontStyle = FontStyle.Italic;
            var text = FieldText(field, "Text", "", LightText);
            var input = field.gameObject.AddComponent<InputField>();
            input.textComponent = text;
            input.placeholder = placeholder;
            input.lineType = InputField.LineType.SingleLine;
            input.characterLimit = limit;
            return input;
        }

        private Text FieldText(RectTransform field, string name, string text, Color color)
        {
            var child = Child(name, field);
            child.anchorMin = Vector2.zero;
            child.anchorMax = Vector2.one;
            child.offsetMin = new Vector2(16, 6);
            child.offsetMax = new Vector2(-16, -6);
            var label = child.gameObject.AddComponent<Text>();
            label.font = _font;
            label.fontSize = 20;
            label.color = color;
            label.alignment = TextAnchor.MiddleLeft;
            label.supportRichText = false;
            label.text = text;
            return label;
        }

        private void Press(RectTransform parent, string text, Action onClick)
        {
            var button = Instantiate(_buttonTemplate!, parent);
            button.name = "Press";
            var label = button.GetComponentInChildren<Text>();
            if (label != null)
            {
                label.supportRichText = false;
                label.text = text;
            }
            button.onClick.RemoveAllListeners();
            button.onClick.AddListener(() => onClick());
        }

        private void Caption(RectTransform parent, string text, int size, Color color)
        {
            var caption = Child("Caption", parent);
            var label = caption.gameObject.AddComponent<Text>();
            label.font = _font;
            label.fontSize = size;
            label.color = color;
            label.supportRichText = false;
            label.text = text;
            caption.gameObject.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            caption.gameObject.AddComponent<LayoutElement>().minHeight = 24;
        }

        private static RectTransform Child(string name, RectTransform parent)
        {
            var child = new GameObject(name, typeof(RectTransform)).GetComponent<RectTransform>();
            child.SetParent(parent, false);
            return child;
        }

        private static void Clear(RectTransform parent)
        {
            for (var index = parent.childCount - 1; index >= 0; index--)
            {
                // Destroy waits for the end of the frame, and until then a
                // layout group still counts the child; an inactive one it
                // skips.
                var child = parent.GetChild(index).gameObject;
                child.SetActive(false);
                Destroy(child);
            }
        }
    }
}
