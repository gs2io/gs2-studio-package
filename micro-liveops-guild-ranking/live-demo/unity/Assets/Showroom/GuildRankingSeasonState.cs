// The guild ranking as the page shows it: which season it is and when it
// ends, which guild the visitor plays for, where they stand on that guild's
// board, and what earlier season they can still receive for.
//
// Nothing here is a generated binding. A guild's board is not user data a
// package can list, and submitting a score or receiving for a past season is
// not an action a package can host, so both go straight to GS2.
//
// GS2 numbers a season by how many times the schedule demo's daily event
// `guild-season` has repeated, so the season and the moment it turns over are
// read from that event, once, and again only when the season is over.
//
// The visitor's guild is followed through the SDK, the same way the lobby
// follows it: a subscription to the joined guilds, which the SDK reads again
// when GS2 says the visitor joined or left, and the guild itself read once per
// guild through the domain for its full id, which the scores are filed under,
// and its name. Nothing here reloads or invalidates the SDK's cache; the
// lobby and this share what it holds.
//
// GS2 does not announce a new score, so the board is read through the REST
// client every few seconds; it has no cache in the way, so what another member
// scored shows at the next read. Which past seasons wait is read when the page
// starts, when the season turns over and after a receipt, since nothing else
// changes that; a season known to be received or to pay nothing is not asked
// about again. The rank in the season that waits is read with every board
// read, though: after the visitor advanced their clock, that season is still
// being played by guildmates who did not. Playing and receiving go through
// the SDK, so the wallet the page shows hears the reward land.
//
// The visitor can move their own clock a day forward (Advance one day). GS2
// then reads the season, the board and the past seasons on that clock, so
// every "now" here is this device's time plus the offset the demo gave the
// account, and once the session has signed in again with the new offset
// everything is read afresh: the season the visitor played is over for them,
// and shows under what they can receive for.
//
// A read answers for the moment it started. One that started before a play or
// a receipt, before the guild or the season changed, or before a newer read of
// the same thing, is dropped when it lands, so it cannot put back what the
// press just changed.
#nullable enable

using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

using UnityEngine;

using Cysharp.Threading.Tasks;
using Cysharp.Threading.Tasks.Linq;

using Gs2.Core.Exception;
using Gs2.Gs2Guild;
using Gs2.Gs2Guild.Model;
using Gs2.Gs2Guild.Request;
using Gs2.Gs2Ranking2;
using Gs2.Gs2Ranking2.Model;
using Gs2.Gs2Ranking2.Request;
using Gs2.Gs2Schedule;
using Gs2.Gs2Schedule.Request;
using Gs2.Unity.Core;
using Gs2.Unity.Util;

