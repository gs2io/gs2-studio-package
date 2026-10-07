// Retry domain reads alongside subscriptions so a failed refresh does not leave this panel waiting only for another notification.
#nullable enable

using System;
using System.Collections;
using System.Linq;
using System.Threading.Tasks;

using UnityEngine;
using UnityEngine.UI;

using Cysharp.Threading.Tasks;
using Cysharp.Threading.Tasks.Linq;

using Gs2.Core.Exception;
using Gs2.Gs2Guild;
using Gs2.Gs2Guild.Exception;
using Gs2.Gs2Guild.Model;
using Gs2.Gs2Guild.Request;
using Gs2.Unity.Core;
using Gs2.Unity.Util;

using GuildModel = Gs2.Gs2Guild.Model.Guild;
using AuthAccessToken = Gs2.Gs2Auth.Model.AccessToken;
using VisitorDomain = Gs2.Gs2Guild.Domain.Model.UserAccessTokenDomain;
using GuildAccessTokenDomain = Gs2.Gs2Guild.Domain.Model.GuildAccessTokenDomain;

namespace GS2Studio.Showroom.Demo
{
    [AddComponentMenu("GS2 Studio/Showroom/Guild Lobby")]
    public sealed class GuildRoleLobbyPanel : MonoBehaviour
    {
        private const string GuildNamespace = "Guild";
        private const string GuildKind = "adventurers";
        private const string MasterRole = "master";

        private const float TickSeconds = 30f;
        private const int SearchLimit = 10;
        private const int NameLimit = 64;

        private const long GuildTokenMarginMs = 60_000;

        private static readonly Color RowColor = new Color(0.16f, 0.15f, 0.22f, 1f);
        private static readonly Color LightText = new Color(0.922f, 0.91f, 0.949f, 1f);
        private static readonly Color MutedText = new Color(0.643f, 0.616f, 0.729f, 1f);

        [SerializeField] private RectTransform? _panel;
        [SerializeField] private Button? _buttonTemplate;
        [SerializeField] private Font? _font;

        private ShowroomRegion? _region;
        private InputField? _nameField;
        private bool _approval;
        private Coroutine? _signingIn;

        private Gs2Domain? _gs2;
        private IGameSession? _session;
        private VisitorDomain? _visitor;
        private string _userId = "";

        // Apply SDK callbacks on the Unity thread and reconcile after draining the batch, instead of redrawing inside each callback.
        private readonly ShowroomInbox _inbox = new ShowroomInbox();
        private float _nextTick;

        private readonly ShowroomWatch _joinedWatch;
        private readonly ShowroomWatch _guildWatch;
        private readonly ShowroomWatch _receivedWatch;
        private readonly ShowroomWatch _sentWatch;
        private readonly ShowroomWatch _search;

        // Keep unread membership distinct from a confirmed empty joined list.
        private bool _membershipKnown;
        private string? _membership;

        private bool _entered;
        private string? _guildName;
        private GuildModel? _guild;
        private bool _guildGone;
        private ReceiveMemberRequest[] _received = Array.Empty<ReceiveMemberRequest>();
        private GuildAccessTokenDomain? _receivedFrom;
        private GuildModel[] _found = Array.Empty<GuildModel>();
        private bool _foundKnown;
        private SendMemberRequest[] _sent = Array.Empty<SendMemberRequest>();
        private bool _sentKnown;

        private AuthAccessToken? _guildToken;
        private string? _readFailure;

        public GuildRoleLobbyPanel()
        {
            // A transient reread failure must not discard the live subscription; Tick can retry the read.
            ShowroomWatch Watch(string what) => new ShowroomWatch(_inbox, ShowroomWatch.RereadFailure.Keep, what);
            _joinedWatch = Watch("the guilds");
            _guildWatch = Watch("your guild");
            _receivedWatch = Watch("the requests to join");
            _sentWatch = Watch("the sent requests");
            _search = Watch("the guild search");
        }

