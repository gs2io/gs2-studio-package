// The guild lobby: founding, finding and joining a guild, answering join
// requests, and leaving, handing over or disbanding.
//
// A row of the page reads one value or makes one press, and a lobby is a
// search, a form and a guild's worth of members, so this draws its own region.
// None of it is an action a package can host.
//
// Reads go through the SDK's domain and are watched in its cache: the guilds
// the visitor joined, then either their guild (and, for a master, the
// requests it received) or the requests the visitor sent. GS2's notifications
// clear those caches when another player joins, leaves or asks, and the SDK's
// own writes update them after a press, so the SDK reads them again and the
// panel hears the result. Nothing is asked of GS2 on a timer except the guild
// search, which the cache cannot hold: it is asked again every 30 seconds
// while the visitor has no guild (GS2 keeps a search for a minute anyway), on
// entering the lobby, and after a press that changes it.
//
// The SDK swallows a failed read after a notification, and hands a watcher an
// empty list whenever something touches a list it no longer holds (after its
// 15 minutes run out, or while it is still reading every page). So every 30
// seconds, and whenever a watch reports an empty list, the panel reads the
// watched value again through the domain. The domain answers from the cache
// without asking GS2 while it holds the value, so this costs nothing while all
// is well, and reads it from GS2 only when the cache lost it.
//
// Writes go through the same domain, so the generated rows of the guilds the
// visitor belongs to update from there too. A list is invalidated here only
// when GS2 answers that something on it no longer exists (the visitor's guild,
// or a request to join it), since no notification would correct it.
//
// Answering requests, handing over and disbanding are done as the guild: the
// master assumes the guild, and GS2 lets the guild token do only what the
// master role's policy allows.
#nullable enable

using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

using UnityEngine;
using UnityEngine.UI;

using Cysharp.Threading.Tasks;
using Cysharp.Threading.Tasks.Linq;

using Gs2.Core.Exception;
using Gs2.Gs2Guild;
using Gs2.Gs2Guild.Model;
using Gs2.Gs2Guild.Request;
using Gs2.Unity.Core;
using Gs2.Unity.Util;

