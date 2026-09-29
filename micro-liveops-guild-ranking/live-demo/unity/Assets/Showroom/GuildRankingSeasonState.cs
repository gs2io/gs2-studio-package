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
// read from that event, once, and again only when the season is over. The
// visitor's guild is read every few seconds, and it is the guild's full id,
// read from GS2 once per guild, that the scores are filed under. The guild,
// the board, the visitor's total and their past seasons are read through the
// REST client and are shown as they are: nothing here writes into the SDK
// cache, reloads or invalidates anything, so the lobby's view of the same
// guild is the SDK's alone. GS2 does not announce a new
// score, so the board is read every few seconds; it has no cache in the way,
// so what another member scored shows at the next read. Playing and receiving
// go through the SDK, so the wallet the page shows hears the reward land.
//
// A read answers for the moment it started. One that started before a play or
// a receipt, before the guild or the season changed, or before a newer read of
// the same thing, is dropped when it lands, so it cannot put back what the
// press just changed.
#nullable enable

using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

using UnityEngine;

using Gs2.Core.Exception;
using Gs2.Gs2Guild;
using Gs2.Gs2Guild.Request;
using Gs2.Gs2Ranking2;
using Gs2.Gs2Ranking2.Model;
using Gs2.Gs2Ranking2.Request;
using Gs2.Gs2Schedule;
using Gs2.Gs2Schedule.Request;
using Gs2.Unity.Core;
using Gs2.Unity.Util;

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

        /// <summary>How many places the board shows; a guild holds at most ten members.</summary>
        public const int BoardSize = 10;

        private const float TickSeconds = 1f;
        private const float MembershipPollSeconds = 3f;
        private const float StandingPollSeconds = 6f;
        private const float PastPollSeconds = 60f;

        /// <summary>How long to wait before reading the event again after it could not be read.</summary>
        private const float SeasonRetrySeconds = 30f;

        private const int PageSize = 100;

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

        /// <summary>When the season turns over, once the event has been read.</summary>
        public DateTime? SeasonEndsAt { get; private set; }

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

        /// <summary>The guild's board this season, best first.</summary>
        public ClusterRankingData[] Board { get; private set; } = Array.Empty<ClusterRankingData>();

        /// <summary>Whether the past seasons have been read once.</summary>
        public bool PastKnown { get; private set; }

        /// <summary>The latest season the visitor can still receive for, or null.</summary>
        public PastSeason? Next { get; private set; }

        /// <summary>How many more earlier seasons wait besides <see cref="Next"/>.</summary>
        public int MoreWaiting { get; private set; }

        /// <summary>Why the past seasons could not be read, or null.</summary>
        public string? PastProblem { get; private set; }

        private bool _readingSeason;
        private bool _readingMembership;
        private bool _readingStanding;
        private bool _readStandingAgain;
        private bool _readingPast;
        private bool _readPastAgain;

        /// <summary>Bumped by every standing read as it starts, and by every play and change of guild or season.</summary>
        private int _standingGeneration;

        /// <summary>Bumped by every past read as it starts, and by every receipt.</summary>
        private int _pastGeneration;

        /// <summary>Seasons GS2 said pay nothing for the visitor's rank, keyed by guild and season.</summary>
        private readonly HashSet<(string, long)> _paysNothing = new HashSet<(string, long)>();

        private float _nextSeasonRead;
        private float _nextMembershipRead;
        private float _nextStandingRead;
        private float _nextPastRead;

        private void OnEnable()
        {
            StartCoroutine(Run());
        }

        private IEnumerator Run()
        {
            while (!GuildRankingDemo.TryRuntime(out _, out _))
            {
                yield return new WaitForSeconds(0.25f);
            }
            var tick = new WaitForSecondsRealtime(TickSeconds);
            while (true)
            {
                var now = Time.realtimeSinceStartup;
                // The season is read again once it is over; until then the
                // event answers the same.
                var over = SeasonEndsAt != null && DateTime.UtcNow >= SeasonEndsAt;
                if (now >= _nextSeasonRead && (Season == null || over)) ReadSeason();
                if (now >= _nextMembershipRead)
                {
                    _nextMembershipRead = now + MembershipPollSeconds;
                    ReadMembership();
                }
                if (now >= _nextStandingRead)
                {
                    _nextStandingRead = now + StandingPollSeconds;
                    ReadStanding();
                }
                if (now >= _nextPastRead)
                {
                    _nextPastRead = now + PastPollSeconds;
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
            if (SeasonEndsAt != null && DateTime.UtcNow >= SeasonEndsAt)
            {
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
                // The visitor left, or was removed, since the guild was last read.
                _nextMembershipRead = 0;
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
            if (guildId != GuildId || season != Season) return $"You scored {score}.";
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
                ForgetNext(target);
                return $"GS2 says season {target.Season} was already received (alreadyReceived).";
            }
            catch (BadRequestException error) when (GuildRankingDemo.Refused(error, "inSchedule") || GuildRankingDemo.Refused(error, "outOfSchedule"))
            {
                // This device's clock can run ahead of GS2's by a moment.
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
                ForgetNext(target);
                return $"GS2 has no score of yours for season {target.Season} (notFound).";
            }
            if (this == null) return "";
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
        // Reads

        /// <summary>
        /// Reads the season's event: which repeat it is on, and when that
        /// repeat ends. One read is out at a time.
        /// </summary>
        private async void ReadSeason()
        {
            if (_readingSeason || !GuildRankingDemo.TryRuntime(out var gs2, out var session)) return;
            _readingSeason = true;
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
                    _nextSeasonRead = Time.realtimeSinceStartup + (ends > DateTime.UtcNow ? SeasonRetrySeconds : 5f);
                    if (changed)
                    {
                        _standingGeneration++;
                        StandingKnown = false;
                        Total = null;
                        Rank = null;
                        Board = Array.Empty<ClusterRankingData>();
                        _nextStandingRead = 0;
                        _nextPastRead = 0;
                    }
                }
                Updated?.Invoke();
            }
            catch (NotFoundException)
            {
                if (this == null) return;
                SeasonProblem = "The season's event guild-season is not deployed yet, so no season is open.";
                Season = null;
                SeasonEndsAt = null;
                Updated?.Invoke();
            }
            catch (Exception error)
            {
                Debug.LogError($"{nameof(GuildRankingSeasonState)}: the season could not be read: {error}");
            }
            finally
            {
                _readingSeason = false;
            }
        }

        /// <summary>
        /// Reads which guild the visitor belongs to, and, when it changed,
        /// that guild's full id and name. One read is out at a time.
        /// </summary>
        private async void ReadMembership()
        {
            if (_readingMembership || !GuildRankingDemo.TryRuntime(out var gs2, out var session)) return;
            _readingMembership = true;
            try
            {
                var client = new Gs2GuildRestClient(gs2!.Super.RestSession);
                var token = session!.AccessToken.Token;
                var joined = await client.DescribeJoinedGuildsAsync(
                    new DescribeJoinedGuildsRequest()
                        .WithNamespaceName(GuildRankingDemo.GuildNamespace)
                        .WithGuildModelName(GuildRankingDemo.GuildKind)
                        .WithAccessToken(token));
                var name = joined?.Items?.FirstOrDefault(entry => entry?.GuildModelName == GuildRankingDemo.GuildKind)?.GuildName;
                var guildId = GuildId;
                var displayName = GuildDisplayName;
                if (name == null)
                {
                    guildId = null;
                    displayName = null;
                }
                else if (guildId == null || GuildRankingDemo.GuildNameOf(guildId) != name)
                {
                    var guild = await client.GetGuildAsync(
                        new GetGuildRequest()
                            .WithNamespaceName(GuildRankingDemo.GuildNamespace)
                            .WithGuildModelName(GuildRankingDemo.GuildKind)
                            .WithGuildName(name)
                            .WithAccessToken(token));
                    guildId = guild?.Item?.GuildId;
                    displayName = guild?.Item?.DisplayName;
                }
                if (this == null) return;
                UserId = session.UserId;
                var changed = !GuildKnown || guildId != GuildId || displayName != GuildDisplayName;
                if (guildId != GuildId)
                {
                    _standingGeneration++;
                    StandingKnown = false;
                    Total = null;
                    Rank = null;
                    Board = Array.Empty<ClusterRankingData>();
                    _nextStandingRead = 0;
                }
                GuildKnown = true;
                GuildId = guildId;
                GuildDisplayName = displayName;
                if (changed) Updated?.Invoke();
            }
            catch (NotFoundException)
            {
                // The guild was disbanded between the two reads; the next
                // read no longer lists it.
            }
            catch (Exception error)
            {
                Debug.LogWarning($"{nameof(GuildRankingSeasonState)}: the guild could not be read: {error}");
            }
            finally
            {
                _readingMembership = false;
            }
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
            }
            catch (Exception error)
            {
                Debug.LogError($"{nameof(GuildRankingSeasonState)}: the board could not be read: {error}");
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

            if (this == null || generation != _standingGeneration) return;
            Total = own?.Item?.Score;
            Rank = own?.Item?.Rank;
            Board = board?.Items ?? Array.Empty<ClusterRankingData>();
            StandingKnown = true;
            Updated?.Invoke();
        }

        /// <summary>
        /// Reads every score the visitor made in this ranking and every reward
        /// they received, and finds the latest season that is over and still
        /// pays. A visitor who changed guilds has one score per guild in a
        /// season, and each is received on its own.
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
            }
            catch (Exception error)
            {
                Debug.LogError($"{nameof(GuildRankingSeasonState)}: the past seasons could not be read: {error}");
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

            var received = new HashSet<(string, long)>();
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
                    if (receipt?.ClusterName != null && receipt.Season != null) received.Add((receipt.ClusterName, receipt.Season.Value));
                }
                pageToken = page?.NextPageToken;
            } while (!string.IsNullOrEmpty(pageToken));

            var waiting = scores
                .Where(score => score?.ClusterName != null && score.Season != null && score.Season < current)
                .Where(score => !received.Contains((score.ClusterName, score.Season!.Value)))
                .Where(score => !_paysNothing.Contains((score.ClusterName, score.Season!.Value)))
                .OrderByDescending(score => score.Season)
                .ToArray();

            PastSeason? next = null;
            if (waiting.Length > 0)
            {
                var latest = waiting[0];
                next = new PastSeason
                {
                    Season = latest.Season!.Value,
                    GuildId = latest.ClusterName,
                    Score = latest.Score,
                };
                var rank = await client.GetClusterRankingAsync(
                    new GetClusterRankingRequest()
                        .WithNamespaceName(RankingNamespace)
                        .WithRankingName(RankingName)
                        .WithClusterName(latest.ClusterName)
                        .WithSeason(latest.Season)
                        .WithAccessToken(token));
                next.Rank = rank?.Item?.Rank;
                next.Score = rank?.Item?.Score ?? next.Score;
                next.GuildDisplayName = await DisplayNameOf(gs2, session, latest.ClusterName);
            }

            if (this == null || generation != _pastGeneration) return;
            Next = next;
            MoreWaiting = Math.Max(0, waiting.Length - 1);
            PastKnown = true;
            PastProblem = null;
            Updated?.Invoke();
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