        private void OnEnable()
        {
            if (_panel == null || _buttonTemplate == null || _font == null)
            {
                ShowroomLog.Say("The guild lobby was baked without its region, button or font.");
                return;
            }
            if (_region == null) Build();
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
            while (!ShowroomRuntime.TryGet(out _, out _))
            {
                yield return new WaitForSeconds(0.25f);
            }
            _signingIn = null;
            StartWatching();
        }

        private void Build()
        {
            _nameField = Field(_panel!, "NameField", "Name your guild", NameLimit);
            _region = new ShowroomRegion(Region(_panel!, "Body"), _buttonTemplate!, _font!);
            _region.Draw(region => region.Caption("Reading the guilds...", 15, MutedText));
        }


        private void StartWatching()
        {
            if (!ShowroomRuntime.TryGet(out var gs2, out var session)) return;
            _gs2 = gs2;
            _session = session;
            _visitor = gs2.Super.Guild.Namespace(GuildNamespace).AccessToken(session.AccessToken);
            _userId = session.UserId;
            _nextTick = Time.realtimeSinceStartup + TickSeconds;
            WatchJoined();
        }

        // Stop subscriptions and discard queued notifications so the disabled panel stops rendering their results.
        private void StopWatching()
        {
            _joinedWatch.Stop();
            _guildWatch.Stop();
            _receivedWatch.Stop();
            _sentWatch.Stop();
            _search.Stop();
            _inbox.Clear();
            _gs2 = null;
            _session = null;
            _visitor = null;
            _membershipKnown = false;
            _membership = null;
            _entered = false;
            _guildName = null;
            _guild = null;
            _guildGone = false;
            _received = Array.Empty<ReceiveMemberRequest>();
            _receivedFrom = null;
            _found = Array.Empty<GuildModel>();
            _foundKnown = false;
            _sent = Array.Empty<SendMemberRequest>();
            _sentKnown = false;
            _guildToken = null;
        }

        private void Update()
        {
            if (_visitor == null) return;
            if (_inbox.Drain()) Reconcile();
            if (Time.realtimeSinceStartup >= _nextTick) Tick();
        }

        private void Reconcile()
        {
            if (!_membershipKnown) return;
            if (!_entered || _membership != _guildName) Enter(_membership);
            if (_guildName != null)
            {
                if (_guildGone)
                {
                    // A missing guild model does not prove membership is cleared; do not offer create/join controls yet.
                    ReadFailed("Your guild could not be read.");
                    return;
                }
                if (_guild != null) FollowRole(_guild);
            }
            Draw();
        }

        // Stop old watches before switching state so their ticket checks reject late results for the previous guild.
        private void Enter(string? guildName)
        {
            _guildWatch.Stop();
            StopReceived();
            _sentWatch.Stop();
            _search.Stop();
            _entered = true;
            _guildName = guildName;
            _guild = null;
            _guildGone = false;
            _found = Array.Empty<GuildModel>();
            _foundKnown = false;
            _sent = Array.Empty<SendMemberRequest>();
            _sentKnown = false;
            if (guildName != null)
            {
                WatchGuild(guildName);
            }
            else
            {
                WatchSent();
                Search();
            }
        }

        private void FollowRole(GuildModel guild)
        {
            if (RoleOf(guild, _userId) == MasterRole)
            {
                if (_receivedWatch.Idle) WatchReceived(guild.Name);
            }
            else
            {
                // Do not reuse cached master credentials after the membership role changes.
                if (!_receivedWatch.Idle) StopReceived();
                _guildToken = null;
            }
        }

        private void StopReceived()
        {
            _receivedWatch.Stop();
            _received = Array.Empty<ReceiveMemberRequest>();
            _receivedFrom = null;
            _guildToken = null;
        }

        // Received-request subscriptions retain the guild token; renew it early enough for the next periodic reread.
        private void Tick()
        {
            _nextTick = Time.realtimeSinceStartup + TickSeconds;
            if (_joinedWatch.Failed) WatchJoined();
            else _joinedWatch.Reread();
            if (!_entered) return;
            if (_guildName == null)
            {
                if (_sentWatch.Failed) WatchSent();
                else _sentWatch.Reread();
                Search();
                return;
            }
            if (_guildWatch.Failed) WatchGuild(_guildName);
            else _guildWatch.Reread();
            if (_receivedWatch.Failed && _guild != null) WatchReceived(_guild.Name);
            else if (_receivedWatch.Running) RenewGuildToken(_guildName);
        }

