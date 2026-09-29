// The guild lobby: founding, finding and joining a guild, and leaving,
// handing over or disbanding. Copied from the guild demo and cut down for the
// guild ranking page: every guild founded here lets anybody join, and only
// such guilds are offered or joined, so nobody waits on a master's approval.
// The guild namespace is shared with the guild demo, whose guilds may ask for
// approval; those are left out of the list and refused when joined by id.
// A member can copy their guild's id, and a visitor can paste one and join
// that guild at once. The search lists a new guild only after a minute or
// two, and two visitors who want to rank against each other should not have
// to wait for it.
//
// A row of the page reads one value or makes one press, and a lobby is a
// search, a form and a guild's worth of members, so this draws its own region.
// None of it is an action a package can host.
//
// Reads go through the SDK's domain and are watched in its cache: the guilds
// the visitor joined, then their guild. GS2's notifications clear those
// caches when another player joins or leaves, and the SDK's
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
// when GS2 answers that the visitor's guild no longer exists, since no
// notification would correct it.
//
// Handing over and disbanding are done as the guild: the master assumes the
// guild, and GS2 lets the guild token do only what the master role's policy
// allows.
//
// The lobby grows and shrinks as the visitor's state changes, and every row
// of the page below it moves; a press that lands in that moment is refused and
// the visitor is asked to press again.
#nullable enable

