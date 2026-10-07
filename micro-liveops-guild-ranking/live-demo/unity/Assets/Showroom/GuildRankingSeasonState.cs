// Ranking reads use REST so polling does not reuse the SDK domain cache.
// Read generations guard ranking and season display updates after plays, receipts or clock changes.
#nullable enable

using System;
using System.Collections;
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
using Gs2.Gs2Ranking2.Exception;
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
    internal sealed class GuildRankingSeasonState : MonoBehaviour
    {
        private const string RankingNamespace = "GuildRanking";
        private const string RankingName = "guild";

        private const string ScheduleNamespace = "Schedule";
        private const string SeasonEvent = "guild-season";

        public const int MinimumScore = 1;
        public const int MaximumScore = 100;

        public const int BoardSize = 10;

        private const float TickSeconds = 1f;
        private const float StandingPollSeconds = 6f;

        private const float SeasonRetrySeconds = 30f;

        private const float MembershipRetrySeconds = 5f;

        private const float PastRetrySeconds = 30f;

        // Keep one delayed refresh after a clock change instead of assuming the first refresh has settled.
        private const float ClockSettleSeconds = 3f;

        private const int PageSize = 100;

        private const string SeasonFailure = "The season could not be read";
        private const string FollowFailure = "The guilds could not be followed";
        private const string RereadFailure = "The guilds could not be read again";
        private const string GuildFailure = "The guild could not be read";
        private const string BoardFailure = "The board could not be read";
        private const string PastFailure = "The past seasons could not be read";

        private static GuildRankingSeasonState? _instance;

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

        // A past score is a reward candidate; Receive still handles missing tiers and server rejections.
        public sealed class PastSeason
        {
            public long Season;
            public string GuildId = "";
            public string? GuildDisplayName;
            public long? Score;
            public int? Rank;
        }

        public event Action? Updated;

        public string UserId { get; private set; } = "";

        public long? Season { get; private set; }

        public DateTime? SeasonEndsAt { get; private set; }

        // The countdown uses the device clock; an unknown account offset must not be treated as zero.
        public DateTime? SeasonEndsOnDevice =>
            DemoTimeOffset.TryGet(UserId, out var offset) ? SeasonEndsAt?.AddSeconds(-offset) : null;

        public string? SeasonProblem { get; private set; }

        public bool GuildKnown { get; private set; }

        // Ranking cluster keys use the full guild ID, not its display name.
        public string? GuildId { get; private set; }

        public string? GuildDisplayName { get; private set; }

        public bool StandingKnown { get; private set; }

        public long? Total { get; private set; }

        public int? Rank { get; private set; }

        public ClusterRankingData[] Board { get; private set; } = Array.Empty<ClusterRankingData>();

        public bool BoardHasMore { get; private set; }

        public bool PastKnown { get; private set; }

        public PastSeason? Next { get; private set; }

        public int MoreWaiting { get; private set; }

        public string? PastProblem { get; private set; }

        private bool _readingSeason;

        private bool _seasonStale;

        private int _seasonGeneration;

        // Storing a new offset does not mean the session has applied it; keep the warning until Applied arrives.
        private bool _clockNotApplied;
        private bool _readingStanding;
        private bool _readStandingAgain;
        private bool _readingPast;
        private bool _readPastAgain;

        private int _standingGeneration;

        private int _pastGeneration;

        // A visitor can score for different guilds in one season, so receipt identity needs both keys.
        private readonly HashSet<(string, long)> _received = new HashSet<(string, long)>();

        // Remember rejected reward candidates so later reads do not keep offering them.
        private readonly HashSet<(string, long)> _paysNothing = new HashSet<(string, long)>();

        private readonly Dictionary<string, string?> _guildNames = new Dictionary<string, string?>();

        private readonly ShowroomInbox _inbox = new ShowroomInbox();

        private VisitorDomain? _visitor;

        private ulong? _joinedSubscription;

        private int _joinedTicket;

        private int _guildReadTicket;

        private string? _joinedGuildName;

        private bool _followingJoined;

        // Capture these on the main thread so callback-driven retries do not query Unity state.
        private Gs2Domain? _followDomain;
        private IGameSession? _followSession;

        private bool _membershipFailed;

        private float _nextSeasonRead;
        private float _nextMembershipWatch;
        private float _nextStandingRead;
        private float _nextPastRead;

        // Repeated polling failures would flood the log; keep a separate latch per read so recovery is independent.
        // The latch dictionary is confined to the main thread.
        private readonly Dictionary<string, ShowroomLatch> _failures = new Dictionary<string, ShowroomLatch>();

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

        private void LogFailure(string what, Exception error)
        {
            Latch(what).Fail(what, error);
        }

        private void Recovered(string what)
        {
            Latch(what).Succeeded();
        }

        private ShowroomLatch Latch(string what)
        {
            if (!_failures.TryGetValue(what, out var latch))
            {
                latch = new ShowroomLatch();
                _failures[what] = latch;
            }
            return latch;
        }

        private void Update()
        {
            _inbox.Drain();
        }

        private IEnumerator Run()
        {
            IGameSession? session;
            while (!ShowroomRuntime.TryGet(out _, out session))
            {
                yield return new WaitForSeconds(0.25f);
            }
            UserId = session.UserId;
            DemoTimeOffset.TryGet(UserId, out _);
            var tick = new WaitForSecondsRealtime(TickSeconds);
            while (true)
            {
                var now = Time.realtimeSinceStartup;
                // Do not decide rollover from the device clock before the account offset is known.
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
                        // Retry failed membership reads without depending on another subscription notification.
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
                    _nextPastRead = float.PositiveInfinity;
                    ReadPast();
                }
                yield return tick;
            }
        }


        public async Task<string> Play()
        {
            if (!ShowroomRuntime.TryGet(out var gs2, out var session)) return "Not signed in yet.";
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
                await gs2.Ranking2.Namespace(RankingNamespace).ClusterRankingModel(RankingName)
                    .ClusterRankingSeason(guildId, season, session)
                    .PutClusterRankingAsync(score);
            }
            catch (NotIncludedInClusterException)
            {
                return "GS2 refused the score (notInclude): you are not a member of that guild any more. Scores count only for the guild you belong to.";
            }
            catch (NotFoundException)
            {
                _nextSeasonRead = 0;
                SeasonEndsAt = null;
                Season = null;
                Updated?.Invoke();
                return "GS2 refused the score (notFound): the season is not open right now. The page reads the season again.";
            }
            if (this == null) return "";
            if (season != Season)
            {
                // The displayed season changed while the score was submitted; revisit its possible reward.
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

        public async Task<string> Receive()
        {
            if (!ShowroomRuntime.TryGet(out var gs2, out var session)) return "Not signed in yet.";
            if (!PastKnown) return PastProblem ?? "Still reading your past seasons; try again in a moment.";
            var target = Next;
            if (target == null)
            {
                return "Nothing to receive. A season pays once it is over, and only if you scored in it.";
            }
            var where = target.GuildDisplayName ?? "your guild";
            try
            {
                // Target the selected past season explicitly; the currently displayed season may be different.
                var transaction = await gs2.Ranking2.Namespace(RankingNamespace).ClusterRankingModel(RankingName)
                    .ClusterRankingSeason(target.GuildId, target.Season, session)
                    .ClusterRankingReceivedReward()
                    .ReceiveClusterRankingRewardAsync(speculativeExecute: false);
                if (transaction != null) await transaction.WaitAsync(true);
            }
            catch (RewardAlreadyReceivedException)
            {
                _received.Add((target.GuildId, target.Season));
                ForgetNext(target);
                return $"GS2 says season {target.Season} was already received (alreadyReceived).";
            }
            catch (BadRequestException error) when (error is SeasonNotEndedException || error is SeasonNotStartedException)
            {
                // Local eligibility did not match the server response; refresh the season before another attempt.
                _seasonStale = true;
                _nextSeasonRead = 0;
                return $"GS2 says season {target.Season} is still being played (inSchedule); it pays once it is over.";
            }
            catch (NoRankingRewardException)
            {
                _paysNothing.Add((target.GuildId, target.Season));
                ForgetNext(target);
                return $"Your rank in season {target.Season} earns no reward tier (noRewards).";
            }
            catch (NotFoundException)
            {
                // Treat a missing score as settled locally so it is not offered again by subsequent history reads.
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


        private DateTime ServerNow() => DateTime.UtcNow.AddSeconds(DemoTimeOffset.Get(UserId));

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

        // An offset read only corrects local time conversion; it must not initiate a session refresh.
        private void OnOffsetLoaded(string userId)
        {
            if (userId == UserId && this != null) Updated?.Invoke();
        }

        private IEnumerator ReadAllAfter(float seconds)
        {
            yield return new WaitForSecondsRealtime(seconds);
            ReadAllAgain();
        }

        // Old in-flight reads must not overwrite newer state after the account clock changes.
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


        private async void ReadSeason()
        {
            if (_readingSeason || !ShowroomRuntime.TryGet(out var gs2, out var session)) return;
            _readingSeason = true;
            _seasonStale = false;
            var generation = ++_seasonGeneration;
            _nextSeasonRead = Time.realtimeSinceStartup + SeasonRetrySeconds;
            try
            {
                var result = await new Gs2ScheduleRestClient(gs2.Super.RestSession).GetEventAsync(
                    new GetEventRequest()
                        .WithNamespaceName(ScheduleNamespace)
                        .WithEventName(SeasonEvent)
                        .WithAccessToken(session.AccessToken.Token)
                        .WithIsInSchedule(false));
                if (this == null) return;
                Recovered(SeasonFailure);
                // A clock refresh invalidates this result even if its request completed successfully.
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
                    // The local deadline may already have passed while GS2 still reports this repeat; retry sooner.
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

        private async void FollowJoined()
        {
            if (_followingJoined || !ShowroomRuntime.TryGet(out var gs2, out var session)) return;
            _followingJoined = true;
            var ticket = ++_joinedTicket;
            var domain = gs2;
            var player = session;
            var visitor = domain.Super.Guild.Namespace(GuildRankingDemo.GuildNamespace).AccessToken(player.AccessToken);
            _visitor = visitor;
            _followDomain = domain;
            _followSession = player;
            UserId = player.UserId;
            try
            {
                var id = await visitor.SubscribeJoinedGuildsWithInitialCallAsync(joined =>
                {
                    // An empty cache notification does not prove the visitor left; reread before clearing membership.
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
                LogFailure(FollowFailure, error);
                _followingJoined = false;
                _visitor = null;
                _followDomain = null;
                _followSession = null;
            }
        }

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
            _inbox.Clear();
        }

        // Queued subscription callbacks may outlive unsubscribe; check the ticket when the main thread drains them.
        private void Post(int ticket, Action apply) =>
            _inbox.Post(() =>
            {
                if (ticket == _joinedTicket && this != null) apply();
            });

        // SDK callbacks may run off-thread; defer membership and Unity-facing updates through Post.
        private async void RereadJoined(VisitorDomain visitor, int ticket, Gs2Domain domain, IGameSession player)
        {
            try
            {
                var joined = await visitor.JoinedGuildsAsync(GuildRankingDemo.GuildKind).ToArrayAsync();
                Post(ticket, () =>
                {
                    Recovered(RereadFailure);
                    ApplyJoined(joined, domain, player);
                });
            }
            catch (Exception error)
            {
                Post(ticket, () =>
                {
                    LogFailure(RereadFailure, error);
                    _membershipFailed = true;
                });
            }
        }

        private void ApplyJoined(JoinedGuild[]? joined, Gs2Domain gs2, IGameSession session)
        {
            // The subscription cache key is shared across guild kinds; filter before choosing this demo's guild.
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

        // A newer membership result must win even if an older guild request finishes later.
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
                // A stale joined list may still name a missing guild; let the null result clear the displayed membership.
            }
            catch (Exception error)
            {
                if (ticket != _guildReadTicket || this == null) return;
                LogFailure(GuildFailure, error);
                // Clear the remembered name so a retry is not skipped as an unchanged membership.
                _joinedGuildName = null;
                _membershipFailed = true;
                return;
            }
            if (ticket != _guildReadTicket || this == null) return;
            Recovered(GuildFailure);
            if (guild?.GuildId == null)
            {
                _joinedGuildName = null;
                SetGuild(null, null);
                return;
            }
            SetGuild(guild.GuildId, guild.DisplayName);
        }

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

        // Coalesce overlapping requests into one follow-up read so a play during polling still gets a refresh.
        private async void ReadStanding()
        {
            if (!ShowroomRuntime.TryGet(out var gs2, out var session)) return;
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
                await ReadStandingOnce(gs2, session, guildId, season.Value);
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

            // Guildmates may still be playing this earlier season on their own clocks, so its displayed rank remains provisional.
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

        // Search across guilds: receiving for the current guild must not hide rewards from a previous guild.
        private async void ReadPast()
        {
            if (!ShowroomRuntime.TryGet(out var gs2, out var session)) return;
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
                await ReadPastOnce(gs2, session, season.Value);
                Recovered(PastFailure);
            }
            catch (Exception error)
            {
                LogFailure(PastFailure, error);
                if (this != null) _nextPastRead = Time.realtimeSinceStartup + PastRetrySeconds;
                if (this != null && !PastKnown)
                {
                    PastProblem = $"Your past seasons could not be read: {ShowroomErrors.Describe(error)}";
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

            // Skip receipt pagination once every past score is already settled locally.
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
                // Reread the candidate rank because other accounts may still be playing that season.
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

        // A missing guild name must not prevent a past score from being offered as a reward candidate.
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
