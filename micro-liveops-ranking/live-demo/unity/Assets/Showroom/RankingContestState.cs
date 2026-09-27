// The contest as the page shows it: whether the visitor's window is open, what
// they have on the shared board, and whether they have received their reward.
//
// Nothing here is a generated binding. The board is not user data a package can
// list, and submitting a score is not an action a package can host, so both go
// straight to GS2. Reads go through the REST client: they are shown as they
// are and never written back into the SDK cache, so nothing here reloads or
// invalidates anything. Playing and receiving go through the SDK, so the
// wallet the page shows hears the reward land.
//
// The window is the contest trigger, which Start and Finish contest move with
// exchanges run on the server; nothing tells the page, so the trigger is read
// every few seconds, and again whenever a press needs to know. The board is
// read less often, and again after every play. GS2 keeps the top of the board
// for a few minutes, so another visitor's new score can take that long to
// appear; a visitor's own score is placed on it straight away.
//
// A read answers for the moment it started. One that started before a play or
// a receipt, or before a newer read of the same thing, is dropped when it
// lands, so it cannot put back what the press just changed.
#nullable enable

using System;
using System.Collections;
using System.Linq;
using System.Threading.Tasks;

using UnityEngine;

using Gs2.Core.Exception;
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
    /// The contest window and the visitor's standing, kept current for the
    /// page's rows. One per page, made by the first row that asks.
    /// </summary>
    internal sealed class RankingContestState : MonoBehaviour
    {
        /// <summary>The ranking namespace the feature package deploys, and the demo's one ranking.</summary>
        private const string RankingNamespace = "Ranking";
        private const string RankingName = "contest";

        /// <summary>
        /// The ranking's one season. Its window is a relative event whose
        /// repeat is always, so the season never moves on and every visitor's
        /// scores meet in season 0.
        /// </summary>
        private const long Season = 0;

        /// <summary>The schedule namespace and the trigger that opens the contest.</summary>
        private const string ScheduleNamespace = "Schedule";
        private const string Trigger = "ranking-contest";

        /// <summary>The highest score a play can make, which is the ranking's own limit.</summary>
        public const int MaximumScore = 1000;

        /// <summary>How many places the board shows.</summary>
        public const int BoardSize = 10;

        private const float TriggerPollSeconds = 3f;
        private const float StandingPollSeconds = 15f;

        private static RankingContestState? _instance;

        /// <summary>The page's contest, made on first use.</summary>
        public static RankingContestState Shared
        {
            get
            {
                if (_instance == null)
                {
                    var host = new GameObject(nameof(RankingContestState));
                    DontDestroyOnLoad(host);
                    _instance = host.AddComponent<RankingContestState>();
                }
                return _instance;
            }
        }

        /// <summary>Raised whenever what the rows show may have changed.</summary>
        public event Action? Updated;

        /// <summary>Whether the trigger and the standing have both been read once.</summary>
        public bool HasValue => _triggerRead && _standingRead;

        /// <summary>Whether the visitor's window is open now.</summary>
        public bool Open => EndsAt != null;

        /// <summary>When the visitor's window closes, or null while it is not open.</summary>
        public DateTime? EndsAt
        {
            get
            {
                if (_triggerExpiresAt <= 0) return null;
                var ends = DateTimeOffset.FromUnixTimeMilliseconds(_triggerExpiresAt).UtcDateTime;
                return ends > DateTime.UtcNow ? ends : null;
            }
        }

        /// <summary>The visitor's standing score on the board, or null before their first play.</summary>
        public long? Best { get; private set; }

        /// <summary>The visitor's rank on the board, or null before their first play.</summary>
        public int? Rank { get; private set; }

        /// <summary>The top of the board, best first.</summary>
        public GlobalRankingData[] Board { get; private set; } = Array.Empty<GlobalRankingData>();

        /// <summary>Whether the visitor has received this contest's reward.</summary>
        public bool Received { get; private set; }

        /// <summary>The signed-in visitor.</summary>
        public string UserId { get; private set; } = "";

        private long _triggerExpiresAt;
        private bool _triggerRead;
        private bool _standingRead;
        private bool _readingTrigger;
        private bool _readTriggerAgain;
        private bool _readingStanding;
        private bool _readStandingAgain;

        /// <summary>Bumped by every trigger read as it starts; only the latest one to start is kept.</summary>
        private int _triggerGeneration;

        /// <summary>Bumped by every standing read as it starts, and by every play and receipt.</summary>
        private int _standingGeneration;

        private void OnEnable()
        {
            StartCoroutine(Run());
        }

        private IEnumerator Run()
        {
            while (!TryRuntime(out _, out _))
            {
                yield return new WaitForSeconds(0.25f);
            }
            ReadTrigger();
            ReadStanding();

            var poll = new WaitForSecondsRealtime(TriggerPollSeconds);
            var sinceStanding = 0f;
            var wasOpen = Open;
            while (true)
            {
                yield return poll;
                ReadTrigger();
                sinceStanding += TriggerPollSeconds;
                if (sinceStanding >= StandingPollSeconds)
                {
                    sinceStanding = 0f;
                    ReadStanding();
                }
                // The window closes on its own without the trigger changing,
                // and the rows that read it have to hear that too.
                if (wasOpen != Open) Updated?.Invoke();
                wasOpen = Open;
            }
        }

        /// <summary>
        /// Plays once: a score from 1 to <see cref="MaximumScore"/>, submitted
        /// only when it beats the visitor's standing one. GS2 keeps the last
        /// score submitted rather than the best, so a lower one would take the
        /// visitor's place away. Returns what the page should say.
        /// </summary>
        public async Task<string> Play()
        {
            if (!TryRuntime(out var gs2, out var session)) return "Not signed in yet.";
            if (!HasValue) return "Still reading your standing; try again in a moment.";
            // Start contest runs on the server and nothing tells the page, so
            // the window is read again before a press is refused for it.
            if (!Open) await ReadTriggerOnce(gs2!, session!);
            if (!Open) return "Your contest is not open. Press Start contest first.";

            var score = UnityEngine.Random.Range(1, MaximumScore + 1);
            if (Best != null && score <= Best)
            {
                return $"You scored {score}. Your best of {Best} still stands.";
            }
            try
            {
                await gs2!.Ranking2.Namespace(RankingNamespace).GlobalRankingModel(RankingName)
                    .GlobalRankingSeason(Season, session!)
                    .PutGlobalRankingAsync(score);
            }
            catch (NotFoundException)
            {
                // GS2 refuses a score outside the window, and the window may
                // have closed since it was last read.
                ReadTrigger();
                return "Your contest has closed. Press Start contest to play again.";
            }
            if (this == null) return "";
            _standingGeneration++;
            Best = score;
            Updated?.Invoke();
            ReadStanding();
            return $"You scored {score}, a new best.";
        }

        /// <summary>
        /// Receives the reward for the visitor's rank. GS2 pays it only once
        /// their window has closed, only to a visitor who has played, and only
        /// once. Returns what the page should say.
        /// </summary>
        public async Task<string> Receive()
        {
            if (!TryRuntime(out var gs2, out var session)) return "Not signed in yet.";
            if (Open) await ReadTriggerOnce(gs2!, session!);
            if (Open) return "Your contest is still open. Finish it, or wait for it to end, to receive.";
            if (Best == null) return "Play at least once to receive a reward.";
            if (Received) return "You have already received this contest's reward.";
            try
            {
                var transaction = await gs2!.Ranking2.Namespace(RankingNamespace).GlobalRankingModel(RankingName)
                    .GlobalRankingSeason(Season, session!)
                    .GlobalRankingReceivedReward()
                    .ReceiveGlobalRankingRewardAsync(speculativeExecute: false);
                if (transaction != null) await transaction.WaitAsync(true);
            }
            catch (BadRequestException error) when (Refused(error, "alreadyReceived"))
            {
                _standingGeneration++;
                Received = true;
                Updated?.Invoke();
                return "You have already received this contest's reward.";
            }
            catch (BadRequestException error) when (Refused(error, "inSchedule"))
            {
                // This device's clock can run behind GS2's by a moment.
                ReadTrigger();
                return "Your contest has not quite closed yet; try again in a moment.";
            }
            if (this == null) return "";
            _standingGeneration++;
            Received = true;
            Updated?.Invoke();
            ReadStanding();
            return "Received the reward for your rank.";
        }

        /// <summary>Whether GS2 refused for the given reason.</summary>
        private static bool Refused(Gs2Exception error, string reason) =>
            error.Errors?.Any(detail => detail.message?.EndsWith("." + reason) == true) == true;

        /// <summary>
        /// Reads the contest trigger. One read is out at a time; asking during
        /// it makes one more when it returns, so an older answer cannot land
        /// last.
        /// </summary>
        private async void ReadTrigger()
        {
            if (!TryRuntime(out var gs2, out var session)) return;
            if (_readingTrigger)
            {
                _readTriggerAgain = true;
                return;
            }
            _readingTrigger = true;
            try
            {
                await ReadTriggerOnce(gs2!, session!);
            }
            finally
            {
                _readingTrigger = false;
                if (_readTriggerAgain && this != null)
                {
                    _readTriggerAgain = false;
                    ReadTrigger();
                }
            }
        }

        private async Task ReadTriggerOnce(Gs2Domain gs2, IGameSession session)
        {
            var generation = ++_triggerGeneration;
            long expiresAt;
            try
            {
                var result = await new Gs2ScheduleRestClient(gs2.Super.RestSession).GetTriggerAsync(
                    new GetTriggerRequest()
                        .WithNamespaceName(ScheduleNamespace)
                        .WithTriggerName(Trigger)
                        .WithAccessToken(session.AccessToken.Token));
                expiresAt = result?.Item?.ExpiresAt ?? 0;
            }
            catch (NotFoundException)
            {
                expiresAt = 0;
            }
            catch (Exception error)
            {
                Debug.LogError($"{nameof(RankingContestState)}: the contest trigger could not be read: {error}");
                return;
            }
            if (this == null || generation != _triggerGeneration) return;
            var changed = !_triggerRead || expiresAt != _triggerExpiresAt;
            _triggerRead = true;
            _triggerExpiresAt = expiresAt;
            if (changed) Updated?.Invoke();
        }

        /// <summary>
        /// Reads the visitor's score, their rank, the top of the board and
        /// whether they have received. One read is out at a time, as with the
        /// trigger.
        /// </summary>
        private async void ReadStanding()
        {
            if (!TryRuntime(out var gs2, out var session)) return;
            if (_readingStanding)
            {
                _readStandingAgain = true;
                return;
            }
            _readingStanding = true;
            try
            {
                await ReadStandingOnce(gs2!, session!);
            }
            catch (Exception error)
            {
                Debug.LogError($"{nameof(RankingContestState)}: the board could not be read: {error}");
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

        private async Task ReadStandingOnce(Gs2Domain gs2, IGameSession session)
        {
            var generation = ++_standingGeneration;
            var client = new Gs2Ranking2RestClient(gs2.Super.RestSession);
            var token = session.AccessToken.Token;

            // GS2 answers for a visitor who has not played too, with neither a
            // score nor a rank.
            var own = await client.GetGlobalRankingAsync(
                new GetGlobalRankingRequest()
                    .WithNamespaceName(RankingNamespace)
                    .WithRankingName(RankingName)
                    .WithSeason(Season)
                    .WithAccessToken(token));
            var best = own?.Item?.Score;
            var rank = own?.Item?.Rank;

            var board = await client.DescribeGlobalRankingsAsync(
                new DescribeGlobalRankingsRequest()
                    .WithNamespaceName(RankingNamespace)
                    .WithRankingName(RankingName)
                    .WithSeason(Season)
                    .WithLimit(BoardSize)
                    .WithAccessToken(token));

            // The season never moves on, so a receipt, once there, stays; and
            // a visitor who has not played has nothing to have received.
            var received = Received;
            if (!received && best != null)
            {
                try
                {
                    var receipt = await client.GetGlobalRankingReceivedRewardAsync(
                        new GetGlobalRankingReceivedRewardRequest()
                            .WithNamespaceName(RankingNamespace)
                            .WithRankingName(RankingName)
                            .WithSeason(Season)
                            .WithAccessToken(token));
                    received = receipt?.Item != null;
                }
                catch (NotFoundException)
                {
                }
            }

            if (this == null || generation != _standingGeneration) return;
            UserId = session.UserId;
            Best = best;
            Rank = rank;
            Board = board?.Items ?? Array.Empty<GlobalRankingData>();
            Received = received;
            _standingRead = true;
            Updated?.Invoke();
        }

        internal static bool TryRuntime(out Gs2Domain? gs2, out IGameSession? session)
        {
            gs2 = null;
            session = null;
            var runtime = FindAnyObjectByType<GS2Studio.Generated.Runtime.Gs2HolderRuntimeContextProvider>();
            return runtime != null && runtime.TryGet(out gs2, out session) && gs2 != null && session != null;
        }
    }
}