        private void WatchJoined()
        {
            var visitor = _visitor;
            if (visitor == null) return;
            _joinedWatch.SubscribeList<JoinedGuild>(
                callback => visitor.SubscribeJoinedGuildsWithInitialCallAsync(callback, GuildKind),
                id => visitor.UnsubscribeJoinedGuilds(id, GuildKind),
                () => visitor.JoinedGuildsAsync(GuildKind),
                joined =>
                {
                    // The cache subscription is shared across guild kinds; filter before selecting this panel's membership.
                    _membership = joined.FirstOrDefault(entry => entry?.GuildModelName == GuildKind)?.GuildName;
                    _membershipKnown = true;
                    _readFailure = null;
                },
                error => ReadFailed("The guilds", error));
        }

        private void WatchGuild(string guildName)
        {
            var gs2 = _gs2;
            var session = _session;
            if (gs2 == null || session == null) return;
            var guild = gs2.Super.Guild.Namespace(GuildNamespace).Guild(GuildKind, guildName);
            _guildWatch.Subscribe<GuildModel>(
                callback => guild.SubscribeWithInitialCallAsync(session.AccessToken, callback),
                guild.Unsubscribe,
                model =>
                {
                    _guild = model;
                    _guildGone = model == null;
                    if (model != null)
                    {
                        _readFailure = null;
                        return;
                    }
                    // A missing guild contradicts the cached membership; invalidate that list so membership can be reevaluated.
                    _visitor?.InvalidateJoinedGuilds(GuildKind);
                },
                async () => await guild.ModelAsync(session.AccessToken),
                error => ReadFailed("Your guild", error));
        }

        private async void WatchReceived(string guildName)
        {
            var gs2 = _gs2;
            var session = _session;
            if (gs2 == null || session == null) return;
            // Reserve the watch while assuming the token so role reconciliation cannot start a duplicate subscription.
            var ticket = _receivedWatch.Start();
            AuthAccessToken token;
            try
            {
                token = await GuildToken(new Gs2GuildRestClient(gs2.Super.RestSession), session.AccessToken.Token, guildName, GuildTokenMarginMs);
            }
            catch (Exception error)
            {
                if (!_receivedWatch.Fail(ticket)) return;
                _inbox.Post(() =>
                {
                    _guildToken = null;
                    ReadFailed("The requests to join", error);
                });
                return;
            }
            if (!_receivedWatch.Is(ticket)) return;
            var guild = gs2.Super.Guild.Namespace(GuildNamespace).GuildAccessToken(GuildKind, token);
            _receivedWatch.SubscribeList<ReceiveMemberRequest>(
                callback => guild.SubscribeReceiveRequestsWithInitialCallAsync(callback),
                guild.UnsubscribeReceiveRequests,
                () => guild.ReceiveRequestsAsync(),
                received =>
                {
                    _received = received;
                    _receivedFrom = guild;
                },
                error =>
                {
                    _guildToken = null;
                    ReadFailed("The requests to join", error);
                });
        }

        private void WatchSent()
        {
            var visitor = _visitor;
            if (visitor == null) return;
            _sentWatch.SubscribeList<SendMemberRequest>(
                callback => visitor.SubscribeSendRequestsWithInitialCallAsync(callback, GuildKind),
                id => visitor.UnsubscribeSendRequests(id, GuildKind),
                () => visitor.SendRequestsAsync(GuildKind),
                sent =>
                {
                    _sent = sent;
                    _sentKnown = true;
                    _readFailure = null;
                },
                error => ReadFailed("The guilds", error));
        }