using GuildModel = Gs2.Gs2Guild.Model.Guild;
using VisitorDomain = Gs2.Gs2Guild.Domain.Model.UserAccessTokenDomain;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// The season, the visitor's guild and their standing, kept current for
    /// the page's rows. One per page, made by the first row that asks.
    /// </summary>
    internal sealed class GuildRankingSeasonState : MonoBehaviour
    {
        /// <summary>The ranking namespace the feature package deploys, and the demo's one ranking.</summary>
        private const string RankingNamespace = "GuildRanking";
        private const string RankingName = "guild";

        /// <summary>The schedule namespace and the daily event that numbers the seasons.</summary>
        private const string ScheduleNamespace = "Schedule";
        private const string SeasonEvent = "guild-season";

        /// <summary>What one play can score, which is the ranking's own range.</summary>
        public const int MinimumScore = 1;
        public const int MaximumScore = 100;

        /// <summary>
        /// How many places the board shows. A guild holds at most ten members
        /// at once, but members who left keep their places, so a board can
        /// hold more.
        /// </summary>
        public const int BoardSize = 10;

        private const float TickSeconds = 1f;
        private const float StandingPollSeconds = 6f;

        /// <summary>How long to wait before reading the event again after it could not be read.</summary>
        private const float SeasonRetrySeconds = 30f;

        /// <summary>How long to wait before following the joined guilds again after it failed to start.</summary>
        private const float MembershipRetrySeconds = 5f;

        /// <summary>How long to wait before reading the past seasons again after they could not be read.</summary>
        private const float PastRetrySeconds = 30f;

        /// <summary>
        /// How long after the clock moved everything is read once more:
        /// signing in again can finish before the new token is the one the
        /// session sends, so the first reads may still go out on the old clock.
        /// </summary>
        private const float ClockSettleSeconds = 3f;

        private const int PageSize = 100;

        /// <summary>The reads whose failures are logged once until they work again; see <see cref="LogFailure"/>.</summary>
        private const string SeasonFailure = "the season could not be read";
        private const string FollowFailure = "the guilds could not be followed";
        private const string RereadFailure = "the guilds could not be read again";
        private const string GuildFailure = "the guild could not be read";
        private const string BoardFailure = "the board could not be read";
        private const string PastFailure = "the past seasons could not be read";

        private static GuildRankingSeasonState? _instance;

        /// <summary>The page's season, made on first use.</summary>
        public static GuildRankingSeasonState Shared
        {
            get
            {
                if (_instance == null)
                {
                    var host = new GameObject(nameof(GuildRankingSeasonState));
                    DontDestroyOnLoad(host);
                    _instance = host.AddComponent<GuildRankingSeasonState>();
                }
                return _instance;
            }
        }

        /// <summary>A season the visitor scored in that is over and not yet received.</summary>
        public sealed class PastSeason
        {
            public long Season;
            public string GuildId = "";
            public string? GuildDisplayName;
            public long? Score;
            public int? Rank;
        }

        /// <summary>Raised whenever what the rows show may have changed.</summary>
        public event Action? Updated;

        /// <summary>The signed-in visitor.</summary>
        public string UserId { get; private set; } = "";

        /// <summary>The season being played, once the event has been read.</summary>
        public long? Season { get; private set; }

        /// <summary>When the season turns over on GS2's clock, once the event has been read.</summary>
        public DateTime? SeasonEndsAt { get; private set; }

        /// <summary>
        /// When the season turns over on this device's clock, which is what
        /// the page counts down against: GS2's time less the offset the
        /// visitor's account has. Null until that offset has been read.
        /// </summary>
        public DateTime? SeasonEndsOnDevice =>
            DemoTimeOffset.TryGet(UserId, out var offset) ? SeasonEndsAt?.AddSeconds(-offset) : null;

        /// <summary>Why the season could not be read, or null.</summary>
        public string? SeasonProblem { get; private set; }

        /// <summary>Whether the visitor's guild has been read once.</summary>
        public bool GuildKnown { get; private set; }

        /// <summary>The full id of the visitor's guild, which the scores are filed under; null without one.</summary>
        public string? GuildId { get; private set; }

        /// <summary>The name the guild's founder gave it.</summary>
        public string? GuildDisplayName { get; private set; }

        /// <summary>Whether the board has been read for the current guild and season.</summary>
        public bool StandingKnown { get; private set; }

        /// <summary>The visitor's total this season in their guild, or null before their first play.</summary>
        public long? Total { get; private set; }

        /// <summary>The visitor's rank in their guild this season, or null before their first play.</summary>
        public int? Rank { get; private set; }

        /// <summary>The top of the guild's board this season, best first, at most <see cref="BoardSize"/> places.</summary>
        public ClusterRankingData[] Board { get; private set; } = Array.Empty<ClusterRankingData>();

        /// <summary>Whether the guild's board holds more places than <see cref="Board"/> shows.</summary>
        public bool BoardHasMore { get; private set; }

        /// <summary>Whether the past seasons have been read once.</summary>
        public bool PastKnown { get; private set; }

        /// <summary>The latest season the visitor can still receive for, or null.</summary>
        public PastSeason? Next { get; private set; }

        /// <summary>How many more earlier seasons wait besides <see cref="Next"/>.</summary>
        public int MoreWaiting { get; private set; }

        /// <summary>Why the past seasons could not be read, or null.</summary>
        public string? PastProblem { get; private set; }

        private bool _readingSeason;

        /// <summary>Set when the season must be read again although it is not over, as after the clock moved.</summary>
        private bool _seasonStale;

        /// <summary>Bumped by every season read as it starts, and whenever the clock moved.</summary>
        private int _seasonGeneration;

        /// <summary>
        /// Set when the visitor's clock moved and the session has not signed in
        /// on it yet; it stays set when signing in again failed.
        /// </summary>
        private bool _clockNotApplied;
        private bool _readingStanding;
        private bool _readStandingAgain;
        private bool _readingPast;
        private bool _readPastAgain;

        /// <summary>Bumped by every standing read as it starts, and by every play and change of guild or season.</summary>
        private int _standingGeneration;

        /// <summary>Bumped by every past read as it starts, and by every receipt.</summary>
        private int _pastGeneration;

        /// <summary>Seasons the visitor received for, keyed by guild and season; a receipt is final.</summary>
        private readonly HashSet<(string, long)> _received = new HashSet<(string, long)>();

        /// <summary>Seasons GS2 said pay nothing for the visitor, keyed by guild and season.</summary>
        private readonly HashSet<(string, long)> _paysNothing = new HashSet<(string, long)>();

        /// <summary>The names of guilds the visitor scored in, keyed by full id; null once the guild is gone.</summary>
        private readonly Dictionary<string, string?> _guildNames = new Dictionary<string, string?>();

        /// <summary>What the SDK reported, waiting for the main thread.</summary>
        private readonly ConcurrentQueue<Action> _inbox = new ConcurrentQueue<Action>();

        /// <summary>The signed-in visitor's guild domain, while the joined guilds are followed.</summary>
        private VisitorDomain? _visitor;

        /// <summary>The subscription to the joined guilds, once it started.</summary>
        private ulong? _joinedSubscription;

        /// <summary>Bumped whenever the joined guilds stop being followed; a callback under an older one is dropped.</summary>
        private int _joinedTicket;

        /// <summary>Bumped whenever the joined list names a guild to read; a read under an older one is dropped.</summary>
        private int _guildReadTicket;

        /// <summary>The guild name the joined list last named, or null.</summary>
        private string? _joinedGuildName;

        private bool _followingJoined;

        /// <summary>The SDK handles the joined guilds are followed with, captured on the main thread.</summary>
        private Gs2Domain? _followDomain;
        private IGameSession? _followSession;

        /// <summary>Set when reading the joined guilds or the guild they name failed, so the tick tries again.</summary>
        private bool _membershipFailed;

        private float _nextSeasonRead;
        private float _nextMembershipWatch;
        private float _nextStandingRead;
        private float _nextPastRead;

        /// <summary>
        /// The reads that failed and were logged. A read that keeps failing is
        /// tried again every few seconds, and logging each try would fill the
        /// page's log, so it is logged once until it works again.
        /// </summary>
        private readonly HashSet<string> _failing = new HashSet<string>();

        private void OnEnable()
        {
            DemoTimeOffset.Changed += OnClockChanged;
            DemoTimeOffset.Applied += OnClockApplied;
            DemoTimeOffset.Loaded += OnOffsetLoaded;
            StartCoroutine(Run());
        }

        private void OnDisable()
        {
            DemoTimeOffset.Changed -= OnClockChanged;
            DemoTimeOffset.Applied -= OnClockApplied;
            DemoTimeOffset.Loaded -= OnOffsetLoaded;
            StopFollowingJoined();
        }

        /// <summary>Logs a failed read, unless the same read failed last time too.</summary>
        private void LogFailure(string what, Exception error, bool warning = false)
        {
            lock (_failing)
            {
                if (!_failing.Add(what)) return;
            }
            var message = $"{nameof(GuildRankingSeasonState)}: {what}: {error}";
            if (warning) Debug.LogWarning(message);
            else Debug.LogError(message);
        }

        /// <summary>The read worked, so its next failure is logged again.</summary>
        private void Recovered(string what)
        {
            lock (_failing)
            {
                _failing.Remove(what);
            }
        }

        private void Update()
        {
            while (_inbox.TryDequeue(out var apply))
            {
                apply();
            }
        }

        private IEnumerator Run()
        {
            IGameSession? session;
            while (!GuildRankingDemo.TryRuntime(out _, out session))
            {
                yield return new WaitForSeconds(0.25f);
            }
            // Known before the first read, so that read is on the visitor's clock.
            UserId = session!.UserId;
            DemoTimeOffset.TryGet(UserId, out _);
            var tick = new WaitForSecondsRealtime(TickSeconds);
            while (true)
            {
                var now = Time.realtimeSinceStartup;
                // The season is read again once it is over, or once the clock
                // moved; until then the event answers the same. Whether it is
                // over waits for the account's offset.
                var over = SeasonEndsAt != null && DemoTimeOffset.TryGet(UserId, out _) &&
                    ServerNow() >= SeasonEndsAt;
                if (now >= _nextSeasonRead && (Season == null || over || _seasonStale)) ReadSeason();
                if (now >= _nextMembershipWatch)
                {
                    if (!_followingJoined)
                    {
                        _nextMembershipWatch = now + MembershipRetrySeconds;
                        FollowJoined();
                    }
                    else if (_joinedSubscription != null && (!GuildKnown || _membershipFailed))
                    {
                        // A read of the list or of its guild failed, and the
                        // SDK hands over the list again only when it changes.
                        _nextMembershipWatch = now + MembershipRetrySeconds;
                        _membershipFailed = false;
                        _joinedGuildName = null;
                        RereadJoined(_visitor!, _joinedTicket, _followDomain!, _followSession!);
                    }
                }
                if (now >= _nextStandingRead)
                {
                    _nextStandingRead = now + StandingPollSeconds;
                    ReadStanding();
                }
                if (now >= _nextPastRead)
                {
                    // Read on start and when the season turns over; a receipt
                    // reads again itself, and a failed read sets a retry.
                    _nextPastRead = float.PositiveInfinity;
                    ReadPast();
                }
                yield return tick;
            }
        }

        // ------------------------------------------------------------------
        // Presses

        /// <summary>
        /// Plays once: adds a score from <see cref="MinimumScore"/> to
        /// <see cref="MaximumScore"/> to the visitor's total for the season, in
        /// the guild they belong to. Returns what the page should say.
        /// </summary>
        public async Task<string> Play()
        {
            if (!GuildRankingDemo.TryRuntime(out var gs2, out var session)) return "Not signed in yet.";
            if (!GuildKnown) return "Still reading your guild; try again in a moment.";
            if (GuildId == null) return "You are not in a guild. Found one or join one in the lobby above, then play.";
            if (Season == null) return SeasonProblem ?? "Still reading the season; try again in a moment.";
            if (!DemoTimeOffset.Has(UserId)) return "Still reading your clock; try again in a moment.";
            if (SeasonEndsAt != null && ServerNow() >= SeasonEndsAt)
            {
                if (_clockNotApplied)
                {
                    return "Your clock moved forward, but this page has not signed in on the new clock yet. " +
                        "If this does not clear in a moment, reload the page: the next sign-in carries the new clock.";
                }
                return "The season just turned over; press Play again in a moment.";
            }

            var guildId = GuildId;
            var season = Season.Value;
            var score = UnityEngine.Random.Range(MinimumScore, MaximumScore + 1);
            try
            {
                await gs2!.Ranking2.Namespace(RankingNamespace).ClusterRankingModel(RankingName)
                    .ClusterRankingSeason(guildId, season, session!)
                    .PutClusterRankingAsync(score);
            }
            catch (BadRequestException error) when (GuildRankingDemo.Refused(error, "notInclude"))
            {
                // The visitor left, or was removed, and the SDK has not heard yet.
                return "GS2 refused the score (notInclude): you are not a member of that guild any more. Scores count only for the guild you belong to.";
            }
            catch (NotFoundException)
            {
                // GS2 takes scores only while the season's event is open.
                _nextSeasonRead = 0;
                SeasonEndsAt = null;
                Season = null;
                Updated?.Invoke();
                return "GS2 refused the score (notFound): the season is not open right now. The page reads the season again.";
            }
            if (this == null) return "";
            if (season != Season)
            {
                // The season turned over while the score was on its way; the
                // season it went to is over now, so it may pay.
                _nextPastRead = 0;
                return $"You scored {score}.";
            }
            if (guildId != GuildId) return $"You scored {score}.";
            _standingGeneration++;
            Total = (Total ?? 0) + score;
            Updated?.Invoke();
            ReadStanding();
            return $"You scored {score}. Your total this season is {Total}.";
        }

        /// <summary>
        /// Receives the reward for the latest season the visitor has not
        /// received for, by the rank they finished at in the guild they played
        /// for. Returns what the page should say.
        /// </summary>
        public async Task<string> Receive()
        {
            if (!GuildRankingDemo.TryRuntime(out var gs2, out var session)) return "Not signed in yet.";
            if (!PastKnown) return PastProblem ?? "Still reading your past seasons; try again in a moment.";
            var target = Next;
            if (target == null)
            {
                return "Nothing to receive. A season pays once it is over, and only if you scored in it.";
            }
            var where = target.GuildDisplayName ?? "your guild";
            try
            {
                // The season is named: left out, GS2 would take the season
                // being played, which is still open and cannot pay.
                var transaction = await gs2!.Ranking2.Namespace(RankingNamespace).ClusterRankingModel(RankingName)
                    .ClusterRankingSeason(target.GuildId, target.Season, session!)
                    .ClusterRankingReceivedReward()
                    .ReceiveClusterRankingRewardAsync(speculativeExecute: false);
                if (transaction != null) await transaction.WaitAsync(true);
            }
            catch (BadRequestException error) when (GuildRankingDemo.Refused(error, "alreadyReceived"))
            {
                _received.Add((target.GuildId, target.Season));
                ForgetNext(target);
                return $"GS2 says season {target.Season} was already received (alreadyReceived).";
            }
            catch (BadRequestException error) when (GuildRankingDemo.Refused(error, "inSchedule") || GuildRankingDemo.Refused(error, "outOfSchedule"))
            {
                // This device's clock can run ahead of GS2's by a moment.
                _seasonStale = true;
                _nextSeasonRead = 0;
                return $"GS2 says season {target.Season} is still being played (inSchedule); it pays once it is over.";
            }
            catch (NotFoundException error) when (GuildRankingDemo.Refused(error, "noRewards"))
            {
                _paysNothing.Add((target.GuildId, target.Season));
                ForgetNext(target);
                return $"Your rank in season {target.Season} earns no reward tier (noRewards).";
            }
            catch (NotFoundException)
            {
                // Asking again would get the same answer, so the season is
                // put with those that pay nothing.
                _paysNothing.Add((target.GuildId, target.Season));
                ForgetNext(target);
                return $"GS2 has no score of yours for season {target.Season} (notFound).";
            }
            if (this == null) return "";
            _received.Add((target.GuildId, target.Season));
            ForgetNext(target);
            var rank = target.Rank != null ? $"rank {target.Rank}" : "your rank";
            return $"Received the reward for season {target.Season}: {rank} in {where}.";
        }

        /// <summary>Takes a season off what waits, and reads the rest again.</summary>
        private void ForgetNext(PastSeason target)
        {
            if (this == null) return;
            _pastGeneration++;
            if (Next == target)
            {
                Next = null;
                MoreWaiting = 0;
            }
            Updated?.Invoke();
            ReadPast();
        }

        // ------------------------------------------------------------------
        // The demo clock

        /// <summary>
        /// Now on GS2's clock for the visitor: this device's time plus the
        /// offset their account has (none while it is not read yet).
        /// </summary>
        private DateTime ServerNow() => DateTime.UtcNow.AddSeconds(DemoTimeOffset.Get(UserId));

        /// <summary>
        /// The session signed in again on the visitor's new clock: the season,
        /// the board and the past seasons are read afresh on it, and once more
        /// a moment later.
        /// </summary>
        /// <summary>The offset is stored; the session signs in on it next.</summary>
        private void OnClockChanged(string userId)
        {
            if (userId == UserId) _clockNotApplied = true;
        }

        private void OnClockApplied(string userId)
        {
            if (userId != UserId || this == null) return;
            _clockNotApplied = false;
            ReadAllAgain();
            StartCoroutine(ReadAllAfter(ClockSettleSeconds));
        }

        /// <summary>
        /// The account's offset was read. The session signed in with it
        /// already, so nothing is read again; only the countdown moves.
        /// </summary>
        private void OnOffsetLoaded(string userId)
        {
            if (userId == UserId && this != null) Updated?.Invoke();
        }

        private IEnumerator ReadAllAfter(float seconds)
        {
            yield return new WaitForSecondsRealtime(seconds);
            ReadAllAgain();
        }

        /// <summary>
        /// Drops what reads already out will answer, and has the next tick read
        /// everything again. A season that changed starts its board afresh.
        /// </summary>
        private void ReadAllAgain()
        {
            _seasonGeneration++;
            _seasonStale = true;
            _nextSeasonRead = 0;
            _standingGeneration++;
            _nextStandingRead = 0;
            _pastGeneration++;
            _nextPastRead = 0;
            Updated?.Invoke();
        }

        // ------------------------------------------------------------------
        // Reads

        /// <summary>
        /// Reads the season's event: which repeat it is on, and when that
        /// repeat ends. One read is out at a time.
        /// </summary>
        private async void ReadSeason()
        {
            if (_readingSeason || !GuildRankingDemo.TryRuntime(out var gs2, out var session)) return;
            _readingSeason = true;
            _seasonStale = false;
            var generation = ++_seasonGeneration;
            _nextSeasonRead = Time.realtimeSinceStartup + SeasonRetrySeconds;
            try
            {
                var result = await new Gs2ScheduleRestClient(gs2!.Super.RestSession).GetEventAsync(
                    new GetEventRequest()
                        .WithNamespaceName(ScheduleNamespace)
                        .WithEventName(SeasonEvent)
                        .WithAccessToken(session!.AccessToken.Token)
                        .WithIsInSchedule(false));
                if (this == null) return;
                Recovered(SeasonFailure);
                // A read that went out before the clock moved answers for the old clock.
                if (generation != _seasonGeneration) return;
                var repeat = result?.RepeatSchedule;
                var endsAt = repeat?.CurrentRepeatEndAt;
                if (repeat?.RepeatCount == null || endsAt == null)
                {
                    SeasonProblem = "The season's event has no current repeat; the schedule demo's stack may be out of date.";
                    Season = null;
                    SeasonEndsAt = null;
                }
                else
                {
                    var season = (long)repeat.RepeatCount.Value;
                    var ends = GuildRankingDemo.FromMilliseconds(endsAt.Value);
                    SeasonProblem = null;
                    var changed = season != Season;
                    Season = season;
                    SeasonEndsAt = ends;
                    // A season that GS2 still calls current although this
                    // device's clock says it is over is read again shortly.
                    _nextSeasonRead = Time.realtimeSinceStartup + (ends > ServerNow() ? SeasonRetrySeconds : 5f);
                    if (changed)
                    {
                        _standingGeneration++;
                        StandingKnown = false;
                        Total = null;
                        Rank = null;
                        Board = Array.Empty<ClusterRankingData>();
                        BoardHasMore = false;
                        _nextStandingRead = 0;
                        _nextPastRead = 0;
                    }
                }
                Updated?.Invoke();
            }
            catch (NotFoundException)
            {
                if (this == null) return;
                Recovered(SeasonFailure);
                if (generation != _seasonGeneration) return;
                SeasonProblem = "The season's event guild-season is not deployed yet, so no season is open.";
                Season = null;
                SeasonEndsAt = null;
                Updated?.Invoke();
            }
            catch (Exception error)
            {
                if (this != null) LogFailure(SeasonFailure, error);
            }
            finally
            {
                _readingSeason = false;
            }
        }

        /// <summary>
        /// Follows the guilds the visitor joined, as the lobby does: the SDK
        /// hands over the list on subscribing and again whenever GS2 says the
        /// visitor joined or left. A failure to start is tried again shortly.
        /// </summary>
        private async void FollowJoined()
        {
            if (_followingJoined || !GuildRankingDemo.TryRuntime(out var gs2, out var session)) return;
            _followingJoined = true;
            var ticket = ++_joinedTicket;
            var domain = gs2!;
            var player = session!;
            var visitor = domain.Super.Guild.Namespace(GuildRankingDemo.GuildNamespace).AccessToken(player.AccessToken);
            _visitor = visitor;
            _followDomain = domain;
            _followSession = player;
            UserId = player.UserId;
            try
            {
                var id = await visitor.SubscribeJoinedGuildsWithInitialCallAsync(joined =>
                {
                    // An empty list may only mean the cache no longer holds it.
                    if (joined == null || joined.Length == 0) RereadJoined(visitor, ticket, domain, player);
                    else Post(ticket, () => ApplyJoined(joined, domain, player));
                }, GuildRankingDemo.GuildKind);
                if (ticket == _joinedTicket)
                {
                    _joinedSubscription = id;
                    Recovered(FollowFailure);
                }
                else visitor.UnsubscribeJoinedGuilds(id, GuildRankingDemo.GuildKind);
            }
            catch (Exception error)
            {
                if (ticket != _joinedTicket) return;
                LogFailure(FollowFailure, error, warning: true);
                _followingJoined = false;
                _visitor = null;
                _followDomain = null;
                _followSession = null;
            }
        }

        /// <summary>Stops following the joined guilds and drops what the SDK still has to report.</summary>
        private void StopFollowingJoined()
        {
            _joinedTicket++;
            _guildReadTicket++;
            var visitor = _visitor;
            var id = _joinedSubscription;
            _visitor = null;
            _followDomain = null;
            _followSession = null;
            _joinedSubscription = null;
            _followingJoined = false;
            _membershipFailed = false;
            if (visitor != null && id != null) visitor.UnsubscribeJoinedGuilds(id.Value, GuildRankingDemo.GuildKind);
            while (_inbox.TryDequeue(out _)) { }
        }

        /// <summary>Hands an SDK callback to the main thread, unless the guilds stopped being followed first.</summary>
        private void Post(int ticket, Action apply) =>
            _inbox.Enqueue(() =>
            {
                if (ticket == _joinedTicket && this != null) apply();
            });

        /// <summary>
        /// Reads the joined guilds again through the domain, which answers
        /// from the cache while the cache holds them and otherwise reads them
        /// from GS2. It may run on the SDK's thread, so it touches nothing of
        /// Unity's and hands what it read to the main thread.
        /// </summary>
        private async void RereadJoined(VisitorDomain visitor, int ticket, Gs2Domain domain, IGameSession player)
        {
            try
            {
                var joined = await visitor.JoinedGuildsAsync(GuildRankingDemo.GuildKind).ToArrayAsync();
                Recovered(RereadFailure);
                Post(ticket, () => ApplyJoined(joined, domain, player));
            }
            catch (Exception error)
            {
                LogFailure(RereadFailure, error, warning: true);
                Post(ticket, () => _membershipFailed = true);
            }
        }

        /// <summary>
        /// Takes in which guild the joined list names. A guild it did not name
        /// before is read through the domain for its full id and name.
        /// </summary>
        private void ApplyJoined(JoinedGuild[]? joined, Gs2Domain gs2, IGameSession session)
        {
            // The SDK hands over the whole list, of every kind.
            var name = joined?.FirstOrDefault(entry => entry?.GuildModelName == GuildRankingDemo.GuildKind)?.GuildName;
            if (name == null)
            {
                _guildReadTicket++;
                _joinedGuildName = null;
                SetGuild(null, null);
                return;
            }
            if (name == _joinedGuildName && GuildKnown && GuildId != null) return;
            _joinedGuildName = name;
            ReadGuild(gs2, session, name);
        }

        /// <summary>Reads the named guild through the domain; a newer name, or leaving, drops what it read.</summary>
        private async void ReadGuild(Gs2Domain gs2, IGameSession session, string name)
        {
            var ticket = ++_guildReadTicket;
            GuildModel? guild = null;
            try
            {
                guild = await gs2.Super.Guild.Namespace(GuildRankingDemo.GuildNamespace)
                    .Guild(GuildRankingDemo.GuildKind, name)
                    .ModelAsync(session.AccessToken);
            }
            catch (NotFoundException)
            {
                // Disbanded after the list was read; the SDK hears the visitor
                // left and hands over the list again.
            }
            catch (Exception error)
            {
                if (ticket != _guildReadTicket || this == null) return;
                LogFailure(GuildFailure, error, warning: true);
                // Read again on the next list the SDK hands over, or at the
                // next retry.
                _joinedGuildName = null;
                _membershipFailed = true;
                return;
            }
            if (ticket != _guildReadTicket || this == null) return;
            Recovered(GuildFailure);
            if (guild?.GuildId == null)
            {
                // The guild is gone although the list still names it; until
                // the list catches up the visitor has no guild to play for.
                _joinedGuildName = null;
                SetGuild(null, null);
                return;
            }
            SetGuild(guild.GuildId, guild.DisplayName);
        }

        /// <summary>Records the visitor's guild, and starts its board afresh when it changed.</summary>
        private void SetGuild(string? guildId, string? displayName)
        {
            if (guildId != GuildId)
            {
                _standingGeneration++;
                StandingKnown = false;
                Total = null;
                Rank = null;
                Board = Array.Empty<ClusterRankingData>();
                BoardHasMore = false;
                _nextStandingRead = 0;
            }
            GuildKnown = true;
            GuildId = guildId;
            GuildDisplayName = displayName;
            Updated?.Invoke();
        }

        /// <summary>
        /// Reads the visitor's total and rank, and the top of their guild's
        /// board, for the season being played. One read is out at a time;
        /// asking during it makes one more when it returns.
        /// </summary>
        private async void ReadStanding()
        {
            if (!GuildRankingDemo.TryRuntime(out var gs2, out var session)) return;
            if (_readingStanding)
            {
                _readStandingAgain = true;
                return;
            }
            var guildId = GuildId;
            var season = Season;
            if (guildId == null || season == null) return;
            _readingStanding = true;
            try
            {
                await ReadStandingOnce(gs2!, session!, guildId, season.Value);
                Recovered(BoardFailure);
            }
            catch (Exception error)
            {
                LogFailure(BoardFailure, error);
            }
            finally
            {
                _readingStanding = false;
                if (_readStandingAgain && this != null)
                {
                    _readStandingAgain = false;
                    ReadStanding();
                }
            }
        }

        private async Task ReadStandingOnce(Gs2Domain gs2, IGameSession session, string guildId, long season)
        {
            var generation = ++_standingGeneration;
            var client = new Gs2Ranking2RestClient(gs2.Super.RestSession);
            var token = session.AccessToken.Token;

            // GS2 answers for a visitor who has not played too, with neither a
            // score nor a rank.
            var own = await client.GetClusterRankingAsync(
                new GetClusterRankingRequest()
                    .WithNamespaceName(RankingNamespace)
                    .WithRankingName(RankingName)
                    .WithClusterName(guildId)
                    .WithSeason(season)
                    .WithAccessToken(token));

            var board = await client.DescribeClusterRankingsAsync(
                new DescribeClusterRankingsRequest()
                    .WithNamespaceName(RankingNamespace)
                    .WithRankingName(RankingName)
                    .WithClusterName(guildId)
                    .WithSeason(season)
                    .WithLimit(BoardSize)
                    .WithAccessToken(token));

            // The season waiting to be received is read along with the board,
            // since its rank moves while guildmates who did not advance their
            // clock still play it.
            var waiting = Next;
            var pastGeneration = _pastGeneration;
            (int? rank, long? score)? waitingStanding = null;
            if (waiting != null)
            {
                waitingStanding = await ReadStandingIn(client, token, waiting.GuildId, waiting.Season);
            }

            if (this == null) return;
            if (waiting != null && waitingStanding != null && Next == waiting && pastGeneration == _pastGeneration)
            {
                waiting.Rank = waitingStanding.Value.rank;
                waiting.Score = waitingStanding.Value.score ?? waiting.Score;
            }
            if (generation != _standingGeneration)
            {
                if (waiting != null) Updated?.Invoke();
                return;
            }
            Total = own?.Item?.Score;
            Rank = own?.Item?.Rank;
            Board = board?.Items ?? Array.Empty<ClusterRankingData>();
            BoardHasMore = !string.IsNullOrEmpty(board?.NextPageToken);
            StandingKnown = true;
            Updated?.Invoke();
        }

        /// <summary>
        /// Reads every score the visitor made in this ranking and every reward
        /// they received, and finds the latest season that is over and still
        /// pays. A visitor who changed guilds has one score per guild in a
        /// season, and each is received on its own. Called on start, when the
        /// season turns over and after a receipt; a failed read is tried again
        /// shortly.
        /// </summary>
        private async void ReadPast()
        {
            if (!GuildRankingDemo.TryRuntime(out var gs2, out var session)) return;
            if (_readingPast)
            {
                _readPastAgain = true;
                return;
            }
            var season = Season;
            if (season == null) return;
            _readingPast = true;
            try
            {
                await ReadPastOnce(gs2!, session!, season.Value);
                Recovered(PastFailure);
            }
            catch (Exception error)
            {
                LogFailure(PastFailure, error);
                if (this != null) _nextPastRead = Time.realtimeSinceStartup + PastRetrySeconds;
                if (this != null && !PastKnown)
                {
                    PastProblem = $"Your past seasons could not be read: {error.Message}";
                    Updated?.Invoke();
                }
            }
            finally
            {
                _readingPast = false;
                if (_readPastAgain && this != null)
                {
                    _readPastAgain = false;
                    ReadPast();
                }
            }
        }

        private async Task ReadPastOnce(Gs2Domain gs2, IGameSession session, long current)
        {
            var generation = ++_pastGeneration;
            var client = new Gs2Ranking2RestClient(gs2.Super.RestSession);
            var token = session.AccessToken.Token;

            var scores = new List<ClusterRankingScore>();
            string? pageToken = null;
            do
            {
                var page = await client.DescribeClusterRankingScoresAsync(
                    new DescribeClusterRankingScoresRequest()
                        .WithNamespaceName(RankingNamespace)
                        .WithRankingName(RankingName)
                        .WithPageToken(pageToken)
                        .WithLimit(PageSize)
                        .WithAccessToken(token));
                scores.AddRange(page?.Items ?? Array.Empty<ClusterRankingScore>());
                pageToken = page?.NextPageToken;
            } while (!string.IsNullOrEmpty(pageToken));

            bool Settled(ClusterRankingScore score) =>
                _received.Contains((score.ClusterName, score.Season!.Value)) ||
                _paysNothing.Contains((score.ClusterName, score.Season!.Value));

            var over = scores
                .Where(score => score?.ClusterName != null && score.Season != null && score.Season < current)
                .ToArray();

            // The receipts are read only while a season that is over is not
            // yet known to be received or to pay nothing.
            if (over.Any(score => !Settled(score)))
            {
                pageToken = null;
                do
                {
                    var page = await client.DescribeClusterRankingReceivedRewardsAsync(
                        new DescribeClusterRankingReceivedRewardsRequest()
                            .WithNamespaceName(RankingNamespace)
                            .WithRankingName(RankingName)
                            .WithPageToken(pageToken)
                            .WithLimit(PageSize)
                            .WithAccessToken(token));
                    foreach (var receipt in page?.Items ?? Array.Empty<ClusterRankingReceivedReward>())
                    {
                        if (receipt?.ClusterName != null && receipt.Season != null) _received.Add((receipt.ClusterName, receipt.Season.Value));
                    }
                    pageToken = page?.NextPageToken;
                } while (!string.IsNullOrEmpty(pageToken));
            }

            var waiting = over
                .Where(score => !Settled(score))
                .OrderByDescending(score => score.Season)
                .ToArray();

            PastSeason? next = null;
            if (waiting.Length > 0)
            {
                var latest = waiting[0];
                var key = (latest.ClusterName, latest.Season!.Value);
                // The rank is read every time: a season that is over for the
                // visitor, who advanced their clock, is still being played by
                // guildmates who did not, so their scores can still pass it.
                // A guild keeps its name until it is gone, so that is asked once.
                var standing = await ReadStandingIn(client, token, latest.ClusterName, key.Item2);
                standing.score ??= latest.Score;
                if (!_guildNames.TryGetValue(latest.ClusterName, out var displayName))
                {
                    displayName = await DisplayNameOf(gs2, session, latest.ClusterName);
                    _guildNames[latest.ClusterName] = displayName;
                }
                next = new PastSeason
                {
                    Season = key.Item2,
                    GuildId = latest.ClusterName,
                    GuildDisplayName = displayName,
                    Score = standing.score,
                    Rank = standing.rank,
                };
            }

            if (this == null || generation != _pastGeneration) return;
            Next = next;
            MoreWaiting = Math.Max(0, waiting.Length - 1);
            PastKnown = true;
            PastProblem = null;
            Updated?.Invoke();
        }

        /// <summary>The visitor's rank and score in a guild's board for a season, as GS2 has them now.</summary>
        private static async Task<(int? rank, long? score)> ReadStandingIn(
            Gs2Ranking2RestClient client, string token, string guildId, long season)
        {
            var result = await client.GetClusterRankingAsync(
                new GetClusterRankingRequest()
                    .WithNamespaceName(RankingNamespace)
                    .WithRankingName(RankingName)
                    .WithClusterName(guildId)
                    .WithSeason(season)
                    .WithAccessToken(token));
            return (result?.Item?.Rank, result?.Item?.Score);
        }

        /// <summary>
        /// The name the guild's founder gave it; null once the guild is gone,
        /// since a disbanded guild's season still pays.
        /// </summary>
        private static async Task<string?> DisplayNameOf(Gs2Domain gs2, IGameSession session, string guildId)
        {
            try
            {
                var guild = await new Gs2GuildRestClient(gs2.Super.RestSession).GetGuildAsync(
                    new GetGuildRequest()
                        .WithNamespaceName(GuildRankingDemo.GuildNamespace)
                        .WithGuildModelName(GuildRankingDemo.GuildKind)
                        .WithGuildName(GuildRankingDemo.GuildNameOf(guildId))
                        .WithAccessToken(session.AccessToken.Token));
                return guild?.Item?.DisplayName;
            }
            catch (NotFoundException)
            {
                return null;
            }
        }
    }
}
