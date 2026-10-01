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
// Each read is a `ShowroomWatch`, which hands what the SDK reports to the
// panel's `ShowroomInbox`, drained in `Update`. The SDK can hand a watcher an
// empty list while it is still reading the list again, so an empty list is
// read again through the domain before it is believed; a list that cannot be
// read again fails its watch. A watch that failed is started again every 30
// seconds.
//
// The result area is a `ShowroomRegion`: rebuilt only when what it shows
// changed, and the page's presses wait a moment after it moved.
#nullable enable

using System;
using System.Collections;
using System.Linq;
using System.Text.RegularExpressions;

using UnityEngine;
using UnityEngine.UI;

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
        private ShowroomRegion? _result;
        private Coroutine? _signingIn;

        /// <summary>The panel's Copy or Paste, until the browser answers.</summary>
        private readonly ShowroomClipboardRequest _clipboard = new ShowroomClipboardRequest();

        /// <summary>The visitor, set once they are signed in.</summary>
        private Gs2.Unity.Core.Gs2Domain? _gs2;
        private VisitorDomain? _visitor;
        private FollowDomain? _follow;
        private string _userId = "";

        /// <summary>
        /// What the SDK said, handed over to the main thread. Update applies
        /// everything that arrived since the last frame and then draws once.
        /// </summary>
        private readonly ShowroomInbox _inbox = new ShowroomInbox();
        private float _nextTick;

        private readonly ShowroomWatch _profileWatch;
        private readonly ShowroomWatch _friendsWatch;
        private readonly ShowroomWatch _sentWatch;
        private readonly ShowroomWatch _receivedWatch;
        private readonly ShowroomWatch _followsWatch;
        private readonly ShowroomWatch _targetWatch;

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

        public ProfileFriendsPanel()
        {
            // A list that cannot be read again is subscribed afresh by the tick.
            ShowroomWatch Watch(string what) => new ShowroomWatch(_inbox, ShowroomWatch.RereadFailure.Restart, what);
            _profileWatch = Watch("your profile");
            _friendsWatch = Watch("your friends");
            _sentWatch = Watch("the requests you sent");
            _receivedWatch = Watch("the requests sent to you");
            _followsWatch = Watch("the players you follow");
            _targetWatch = Watch("the profile of the player looked up");
        }

        private void OnEnable()
        {
            if (_panel == null || _buttonTemplate == null || _font == null)
            {
                ShowroomLog.Say("The friend panel was baked without its region, button or font.");
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
            _clipboard.Abandon();
        }

        private IEnumerator WaitForSignIn()
        {
            while (!ShowroomRuntime.TryGet(out _, out _))
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

            var result = Child("Result", panel);
            _result = new ShowroomRegion(result, _buttonTemplate!, _font!);
            var layout = result.gameObject.AddComponent<VerticalLayoutGroup>();
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
            if (!ShowroomRuntime.TryGet(out var gs2, out var session)) return;
            _gs2 = gs2;
            _visitor = FriendDemo.Visitor(gs2, session);
            _follow = _visitor.Follow(FriendDemo.WithProfile);
            _userId = session.UserId;
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
            _inbox.Clear();
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
        }

        private void Update()
        {
            _clipboard.Poll();
            if (_visitor == null) return;
            if (_inbox.Drain()) Draw();
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

        /// <summary>
        /// Says a watch that could not start, once per start; the tick starts
        /// it again.
        /// </summary>
        private static void WatchFailed(ShowroomWatch watch, Exception error)
        {
            var what = char.ToUpperInvariant(watch.What[0]) + watch.What.Substring(1);
            ShowroomLog.Failure($"{what} could not be read", error);
        }

        private void WatchFriends()
        {
            var visitor = _visitor!;
            _friendsWatch.SubscribeList<FriendUser>(
                callback => visitor.SubscribeFriendsWithInitialCallAsync(callback, FriendDemo.WithProfile),
                id => visitor.UnsubscribeFriends(id, FriendDemo.WithProfile),
                () => visitor.FriendsAsync(FriendDemo.WithProfile),
                items => _friends = Store(_friends, items, friend => friend.UserId),
                error => WatchFailed(_friendsWatch, error));
        }

        private void WatchSent()
        {
            var visitor = _visitor!;
            _sentWatch.SubscribeList<SendFriendRequest>(
                callback => visitor.SubscribeSendRequestsWithInitialCallAsync(callback),
                id => visitor.UnsubscribeSendRequests(id),
                () => visitor.SendRequestsAsync(),
                items => _sent = Store(_sent, items, request => request.TargetUserId),
                error => WatchFailed(_sentWatch, error));
        }

        private void WatchReceived()
        {
            var visitor = _visitor!;
            _receivedWatch.SubscribeList<ReceiveFriendRequest>(
                callback => visitor.SubscribeReceiveRequestsWithInitialCallAsync(callback),
                id => visitor.UnsubscribeReceiveRequests(id),
                () => visitor.ReceiveRequestsAsync(),
                items => _received = Store(_received, items, request => request.UserId),
                error => WatchFailed(_receivedWatch, error));
        }

        private void WatchFollows()
        {
            var follow = _follow!;
            _followsWatch.SubscribeList<FollowUser>(
                callback => follow.SubscribeFollowsWithInitialCallAsync(callback),
                id => follow.UnsubscribeFollows(id),
                () => follow.FollowsAsync(),
                items => _follows = Store(_follows, items, follow => follow.UserId),
                error => WatchFailed(_followsWatch, error));
        }

        /// <summary>
        /// Keeps what a list now holds, and tells the page when the players
        /// on it changed: rows appear or vanish then, and presses wait a
        /// moment for the buttons to settle.
        /// </summary>
        private static T[] Store<T>(T[]? before, T[] after, Func<T, string?> key)
        {
            if (before == null || !before.Select(key).SequenceEqual(after.Select(key))) ShowroomSettle.MarkChanged();
            return after;
        }

        /// <summary>
        /// The visitor's own profile. GS2 creates it on the first read; a
        /// visitor who has no name yet is given their tag, once.
        /// </summary>
        private void WatchProfile()
        {
            var visitor = _visitor;
            if (visitor == null) return;
            var profile = visitor.Profile();
            _profileWatch.Subscribe<Profile>(
                callback => profile.SubscribeWithInitialCallAsync(callback),
                profile.Unsubscribe,
                model =>
                {
                    if (model == null) return;
                    _profile = model;
                    FillProfileFields(model);
                    NameIfUnnamed(model);
                },
                failed: error => WatchFailed(_profileWatch, error));
        }

        /// <summary>The public profile of the player looked up.</summary>
        private void WatchTarget(string userId)
        {
            var gs2 = _gs2;
            if (gs2 == null) return;
            PublicProfileDomain profile = gs2.Super.Friend.Namespace(FriendDemo.Namespace).User(userId).PublicProfile();
            _targetProfile = null;
            _targetFailed = false;
            _targetWatch.Subscribe<PublicProfile>(
                callback => profile.SubscribeWithInitialCallAsync(callback),
                profile.Unsubscribe,
                model =>
                {
                    if (model != null) _targetProfile = model;
                },
                failed: error =>
                {
                    // Said in the result area rather than the log.
                    Debug.LogWarning($"[showroom] {nameof(ProfileFriendsPanel)}: the profile of {userId} could not be read: {error}");
                    _targetFailed = true;
                    Draw();
                });
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
            var name = ShowroomPlayerTag.Of(_userId);
            // Tried again on the next profile read when the press could not start.
            _defaultNameTried = FriendDemo.Run(FriendPress.SaveProfile, this, async visitor =>
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

        /// <summary>
        /// What the visitor and the player looked up are to each other. The
        /// region is rebuilt only when that changed, so a button is not
        /// replaced under the cursor by an identical one.
        /// </summary>
        private void Draw()
        {
            _result?.Draw(Describe);
        }

        private void Describe(ShowroomRegion.Description region)
        {
            var targetId = _targetId;
            if (targetId == null) return;
            if (targetId == _userId)
            {
                region.Caption("That is your own id. Look up another player's.", 16, LightText);
                return;
            }
            var name = _targetProfile == null
                ? (_targetFailed ? $"{ShowroomPlayerTag.Of(targetId)} (their profile could not be read)" : $"{ShowroomPlayerTag.Of(targetId)} (reading...)")
                : FriendDemo.NameOf(targetId, _targetProfile.Value);
            region.Caption(name, 18, LightText);
            if (_targetProfile != null && string.IsNullOrWhiteSpace(_targetProfile.Value))
            {
                // GS2 creates a profile on the first read, so an id nobody
                // uses reads as a player without a name.
                region.Caption("This player has no name yet. Check the id if you expected one.", 14, MutedText);
            }
            if (_friends == null || _sent == null || _received == null || _follows == null)
            {
                region.Caption("Reading your lists...", 15, MutedText);
                return;
            }

            if (_friends.Any(friend => friend.UserId == targetId))
            {
                region.Caption("You are friends.", 15, MutedText);
                region.Press("Remove friend", () => Remove(targetId));
            }
            else if (_sent.Any(request => request.TargetUserId == targetId))
            {
                region.Caption("You asked to be friends. Waiting for their answer.", 15, MutedText);
                region.Press("Cancel your request", () => Cancel(targetId));
            }
            else if (_received.Any(request => request.UserId == targetId))
            {
                region.Caption("They asked to be friends.", 15, MutedText);
                region.Press("Accept their request", () => Answer(targetId, true));
                region.Press("Decline their request", () => Answer(targetId, false));
            }
            else
            {
                region.Press("Send a friend request", () => Send(targetId));
            }

            if (_follows.Any(follow => follow.UserId == targetId))
            {
                region.Press("Unfollow", () => Unfollow(targetId));
            }
            else
            {
                region.Press("Follow", () => Follow(targetId));
            }
        }

        // ------------------------------------------------------------------
        // Pressing

        // A clipboard refusal is not a failure of the page: the browser
        // decides, so the visitor is told how to do it by hand.

        private void Copy()
        {
            if (_userId.Length == 0 || _clipboard.Pending) return;
            if (!_clipboard.Copy(_userId,
                    () => ShowroomLog.Say("Copied your id. Send it to the other player."),
                    reason => ShowroomLog.Say($"The browser did not let the page copy ({reason}). Select the id above and copy it, or read it out.")))
            {
                ShowroomLog.Say("One moment: the browser is still answering the last copy or paste.");
            }
        }

        private void Paste()
        {
            if (_clipboard.Pending) return;
            if (!_clipboard.Paste(
                    text =>
                    {
                        if (_targetField != null) _targetField.text = text.Trim();
                        LookUp();
                    },
                    reason => ShowroomLog.Say($"The browser did not let the page paste ({reason}). Type the id into the field instead.")))
            {
                ShowroomLog.Say("One moment: the browser is still answering the last copy or paste.");
            }
        }

        private void LookUp()
        {
            var id = (_targetField?.text ?? "").Trim().ToLowerInvariant();
            if (id.Length == 0)
            {
                ShowroomLog.Say("Paste or type another player's id first.");
                return;
            }
            if (!PlayerId.IsMatch(id))
            {
                ShowroomLog.Say("That does not look like a player id: it has 36 letters, digits and dashes, like the one above.");
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
                ShowroomLog.Say("Choose a name first: other players see it on your requests.");
                return;
            }
            FriendDemo.Run(FriendPress.SaveProfile, this, async visitor =>
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
            FriendDemo.Run(FriendPress.Send, this, async visitor =>
            {
                await visitor.SendRequestAsync(new SendRequestRequest().WithTargetUserId(targetId));
                return $"Sent a friend request to {TargetName(targetId)}.";
            });

        private void Cancel(string targetId) =>
            FriendDemo.Run(FriendPress.Cancel, this, async visitor =>
            {
                await visitor.SendFriendRequest(targetId).DeleteAsync(new DeleteRequestRequest());
                return $"Cancelled your request to {TargetName(targetId)}.";
            });

        private void Answer(string targetId, bool accept) =>
            FriendDemo.Run(accept ? FriendPress.Accept : FriendPress.Decline, this, async visitor =>
            {
                var request = visitor.ReceiveFriendRequest(targetId);
                if (accept) await request.AcceptAsync(new AcceptRequestRequest());
                else await request.RejectAsync(new RejectRequestRequest());
                return accept
                    ? $"You and {TargetName(targetId)} are now friends."
                    : $"Declined the request from {TargetName(targetId)}.";
            });

        private void Remove(string targetId) =>
            FriendDemo.Run(FriendPress.Remove, this, async visitor =>
            {
                await visitor.Friend(FriendDemo.WithProfile).DeleteFriendAsync(new DeleteFriendRequest().WithTargetUserId(targetId));
                return $"You and {TargetName(targetId)} are no longer friends.";
            });

        private void Follow(string targetId) =>
            FriendDemo.Run(FriendPress.Follow, this, async visitor =>
            {
                await visitor.Follow(FriendDemo.WithProfile).FollowAsync(new FollowRequest().WithTargetUserId(targetId));
                return $"You follow {TargetName(targetId)}.";
            });

        private void Unfollow(string targetId)
        {
            var visitor = _visitor;
            FriendDemo.Run(FriendPress.Unfollow, this, async following =>
            {
                await following.Follow(FriendDemo.WithProfile).FollowUser(targetId).UnfollowAsync(new UnfollowRequest());
                return $"You no longer follow {TargetName(targetId)}.";
            }, whenGone: () =>
            {
                if (visitor != null) FriendDemo.ForgetFollows(visitor);
            });
        }

        private string TargetName(string targetId) =>
            _targetId == targetId && _targetProfile != null
                ? FriendDemo.NameOf(targetId, _targetProfile.Value)
                : ShowroomPlayerTag.Of(targetId);

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

        /// <summary>A button of the panel's fixed part, which never moves.</summary>
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
    }
}