        // A response may arrive after another search or guild switch; accept it only through the current watch ticket.
        private async void Search()
        {
            var visitor = _visitor;
            if (visitor == null || !_entered || _guildName != null) return;
            _nextTick = Time.realtimeSinceStartup + TickSeconds;
            var ticket = _search.Start();
            try
            {
                var found = await visitor.SearchGuildsAsync(
                        GuildKind,
                        includeFullMembersGuild: false,
                        orderBy: "last_updated")
                    .Take(SearchLimit)
                    .ToArrayAsync();
                _search.Post(ticket, () =>
                {
                    _found = found;
                    _foundKnown = true;
                    _readFailure = null;
                });
            }
            catch (Exception error)
            {
                if (!_search.Fail(ticket)) return;
                _inbox.Post(() => ReadFailed("The guilds", error));
            }
        }

        // Refresh the token object retained by the request subscription before rereading through that subscription.
        private async void RenewGuildToken(string guildName)
        {
            var gs2 = _gs2;
            var session = _session;
            if (gs2 == null || session == null) return;
            try
            {
                await GuildToken(new Gs2GuildRestClient(gs2.Super.RestSession), session.AccessToken.Token, guildName,
                    GuildTokenMarginMs + (long)(TickSeconds * 1000));
                _receivedWatch.Reread();
            }
            catch (Exception error)
            {
                // Keep the watch available for a later retry; renewal failure does not establish that its token is already expired.
                Debug.LogWarning($"[showroom] {nameof(GuildRoleLobbyPanel)}: the guild token could not be renewed: {error}");
            }
        }

        // Periodic retries can repeat one failure; deduplicate page messages while preserving console diagnostics.
        private void ReadFailed(string what, Exception error)
        {
            Debug.LogWarning($"[showroom] {nameof(GuildRoleLobbyPanel)}: {what} could not be read: {error}");
            ReadFailed($"{what} could not be read: {ShowroomErrors.Describe(error)}");
        }

        private void ReadFailed(string message)
        {
            if (this == null || message == _readFailure) return;
            _readFailure = message;
            ShowroomLog.Say(message);
        }

        // Renew the existing token object only if it is still current and belongs to the same guild; subscribers retain its reference.
        private async Task<AuthAccessToken> GuildToken(Gs2GuildRestClient client, string token, string guildName, long marginMs)
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var kept = _guildToken;
            if (kept != null && kept.UserId == guildName && (kept.Expire ?? 0) > now + marginMs)
            {
                return kept;
            }
            var assumed = await client.AssumeAsync(new AssumeRequest()
                .WithNamespaceName(GuildNamespace)
                .WithGuildModelName(GuildKind)
                .WithGuildName(guildName)
                .WithAccessToken(token));
            if (kept != null && kept == _guildToken && kept.UserId == assumed.UserId)
            {
                kept.WithToken(assumed.Token).WithExpire(assumed.Expire);
                return kept;
            }
            _guildToken = new AuthAccessToken()
                .WithToken(assumed.Token)
                .WithUserId(assumed.UserId)
                .WithExpire(assumed.Expire);
            return _guildToken;
        }

        private static string? RoleOf(GuildModel guild, string userId) =>
            guild.Members?.FirstOrDefault(member => member.UserId == userId)?.RoleName;


        // Keep the previous region until the new state is readable, rather than rendering unread lists as empty.
        private void Draw()
        {
            if (_region == null || _nameField == null || !_entered) return;
            if (_guildName != null)
            {
                var guild = _guild;
                if (guild == null) return;
                _nameField.gameObject.SetActive(false);
                _region.Draw(region => DescribeGuild(region, guild));
            }
            else
            {
                if (!_sentKnown || !_foundKnown) return;
                _nameField.gameObject.SetActive(true);
                _region.Draw(DescribeLobby);
            }
        }