using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Text;
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
    [AddComponentMenu("GS2 Studio/Showroom/Guild Ranking Lobby")]
    public sealed class GuildRoleRankingLobbyPanel : MonoBehaviour
    {
        /// <summary>The guild namespace and kind the packages deploy.</summary>
        private const string GuildNamespace = "Guild";
        private const string GuildKind = "adventurers";
        private const string MasterRole = "master";
        private const string OpenPolicy = "anybody";

        /// <summary>
        /// How often the lobby searches again, and how often a watch that
        /// failed to start is tried again. GS2 keeps a search for a minute.
        /// </summary>
        private const float TickSeconds = 30f;
        private const int SearchLimit = 10;
        private const int NameLimit = 64;

        /// <summary>A guild id is GS2's name for the guild; a full id ends with it.</summary>
        private const int GuildIdLimit = 256;

        /// <summary>
        /// How long the clipboard may take to answer. A browser can leave a
        /// permission prompt open, or never settle, and the buttons would
        /// otherwise wait for it forever.
        /// </summary>
        private const float ClipboardSeconds = 10f;

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
        private RectTransform? _joinRegion;
        private InputField? _joinField;

        /// <summary>What the clipboard is being asked to do, until it answers.</summary>
        private enum Clipboard
        {
            Idle,
            Copying,
            Pasting,
        }

        private Clipboard _clipboard;
        private float _clipboardDeadline;

        /// <summary>What the region was last drawn from; null before the first draw.</summary>
        private string? _shown;
        private StringBuilder? _drawing;
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
        private GuildModel[] _found = Array.Empty<GuildModel>();
        private bool _foundKnown;

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

            _joinRegion = Child("JoinById", _panel!);
            var join = _joinRegion.gameObject.AddComponent<VerticalLayoutGroup>();
            join.spacing = 8;
            join.childControlWidth = true;
            join.childControlHeight = true;
            join.childForceExpandWidth = true;
            join.childForceExpandHeight = false;
            Caption(_joinRegion, "Or join a guild by its id. A member copies it from their guild here; a new guild can take a minute or two to show up in the list above.", 15, MutedText);
            _joinField = Field(_joinRegion, "GuildId", "Paste or type a guild id", GuildIdLimit);
            Press(_joinRegion, "Paste a guild id", Paste);
            Press(_joinRegion, "Join by id", JoinById);
            _joinRegion.gameObject.SetActive(false);
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
            _found = Array.Empty<GuildModel>();
            _foundKnown = false;
            _guildToken = null;
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
            if (arrived) Settle();
            if (Time.realtimeSinceStartup >= _nextTick) Tick();
        }

        /// <summary>
        /// Follows the joined list: enters the guild it names, or the lobby.
        /// Then draws what is known.
        /// </summary>
        private void Settle()
        {
            if (!_membershipKnown) return;
            if (!_entered || _membership != _guildName) Enter(_membership);
            if (_guildName != null && _guildGone)
            {
                // Drawing the lobby here would invite a member to found or
                // join another guild.
                ReadFailed("Your guild could not be read.");
                return;
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
            _search.Stop();
            _entered = true;
            _guildName = guildName;
            _guild = null;
            _guildGone = false;
            _found = Array.Empty<GuildModel>();
            _foundKnown = false;
            // A guild token must not outlive the guild it acts as.
            _guildToken = null;
            if (guildName != null) WatchGuild(guildName);
            else Search();
        }

        /// <summary>
        /// Every 30 seconds: searches again while in the lobby, tries again a
        /// watch that failed to start, and reads again what a running watch
        /// follows (from the cache, unless the cache lost it).
        /// </summary>
        private void Tick()
        {
            _nextTick = Time.realtimeSinceStartup + TickSeconds;
            if (_joinedWatch.Failed) WatchJoined();
            else _joinedWatch.Reread();
            if (!_entered) return;
            if (_guildName == null)
            {
                Search();
                return;
            }
            if (_guildWatch.Failed) WatchGuild(_guildName);
            else _guildWatch.Reread();
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
                if (watch.Is(ticket)) Debug.LogWarning($"{nameof(GuildRoleRankingLobbyPanel)}: {what} could not be read again: {error}");
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
                Debug.LogError($"{nameof(GuildRoleRankingLobbyPanel)}: the guilds could not be read: {error}");
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
                Debug.LogError($"{nameof(GuildRoleRankingLobbyPanel)}: the guild could not be read: {error}");
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
                if (_guildWatch.Is(ticket)) Debug.LogWarning($"{nameof(GuildRoleRankingLobbyPanel)}: the guild could not be read again: {error}");
            }
        }

        /// <summary>
        /// Searches for guilds with room that anybody may join. A search is
        /// not kept in the cache, so this asks GS2 each time; only the latest
        /// search to start is drawn, and only while the visitor is still in
        /// the lobby.
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
                        joinPolicies: new[] { OpenPolicy },
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
                Debug.LogError($"{nameof(GuildRoleRankingLobbyPanel)}: the guilds could not be searched: {error}");
                ReadFailed($"The guilds could not be read: {error.Message}");
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
        /// within a minute or belongs to another guild.
        /// </summary>
        private async Task<AuthAccessToken> GuildToken(Gs2GuildRestClient client, string token, string guildName)
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var kept = _guildToken;
            if (kept != null && kept.UserId == guildName && (kept.Expire ?? 0) > now + GuildTokenMarginMs)
            {
                return kept;
            }
            var assumed = await client.AssumeAsync(new AssumeRequest()
                .WithNamespaceName(GuildNamespace)
                .WithGuildModelName(GuildKind)
                .WithGuildName(guildName)
                .WithAccessToken(token));
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
            if (_body == null || _nameField == null || _joinRegion == null || !_entered) return;
            var drawing = new StringBuilder();
            if (_guildName != null)
            {
                if (_guild == null) return;
                Clear(_body);
                _nameField.gameObject.SetActive(false);
                _joinRegion.gameObject.SetActive(false);
                _drawing = drawing.Append("guild|");
                DrawGuild(_guild);
            }
            else
            {
                if (!_foundKnown) return;
                Clear(_body);
                _nameField.gameObject.SetActive(true);
                _joinRegion.gameObject.SetActive(true);
                _drawing = drawing.Append("lobby|");
                DrawLobby();
            }
            _drawing = null;
            // Presses wait only when what is shown changed: redrawing the
            // same rows moves nothing.
            var shown = drawing.ToString();
            if (shown != _shown) GuildRankingDemo.MarkChanged();
            _shown = shown;
        }

        private void DrawGuild(GuildModel guild)
        {
            var members = guild.Members ?? Array.Empty<Member>();
            var master = RoleOf(guild, _userId) == MasterRole;
            Caption(_body!, $"{guild.DisplayName}  ({members.Length}/{guild.CurrentMaximumMemberCount ?? 0})", 18, LightText);
            Caption(_body!, $"Guild id: {guild.Name}", 15, MutedText);
            var id = guild.Name;
            Press(_body!, "Copy the guild id, for another visitor to join by", () => Copy(id));
            foreach (var member in members.OrderBy(member => member.JoinedAt ?? 0))
            {
                var you = member.UserId == _userId ? "  (you)" : "";
                Caption(_body!, $"{Tag(member.UserId)}  {member.RoleName}{you}", 16, member.UserId == _userId ? LightText : MutedText);
            }

            if (master)
            {
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
            Press(_body!, "Create a guild with this name", Create);

            Caption(_body!, "Guilds you can join", 15, MutedText);
            if (_found.Length == 0) Caption(_body!, "No guild has room right now. Create one.", 15, MutedText);
            foreach (var guild in _found)
            {
                var name = guild.Name;
                Press(_body!, $"Join {guild.DisplayName}  ({guild.Members?.Length ?? 0}/{guild.CurrentMaximumMemberCount ?? 0})", () => Join(name));
            }
        }

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
            Run(async (gs2, session) =>
            {
                await gs2.Super.Guild.Namespace(GuildNamespace).AccessToken(session.AccessToken)
                    .CreateGuildAsync(new CreateGuildRequest()
                        .WithGuildModelName(GuildKind)
                        .WithDisplayName(name)
                        .WithJoinPolicy(OpenPolicy));
                if (_nameField != null) _nameField.text = "";
                return $"Created {name}.";
            });
        }

        /// <summary>
        /// Joins at once. A guild joined leaves the lobby, so the search is
        /// asked again only when the join failed.
        /// </summary>
        private void Join(string guildName)
        {
            var joined = false;
            Run(async (gs2, session) =>
            {
                await gs2.Super.Guild.Namespace(GuildNamespace).AccessToken(session.AccessToken)
                    .SendRequestAsync(new SendRequestRequest()
                        .WithGuildModelName(GuildKind)
                        .WithTargetGuildName(guildName));
                joined = true;
                return "Joined the guild.";
            }, afterward: () =>
            {
                if (!joined) Search();
            });
        }

        private void Leave(string guildName) =>
            Run(async (gs2, session) =>
            {
                await gs2.Super.Guild.Namespace(GuildNamespace).AccessToken(session.AccessToken)
                    .JoinedGuild(GuildKind, guildName)
                    .WithdrawalAsync(new WithdrawalRequest());
                return "Left the guild.";
            }, whenGone: ReadJoinedAgain);

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

        private void Copy(string guildName)
        {
            if (_clipboard != Clipboard.Idle) return;
            _clipboard = Clipboard.Copying;
            _clipboardDeadline = Time.realtimeSinceStartup + ClipboardSeconds;
            ShowroomClipboard.Copy(guildName);
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
                Log(outcome == ShowroomClipboard.Outcome.Done
                    ? "Copied the guild id. Send it to the visitor who should join."
                    : $"The browser did not let the page copy ({text}). Select the guild id above and copy it, or read it out.");
                return;
            }
            if (outcome != ShowroomClipboard.Outcome.Done)
            {
                Log($"The browser did not let the page paste ({text}). Type the guild id into the field instead.");
                return;
            }
            if (_joinField != null) _joinField.text = text.Trim();
        }

        /// <summary>
        /// Joins the guild whose id is in the field, when anybody may join
        /// it. A guild whose master approves members is not asked: this demo
        /// joins only open guilds. A full id is accepted too: the guild's name
        /// is its last part.
        /// </summary>
        private void JoinById()
        {
            var id = GuildRankingDemo.GuildNameOf((_joinField?.text ?? "").Trim());
            if (id.Length == 0)
            {
                Log("Paste or type a guild id first.");
                return;
            }
            if (id.Any(character => char.IsWhiteSpace(character) || char.IsControl(character)))
            {
                Log("That does not look like a guild id: it has no spaces, like the one a member copies from their guild.");
                return;
            }
            Run(async (gs2, session) =>
            {
                var guilds = gs2.Super.Guild.Namespace(GuildNamespace);
                GuildModel? guild;
                try
                {
                    guild = await guilds.Guild(GuildKind, id).ModelAsync(session.AccessToken);
                }
                catch (NotFoundException)
                {
                    guild = null;
                }
                if (guild == null) return "No guild has that id. Check it with the member who sent it; the guild may have been disbanded.";
                if (guild.JoinPolicy != OpenPolicy) return $"{guild.DisplayName} needs its master's approval, and this demo joins only open guilds. Create one or pick one from the list.";
                await guilds.AccessToken(session.AccessToken)
                    .SendRequestAsync(new SendRequestRequest()
                        .WithGuildModelName(GuildKind)
                        .WithTargetGuildName(id));
                if (_joinField != null) _joinField.text = "";
                return $"Joined {guild.DisplayName}.";
            }, afterward: Search);
        }

        /// <summary>
        /// GS2 says the visitor's guild is gone, and no notification will
        /// tell the joined list, so the SDK reads it again.
        /// </summary>
        private void ReadJoinedAgain() => _visitor?.InvalidateJoinedGuilds(GuildKind);

        /// <summary>The SDK's domain for acting as the visitor's guild.</summary>
        private async Task<GuildAccessTokenDomain> AsGuild(Gs2Domain gs2, IGameSession session, string? guildName)
        {
            if (guildName == null) throw new InvalidOperationException("Not in a guild.");
            var token = await GuildToken(new Gs2GuildRestClient(gs2.Super.RestSession), session.AccessToken.Token, guildName);
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

        private InputField NameField() => Field(_panel!, "NameField", "Name your guild", NameLimit);

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
            if (parent == _body) _drawing?.Append("press:").Append(text).Append('|');
            var button = Instantiate(_buttonTemplate!, parent);
            button.name = "Press";
            var label = button.GetComponentInChildren<Text>();
            if (label != null)
            {
                label.supportRichText = false;
                label.text = text;
            }
            button.onClick.RemoveAllListeners();
            button.onClick.AddListener(() =>
            {
                if (GuildRankingDemo.Settled()) onClick();
            });
        }

        private void Caption(RectTransform parent, string text, int size, Color color)
        {
            if (parent == _body) _drawing?.Append("caption:").Append(text).Append('|');
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
            else Debug.LogWarning($"GuildRoleRankingLobbyPanel: {message}", this);
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