using GuildModel = Gs2.Gs2Guild.Model.Guild;
using AuthAccessToken = Gs2.Gs2Auth.Model.AccessToken;
using VisitorDomain = Gs2.Gs2Guild.Domain.Model.UserAccessTokenDomain;
using GuildDomain = Gs2.Gs2Guild.Domain.Model.GuildDomain;
using GuildAccessTokenDomain = Gs2.Gs2Guild.Domain.Model.GuildAccessTokenDomain;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>Draws the guild lobby into the region the page gives it.</summary>
    [AddComponentMenu("GS2 Studio/Showroom/Guild Lobby")]
    public sealed class GuildRoleLobbyPanel : MonoBehaviour
    {
        /// <summary>The guild namespace and kind the packages deploy.</summary>
        private const string GuildNamespace = "Guild";
        private const string GuildKind = "adventurers";
        private const string MasterRole = "master";

        /// <summary>
        /// How often the lobby searches again, and how often a watch that
        /// failed to start is tried again. GS2 keeps a search for a minute.
        /// </summary>
        private const float TickSeconds = 30f;
        private const int SearchLimit = 10;
        private const int NameLimit = 64;

        /// <summary>How long before it runs out the guild token is renewed.</summary>
        private const long GuildTokenMarginMs = 60_000;

        private static readonly Color RowColor = new Color(0.16f, 0.15f, 0.22f, 1f);
        private static readonly Color LightText = new Color(0.922f, 0.91f, 0.949f, 1f);
        private static readonly Color MutedText = new Color(0.643f, 0.616f, 0.729f, 1f);

        [SerializeField] private RectTransform? _panel;
        [SerializeField] private Button? _buttonTemplate;
        [SerializeField] private Font? _font;

        private RectTransform? _body;
        private InputField? _nameField;
        private bool _approval;
        private bool _busy;
        private Coroutine? _signingIn;
        private ShowroomPage? _page;

        /// <summary>The visitor, set once they are signed in.</summary>
        private Gs2Domain? _gs2;
        private IGameSession? _session;
        private VisitorDomain? _visitor;
        private string _userId = "";

        /// <summary>
        /// What the SDK said, handed over to the main thread. Update applies
        /// everything that arrived since the last frame and then draws once,
        /// so a list the SDK reports empty while it is still reading it again
        /// is replaced by the full list before anything is drawn.
        /// </summary>
        private readonly ConcurrentQueue<Action> _inbox = new ConcurrentQueue<Action>();
        private float _nextTick;

        private readonly Watch _joinedWatch = new Watch();
        private readonly Watch _guildWatch = new Watch();
        private readonly Watch _receivedWatch = new Watch();
        private readonly Watch _sentWatch = new Watch();
        private readonly Watch _search = new Watch();

        /// <summary>The guild the joined list names, once it has been read.</summary>
        private bool _membershipKnown;
        private string? _membership;

        /// <summary>
        /// The guild the panel is watching; null while in the lobby, once
        /// entered. Whatever is read below belongs to this guild, or to the
        /// lobby.
        /// </summary>
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

        /// <summary>The guild token, kept until it runs out or the guild changes.</summary>
        private AuthAccessToken? _guildToken;
        private string? _readFailure;

        private void OnEnable()
        {
            if (_panel == null || _buttonTemplate == null || _font == null)
            {
                Log("The guild lobby was baked without its region, button or font.");
                return;
            }
            if (_body == null) Build();
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
            while (!TryRuntime(out _, out _))
            {
                yield return new WaitForSeconds(0.25f);
            }
            _signingIn = null;
            StartWatching();
        }

        private void Build()
        {
            _nameField = NameField();
            _body = Child("Body", _panel!);
            var layout = _body.gameObject.AddComponent<VerticalLayoutGroup>();
            layout.spacing = 8;
            layout.childControlWidth = true;
            layout.childControlHeight = true;
            layout.childForceExpandWidth = true;
            layout.childForceExpandHeight = false;
            Caption(_body, "Reading the guilds...", 15, MutedText);
        }

        // ------------------------------------------------------------------
        // Watching

        private void StartWatching()
        {
            if (!TryRuntime(out var gs2, out var session)) return;
            _gs2 = gs2;
            _session = session;
            _visitor = gs2!.Super.Guild.Namespace(GuildNamespace).AccessToken(session!.AccessToken);
            _userId = session.UserId;
            _nextTick = Time.realtimeSinceStartup + TickSeconds;
            WatchJoined();
        }

        /// <summary>
        /// Drops every subscription, so the SDK holds no callback into a
        /// disabled or destroyed panel, and forgets what was read.
        /// </summary>
        private void StopWatching()
        {
            _joinedWatch.Stop();
            _guildWatch.Stop();
            _receivedWatch.Stop();
            _sentWatch.Stop();
            _search.Stop();
            while (_inbox.TryDequeue(out _)) { }
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
            var arrived = false;
            while (_inbox.TryDequeue(out var apply))
            {
                apply();
                arrived = true;
            }
            if (arrived) Settle();
            if (Time.realtimeSinceStartup >= _nextTick) Tick();
        }

        /// <summary>
        /// Follows the joined list: enters the guild it names, or the lobby,
        /// and watches the guild's requests while the visitor is its master.
        /// Then draws what is known.
        /// </summary>
        private void Settle()
        {
            if (!_membershipKnown) return;
            if (!_entered || _membership != _guildName) Enter(_membership);
            if (_guildName != null)
            {
                if (_guildGone)
                {
                    // Drawing the lobby here would invite a member to found
                    // or join another guild.
                    ReadFailed("Your guild could not be read.");
                    return;
                }
                if (_guild != null) FollowRole(_guild);
            }
            Draw();
        }

        /// <summary>
        /// Stops watching what belonged to the guild or lobby being left and
        /// starts on the one being entered. Anything the old watches still
        /// report is dropped, so a late answer for an old guild is not drawn
        /// over the new state.
        /// </summary>
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

        /// <summary>
        /// A master watches the requests the guild received; anybody else
        /// does not, and does not keep the guild token.
        /// </summary>
        private void FollowRole(GuildModel guild)
        {
            if (RoleOf(guild, _userId) == MasterRole)
            {
                if (_receivedWatch.Idle) WatchReceived(guild.Name);
            }
            else
            {
                // A master's token must not outlive the role.
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

        /// <summary>
        /// Every 30 seconds: searches again while in the lobby, tries again a
        /// watch that failed to start, reads again what a running watch
        /// follows (from the cache, unless the cache lost it), and renews the
        /// guild token before it runs out, since the SDK reads the requests
        /// again with that token whenever GS2 says one arrived.
        /// </summary>
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

        /// <summary>Hands an SDK callback to the main thread, for as long as its watch lasts.</summary>
        private void Post(Watch watch, int ticket, Action apply) =>
            _inbox.Enqueue(() =>
            {
                if (watch.Is(ticket)) apply();
            });

        /// <summary>
        /// Reads a watched list again through the domain and hands what it
        /// read to <paramref name="apply"/>. The domain answers from the cache
        /// while the cache holds the list, and otherwise reads it from GS2 and
        /// caches it, which also tells every watcher. A list being read by the
        /// SDK at the same time is waited for, not read twice. A failure only
        /// logs: the next tick tries again.
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
                if (watch.Is(ticket)) Debug.LogWarning($"{nameof(GuildRoleLobbyPanel)}: {what} could not be read again: {error}");
            }
        }

        /// <summary>The guilds the visitor joined; the SDK reads them again on join and leave.</summary>
        private async void WatchJoined()
        {
            var visitor = _visitor;
            if (visitor == null) return;
            var ticket = _joinedWatch.Start();
            void Apply(JoinedGuild[]? joined) => Post(_joinedWatch, ticket, () =>
            {
                // The SDK hands over the whole list, of every kind.
                _membership = joined?.FirstOrDefault(entry => entry?.GuildModelName == GuildKind)?.GuildName;
                _membershipKnown = true;
                _readFailure = null;
            });
            void Reread() => this.Reread(_joinedWatch, ticket, () => visitor.JoinedGuildsAsync(GuildKind), Apply, "the guilds");
            try
            {
                var id = await visitor.SubscribeJoinedGuildsWithInitialCallAsync(joined =>
                {
                    // An empty list may only mean the cache no longer holds it.
                    if (joined == null || joined.Length == 0) Reread();
                    else Apply(joined);
                }, GuildKind);
                _joinedWatch.Attach(ticket, () => visitor.UnsubscribeJoinedGuilds(id, GuildKind), Reread);
            }
            catch (Exception error)
            {
                if (!_joinedWatch.Fail(ticket)) return;
                Debug.LogError($"{nameof(GuildRoleLobbyPanel)}: the guilds could not be read: {error}");
                ReadFailed($"The guilds could not be read: {error.Message}");
            }
        }

        /// <summary>
        /// The visitor's guild; the SDK reads it again when a player joins or
        /// leaves, and a press updates it with what GS2 returned.
        /// </summary>
        private async void WatchGuild(string guildName)
        {
            var gs2 = _gs2;
            var session = _session;
            if (gs2 == null || session == null) return;
            var guild = gs2.Super.Guild.Namespace(GuildNamespace).Guild(GuildKind, guildName);
            var ticket = _guildWatch.Start();
            try
            {
                var id = await guild.SubscribeWithInitialCallAsync(session.AccessToken, model => Post(_guildWatch, ticket, () =>
                {
                    _guild = model;
                    _guildGone = model == null;
                    if (model != null)
                    {
                        _readFailure = null;
                        return;
                    }
                    // GS2 says the guild does not exist, yet the joined list
                    // named it, and no notification will correct that list.
                    _visitor?.InvalidateJoinedGuilds(GuildKind);
                }));
                _guildWatch.Attach(ticket, () => guild.Unsubscribe(id), () => RereadGuild(guild, session, ticket));
            }
            catch (Exception error)
            {
                if (!_guildWatch.Fail(ticket)) return;
                Debug.LogError($"{nameof(GuildRoleLobbyPanel)}: the guild could not be read: {error}");
                ReadFailed($"The guilds could not be read: {error.Message}");
            }
        }

        /// <summary>
        /// Reads the guild again through the domain. The domain answers from
        /// the cache while the cache holds the guild, even when what it holds
        /// is that the guild is gone, so this asks GS2 only after the cache
        /// lost it; the SDK then caches what GS2 returned and the watch hears
        /// it, so nothing is applied here.
        /// </summary>
        private async void RereadGuild(GuildDomain guild, IGameSession session, int ticket)
        {
            try
            {
                await guild.ModelAsync(session.AccessToken);
            }
            catch (Exception error)
            {
                if (_guildWatch.Is(ticket)) Debug.LogWarning($"{nameof(GuildRoleLobbyPanel)}: the guild could not be read again: {error}");
            }
        }

        /// <summary>
        /// The requests the master's guild received; the SDK reads them again
        /// when GS2 says one arrived or was withdrawn, and an answer removes
        /// it. A failure here is said on the page and leaves the rest of the
        /// guild drawn.
        /// </summary>
        private async void WatchReceived(string guildName)
        {
            var gs2 = _gs2;
            var session = _session;
            if (gs2 == null || session == null) return;
            var ticket = _receivedWatch.Start();
            try
            {
                var token = await GuildToken(new Gs2GuildRestClient(gs2.Super.RestSession), session.AccessToken.Token, guildName, GuildTokenMarginMs);
                if (!_receivedWatch.Is(ticket)) return;
                var guild = gs2.Super.Guild.Namespace(GuildNamespace).GuildAccessToken(GuildKind, token);
                void Apply(ReceiveMemberRequest[]? received) => Post(_receivedWatch, ticket, () =>
                {
                    _received = received ?? Array.Empty<ReceiveMemberRequest>();
                    _receivedFrom = guild;
                });
                void Reread() => this.Reread(_receivedWatch, ticket, () => guild.ReceiveRequestsAsync(), Apply, "the requests to join");
                var id = await guild.SubscribeReceiveRequestsWithInitialCallAsync(received =>
                {
                    // An empty list may only mean the cache no longer holds it.
                    if (received == null || received.Length == 0) Reread();
                    else Apply(received);
                });
                _receivedWatch.Attach(ticket, () => guild.UnsubscribeReceiveRequests(id), Reread);
            }
            catch (Exception error)
            {
                if (!_receivedWatch.Fail(ticket)) return;
                Debug.LogError($"{nameof(GuildRoleLobbyPanel)}: the join requests could not be read: {error}");
                _guildToken = null;
                ReadFailed($"The requests to join could not be read: {error.Message}");
            }
        }

        /// <summary>
        /// The requests the visitor sent; a press updates them, and the SDK
        /// reads them again when GS2 says one was answered.
        /// </summary>
        private async void WatchSent()
        {
            var visitor = _visitor;
            if (visitor == null) return;
            var ticket = _sentWatch.Start();
            void Apply(SendMemberRequest[]? sent) => Post(_sentWatch, ticket, () =>
            {
                _sent = sent ?? Array.Empty<SendMemberRequest>();
                _sentKnown = true;
                _readFailure = null;
            });
            void Reread() => this.Reread(_sentWatch, ticket, () => visitor.SendRequestsAsync(GuildKind), Apply, "the sent requests");
            try
            {
                var id = await visitor.SubscribeSendRequestsWithInitialCallAsync(sent =>
                {
                    // An empty list may only mean the cache no longer holds it.
                    if (sent == null || sent.Length == 0) Reread();
                    else Apply(sent);
                }, GuildKind);
                _sentWatch.Attach(ticket, () => visitor.UnsubscribeSendRequests(id, GuildKind), Reread);
            }
            catch (Exception error)
            {
                if (!_sentWatch.Fail(ticket)) return;
                Debug.LogError($"{nameof(GuildRoleLobbyPanel)}: the sent requests could not be read: {error}");
                ReadFailed($"The guilds could not be read: {error.Message}");
            }
        }

        /// <summary>
        /// Searches for guilds with room. A search is not kept in the cache,
        /// so this asks GS2 each time; only the latest search to start is
        /// drawn, and only while the visitor is still in the lobby.
        /// </summary>
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
                Post(_search, ticket, () =>
                {
                    _found = found;
                    _foundKnown = true;
                    _readFailure = null;
                });
            }
            catch (Exception error)
            {
                if (!_search.Is(ticket)) return;
                Debug.LogError($"{nameof(GuildRoleLobbyPanel)}: the guilds could not be searched: {error}");
                ReadFailed($"The guilds could not be read: {error.Message}");
            }
        }

        /// <summary>
        /// Renews the guild token shortly before it runs out, then reads the
        /// requests again with it. The token is renewed in place, so the
        /// watch on the requests keeps reading with it.
        /// </summary>
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
                // The next tick tries again while the token is still good.
                Debug.LogError($"{nameof(GuildRoleLobbyPanel)}: the guild token could not be renewed: {error}");
            }
        }

        /// <summary>
        /// Says a failed read on the page once; the same failure again stays
        /// quiet until a read succeeds.
        /// </summary>
        private void ReadFailed(string message)
        {
            if (this == null || message == _readFailure) return;
            _readFailure = message;
            Log(message);
        }

        /// <summary>
        /// The token to act as the guild, assumed again when it runs out
        /// within the margin or belongs to another guild. A token for the same
        /// guild is renewed in place, so whatever holds it keeps working.
        /// </summary>
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

        /// <summary>
        /// One subscription, or one search. Stopping it, or starting it
        /// again, retires its ticket: whatever the SDK reports under an old
        /// ticket is dropped, and a subscription that finishes starting after
        /// that is dropped at once. Once started, it can be read again.
        /// </summary>
        private sealed class Watch
        {
            private int _ticket;
            private Action? _unsubscribe;
            private Action? _reread;

            public bool Running { get; private set; }
            public bool Failed { get; private set; }
            public bool Idle => !Running && !Failed;

            public int Start()
            {
                Stop();
                Running = true;
                return _ticket;
            }

            public bool Is(int ticket) => Running && ticket == _ticket;

            public void Attach(int ticket, Action unsubscribe, Action reread)
            {
                if (Is(ticket))
                {
                    _unsubscribe = unsubscribe;
                    _reread = reread;
                }
                else
                {
                    unsubscribe();
                }
            }

            /// <summary>Reads again what the watch follows; nothing until it has started.</summary>
            public void Reread() => _reread?.Invoke();

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
                _reread = null;
                var unsubscribe = _unsubscribe;
                _unsubscribe = null;
                unsubscribe?.Invoke();
            }
        }

        // ------------------------------------------------------------------
        // Drawing

        /// <summary>
        /// Redraws the region whole, once the state being entered has been
        /// read; until then what was drawn before stays.
        /// </summary>
        private void Draw()
        {
            if (_body == null || _nameField == null || !_entered) return;
            if (_guildName != null)
            {
                if (_guild == null) return;
                Clear(_body);
                _nameField.gameObject.SetActive(false);
                DrawGuild(_guild);
            }
            else
            {
                if (!_sentKnown || !_foundKnown) return;
                Clear(_body);
                _nameField.gameObject.SetActive(true);
                DrawLobby();
            }
        }

        private void DrawGuild(GuildModel guild)
        {
            var members = guild.Members ?? Array.Empty<Member>();
            var master = RoleOf(guild, _userId) == MasterRole;
            Caption(_body!, $"{guild.DisplayName}  ({members.Length}/{guild.CurrentMaximumMemberCount ?? 0}, {JoinPolicyText(guild.JoinPolicy)})", 18, LightText);
            foreach (var member in members.OrderBy(member => member.JoinedAt ?? 0))
            {
                var you = member.UserId == _userId ? "  (you)" : "";
                Caption(_body!, $"{Tag(member.UserId)}  {member.RoleName}{you}", 16, member.UserId == _userId ? LightText : MutedText);
            }

            if (master)
            {
                if (_received.Length > 0) Caption(_body!, "Requests to join", 15, MutedText);
                foreach (var request in _received)
                {
                    var from = request.UserId;
                    Press(_body!, $"Accept {Tag(from)}", () => Answer(guild.Name, from, true));
                    Press(_body!, $"Decline {Tag(from)}", () => Answer(guild.Name, from, false));
                }
                var others = members.Where(member => member.UserId != _userId).OrderBy(member => member.JoinedAt ?? 0).ToArray();
                if (others.Length > 0)
                {
                    var heir = others[0].UserId;
                    Press(_body!, $"Hand over to {Tag(heir)} and leave", () => HandOver(guild.Name, heir));
                }
                else
                {
                    Press(_body!, "Disband the guild", () => Disband(guild.Name));
                }
            }
            else
            {
                Press(_body!, "Leave the guild", () => Leave(guild.Name));
            }
        }

        private void DrawLobby()
        {
            Press(_body!, $"Join policy: {JoinPolicyText(_approval ? "approval" : "anybody")} (press to change)", () =>
            {
                _approval = !_approval;
                Draw();
            });
            Press(_body!, "Create a guild with this name", Create);

            Caption(_body!, "Guilds you can join", 15, MutedText);
            if (_found.Length == 0) Caption(_body!, "No guild has room right now. Create one.", 15, MutedText);
            foreach (var guild in _found)
            {
                var name = guild.Name;
                var pending = _sent.Any(request => request.TargetGuildName == name);
                var approval = guild.JoinPolicy == "approval";
                var label = $"{guild.DisplayName}  ({guild.Members?.Length ?? 0}/{guild.CurrentMaximumMemberCount ?? 0})";
                if (pending)
                {
                    Press(_body!, $"Cancel the request to {label}", () => CancelRequest(name));
                }
                else
                {
                    Press(_body!, approval ? $"Ask to join {label}" : $"Join {label}", () => Join(name, approval));
                }
            }
        }

        private static string JoinPolicyText(string? policy) =>
            policy == "approval" ? "the master approves" : "anybody joins";

        // ------------------------------------------------------------------
        // Pressing

        private void Create()
        {
            var name = (_nameField?.text ?? "").Trim();
            if (name.Length == 0 || name.Length > NameLimit || name.Any(char.IsControl))
            {
                Log($"Name the guild first, in 1 to {NameLimit} characters.");
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

        /// <summary>
        /// Asks to join, or joins at once. A guild joined at once leaves the
        /// lobby, so the search is asked again only otherwise.
        /// </summary>
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
                return accept ? $"Accepted {Tag(fromUserId)}." : $"Declined {Tag(fromUserId)}.";
            }, whenGone: () => _receivedFrom?.InvalidateReceiveRequests());

        /// <summary>
        /// Promotes the longest-standing other member to master, then leaves.
        /// A guild may not be left without a master, so the order matters.
        /// </summary>
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
                return $"Handed the guild to {Tag(heir)} and left.";
            }, whenGone: ReadJoinedAgain);

        private void Disband(string guildName) =>
            Run(async (gs2, session) =>
            {
                var guild = await AsGuild(gs2, session, guildName);
                await guild.DeleteAsync(new DeleteGuildRequest());
                _guildToken = null;
                return "Disbanded the guild.";
            }, whenGone: ReadJoinedAgain);

        /// <summary>
        /// GS2 says the visitor's guild is gone, and no notification will
        /// tell the joined list, so the SDK reads it again.
        /// </summary>
        private void ReadJoinedAgain() => _visitor?.InvalidateJoinedGuilds(GuildKind);

        /// <summary>The SDK's domain for acting as the visitor's guild.</summary>
        private async Task<GuildAccessTokenDomain> AsGuild(Gs2Domain gs2, IGameSession session, string? guildName)
        {
            if (guildName == null) throw new InvalidOperationException("Not in a guild.");
            var token = await GuildToken(new Gs2GuildRestClient(gs2.Super.RestSession), session.AccessToken.Token, guildName, GuildTokenMarginMs);
            return gs2.Super.Guild.Namespace(GuildNamespace).GuildAccessToken(GuildKind, token);
        }

        /// <summary>
        /// Runs one press, one at a time. What it changed reaches the panel
        /// through the SDK's cache, so nothing is read again here, except:
        /// <paramref name="afterward"/> runs once the press is over, whether
        /// it worked or not, and <paramref name="whenGone"/> runs when GS2
        /// says what was pressed on no longer exists.
        /// </summary>
        private async void Run(Func<Gs2Domain, IGameSession, Task<string>> press, Action? afterward = null, Action? whenGone = null)
        {
            if (_busy) return;
            if (!TryRuntime(out var gs2, out var session))
            {
                Log("Not signed in yet.");
                return;
            }
            _busy = true;
            try
            {
                var message = await press(gs2!, session!);
                if (this != null) Log(message);
            }
            catch (Gs2Exception error)
            {
                if (this != null)
                {
                    Log(Explain(error));
                    if (error is NotFoundException) whenGone?.Invoke();
                }
            }
            catch (Exception error)
            {
                if (this != null) Log($"Failed: {error.Message}");
            }
            finally
            {
                _busy = false;
            }
            if (this != null) afterward?.Invoke();
        }

        /// <summary>Says why GS2 refused, for the refusals a visitor can meet.</summary>
        private static string Explain(Gs2Exception error)
        {
            var text = string.Join(" ", error.Errors?.Select(detail => detail.message) ?? Array.Empty<string>()) + " " + error.Message;
            if (text.Contains("maximumJoinedGathering")) return "That player already belongs to a guild.";
            if (text.Contains("members.error.tooMany")) return "That guild is full.";
            if (text.Contains("master.error.require")) return "A guild cannot be left without a master; hand it over or disband it.";
            if (error is NotFoundException) return "That guild is gone.";
            return $"GS2 refused: {error.Message}";
        }

        // ------------------------------------------------------------------
        // Building blocks

        /// <summary>
        /// A short, stable name for an anonymous player: the same id always
        /// reads the same.
        /// </summary>
        private static string Tag(string? userId)
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

        private InputField NameField()
        {
            var field = Child("NameField", _panel!);
            field.gameObject.AddComponent<Image>().color = RowColor;
            field.gameObject.AddComponent<LayoutElement>().minHeight = 48;
            var placeholder = FieldText(field, "Placeholder", "Name your guild", MutedText);
            placeholder.fontStyle = FontStyle.Italic;
            var text = FieldText(field, "Text", "", LightText);
            var input = field.gameObject.AddComponent<InputField>();
            input.textComponent = text;
            input.placeholder = placeholder;
            input.lineType = InputField.LineType.SingleLine;
            input.characterLimit = NameLimit;
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

        private void Log(string message)
        {
            _page ??= FindAnyObjectByType<ShowroomPage>();
            if (_page != null) _page.Log(message);
            else Debug.LogWarning($"GuildRoleLobbyPanel: {message}", this);
        }

        private static bool TryRuntime(out Gs2Domain? gs2, out IGameSession? session)
        {
            gs2 = null;
            session = null;
            var runtime = FindAnyObjectByType<GS2Studio.Generated.Runtime.Gs2HolderRuntimeContextProvider>();
            return runtime != null && runtime.TryGet(out gs2, out session) && gs2 != null && session != null;
        }
    }
}