        private void DescribeGuild(ShowroomRegion.Description region, GuildModel guild)
        {
            var members = guild.Members ?? Array.Empty<Member>();
            var master = RoleOf(guild, _userId) == MasterRole;
            region.Caption($"{guild.DisplayName}  ({members.Length}/{guild.CurrentMaximumMemberCount ?? 0}, {JoinPolicyText(guild.JoinPolicy)})", 18, LightText);
            foreach (var member in members.OrderBy(member => member.JoinedAt ?? 0))
            {
                var you = member.UserId == _userId ? "  (you)" : "";
                region.Caption($"{ShowroomPlayerTag.Of(member.UserId)}  {member.RoleName}{you}", 16, member.UserId == _userId ? LightText : MutedText);
            }

            if (master)
            {
                if (_received.Length > 0) region.Caption("Requests to join", 15, MutedText);
                foreach (var request in _received)
                {
                    var from = request.UserId;
                    region.Press($"Accept {ShowroomPlayerTag.Of(from)}", () => Answer(guild.Name, from, true));
                    region.Press($"Decline {ShowroomPlayerTag.Of(from)}", () => Answer(guild.Name, from, false));
                }
                var others = members.Where(member => member.UserId != _userId).OrderBy(member => member.JoinedAt ?? 0).ToArray();
                if (others.Length > 0)
                {
                    var heir = others[0].UserId;
                    region.Press($"Hand over to {ShowroomPlayerTag.Of(heir)} and leave", () => HandOver(guild.Name, heir));
                }
                else
                {
                    region.Press("Disband the guild", () => Disband(guild.Name));
                }
            }
            else
            {
                region.Press("Leave the guild", () => Leave(guild.Name));
            }
        }

        private void DescribeLobby(ShowroomRegion.Description region)
        {
            region.Press($"Join policy: {JoinPolicyText(_approval ? "approval" : "anybody")} (press to change)", () =>
            {
                _approval = !_approval;
                Draw();
            });
            region.Press("Create a guild with this name", Create);

            region.Caption("Guilds you can join", 15, MutedText);
            if (_found.Length == 0) region.Caption("No guild has room right now. Create one.", 15, MutedText);
            foreach (var guild in _found)
            {
                var name = guild.Name;
                var pending = _sent.Any(request => request.TargetGuildName == name);
                var approval = guild.JoinPolicy == "approval";
                var label = $"{guild.DisplayName}  ({guild.Members?.Length ?? 0}/{guild.CurrentMaximumMemberCount ?? 0})";
                if (pending)
                {
                    region.Press($"Cancel the request to {label}", () => CancelRequest(name));
                }
                else
                {
                    region.Press(approval ? $"Ask to join {label}" : $"Join {label}", () => Join(name, approval));
                }
            }
        }

        private static string JoinPolicyText(string? policy) =>
            policy == "approval" ? "the master approves" : "anybody joins";


        private void Create()
        {
            var name = (_nameField?.text ?? "").Trim();
            if (name.Length == 0 || name.Length > NameLimit || name.Any(char.IsControl))
            {
                ShowroomLog.Say($"Name the guild first, in 1 to {NameLimit} characters.");
                return;
            }
            var policy = _approval ? "approval" : "anybody";
            Run(async (gs2, session) =>
            {
                await gs2.Super.Guild.Namespace(GuildNamespace).AccessToken(session.AccessToken)
                    .CreateGuildAsync(new CreateGuildRequest()
                        .WithGuildModelName(GuildKind)
                        .WithDisplayName(name)
                        .WithJoinPolicy(policy));
                if (_nameField != null) _nameField.text = "";
                return $"Created {name}.";
            });
        }

        // A pending approval leaves the visitor in the lobby; refresh search results unless joining completed immediately.
        private void Join(string guildName, bool approval)
        {
            var joined = false;
            Run(async (gs2, session) =>
            {
                await gs2.Super.Guild.Namespace(GuildNamespace).AccessToken(session.AccessToken)
                    .SendRequestAsync(new SendRequestRequest()
                        .WithGuildModelName(GuildKind)
                        .WithTargetGuildName(guildName));
                joined = !approval;
                return approval ? "Asked to join; the master decides." : "Joined the guild.";
            }, afterward: () =>
            {
                if (!joined) Search();
            });
        }

        private void CancelRequest(string guildName) =>
            Run(async (gs2, session) =>
            {
                await gs2.Super.Guild.Namespace(GuildNamespace).AccessToken(session.AccessToken)
                    .DeleteAsync(new DeleteRequestRequest()
                        .WithGuildModelName(GuildKind)
                        .WithTargetGuildName(guildName));
                return "Cancelled the request.";
            }, afterward: Search);

        private void Leave(string guildName) =>
            Run(async (gs2, session) =>
            {
                await gs2.Super.Guild.Namespace(GuildNamespace).AccessToken(session.AccessToken)
                    .JoinedGuild(GuildKind, guildName)
                    .WithdrawalAsync(new WithdrawalRequest());
                return "Left the guild.";
            }, whenGone: ReadJoinedAgain);

        private void Answer(string guildName, string fromUserId, bool accept) =>
            Run(async (gs2, session) =>
            {
                var guild = await AsGuild(gs2, session, guildName);
                var request = guild.ReceiveMemberRequest(fromUserId);
                if (accept) await request.AcceptAsync(new AcceptRequestRequest());
                else await request.RejectAsync(new RejectRequestRequest());
                return accept ? $"Accepted {ShowroomPlayerTag.Of(fromUserId)}." : $"Declined {ShowroomPlayerTag.Of(fromUserId)}.";
            }, whenGone: () => _receivedFrom?.InvalidateReceiveRequests());

        // Promote the successor before leaving so the guild is not left without a master.
        private void HandOver(string guildName, string heir) =>
            Run(async (gs2, session) =>
            {
                var guild = await AsGuild(gs2, session, guildName);
                await guild.UpdateMemberRoleAsync(new UpdateMemberRoleRequest()
                    .WithTargetUserId(heir)
                    .WithRoleName(MasterRole));
                await gs2.Super.Guild.Namespace(GuildNamespace).AccessToken(session.AccessToken)
                    .JoinedGuild(GuildKind, guildName)
                    .WithdrawalAsync(new WithdrawalRequest());
                _guildToken = null;
                return $"Handed the guild to {ShowroomPlayerTag.Of(heir)} and left.";
            }, whenGone: ReadJoinedAgain);

        private void Disband(string guildName) =>
            Run(async (gs2, session) =>
            {
                var guild = await AsGuild(gs2, session, guildName);
                await guild.DeleteAsync(new DeleteGuildRequest());
                _guildToken = null;
                return "Disbanded the guild.";
            }, whenGone: ReadJoinedAgain);

        // An action against a missing guild can leave membership stale; reread it instead of assuming a leave succeeded.
        private void ReadJoinedAgain() => _visitor?.InvalidateJoinedGuilds(GuildKind);

        private async Task<GuildAccessTokenDomain> AsGuild(Gs2Domain gs2, IGameSession session, string? guildName)
        {
            if (guildName == null) throw new InvalidOperationException("Not in a guild.");
            var token = await GuildToken(new Gs2GuildRestClient(gs2.Super.RestSession), session.AccessToken.Token, guildName, GuildTokenMarginMs);
            return gs2.Super.Guild.Namespace(GuildNamespace).GuildAccessToken(GuildKind, token);
        }

        private void Run(Func<Gs2Domain, IGameSession, Task<string>> press, Action? afterward = null, Action? whenGone = null)
        {
            ShowroomPress.Run(new ShowroomPressOptions
            {
                Name = nameof(GuildRoleLobbyPanel),
                Owner = this,
                Explain = Explain,
                WhenGone = whenGone,
                Afterward = afterward,
            }, press);
        }

        private static string? Explain(Gs2Exception error)
        {
            if (error is MaximumJoinedGuildsReachedException) return "That player already belongs to a guild.";
            if (error is MaximumMembersReachedException) return "That guild is full.";
            if (error is GuildMasterRequiredException) return "A guild cannot be left without a master; hand it over or disband it.";
            if (error is NotFoundException) return "That guild is gone.";
            return null;
        }


        private static RectTransform Region(RectTransform parent, string name)
        {
            var region = Child(name, parent);
            var layout = region.gameObject.AddComponent<VerticalLayoutGroup>();
            layout.spacing = 8;
            layout.childControlWidth = true;
            layout.childControlHeight = true;
            layout.childForceExpandWidth = true;
            layout.childForceExpandHeight = false;
            return region;
        }

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

        private static RectTransform Child(string name, RectTransform parent)
        {
            var child = new GameObject(name, typeof(RectTransform)).GetComponent<RectTransform>();
            child.SetParent(parent, false);
            return child;
        }
    }
}
