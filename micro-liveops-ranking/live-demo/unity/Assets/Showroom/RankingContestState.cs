#nullable enable

using System;
using System.Collections;
using System.Collections.Generic;
using System.Threading.Tasks;

using UnityEngine;

using Gs2.Core.Exception;
using Gs2.Gs2Ranking2;
using Gs2.Gs2Ranking2.Exception;
using Gs2.Gs2Ranking2.Model;
using Gs2.Gs2Ranking2.Request;
using Gs2.Gs2Schedule;
using Gs2.Gs2Schedule.Request;
using Gs2.Unity.Core;
using Gs2.Unity.Util;

using GS2Studio.Generated.RankingContest.UI;

namespace GS2Studio.Showroom.Demo
{
    // Share one polling state across rows so each label does not start its own network loop.
    internal sealed class RankingContestState : MonoBehaviour
    {
        private const string RankingNamespace = "Ranking";
        private const string RankingName = "contest";

        // All players compare in season 0 because this demo's relative window uses an always repeat.
        private const long Season = 0;

        private const string ScheduleNamespace = "Schedule";
        private const string Trigger = "ranking-contest";

        public const int MaximumScore = 1000;

        public const int BoardSize = 10;

        // Periodic reads also detect trigger changes made by another page using the same account.
        private const float TriggerBackstopSeconds = 60f;

        // Exchange completion and trigger visibility can differ; use a short bounded burst of reads after a press.
        private const float PressReadSeconds = 2f;
        private const int PressReads = 2;

        private const float StandingPollSeconds = 60f;

        private static RankingContestState? _instance;

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

        public event Action? Updated;

        // Do not render unread data or an unadjusted deadline as settled contest state.
        public bool HasValue => _triggerRead && _standingRead && DemoTimeOffset.Has(UserId);

        public bool Open => EndsAt != null;

        // Account time can advance independently of this device; normalize its deadline before local clock comparisons.
        public DateTime? EndsAt
        {
            get
            {
                if (_triggerExpiresAt <= 0) return null;
                if (!DemoTimeOffset.TryGet(UserId, out var offset)) return null;
                var ends = DateTimeOffset.FromUnixTimeMilliseconds(_triggerExpiresAt).UtcDateTime
                    .AddSeconds(-offset);
                return ends > DateTime.UtcNow ? ends : null;
            }
        }

        public long? Best { get; private set; }

        public int? Rank { get; private set; }

        public GlobalRankingData[] Board { get; private set; } = Array.Empty<GlobalRankingData>();

        public bool Received { get; private set; }

        public string UserId { get; private set; } = "";

        private long _triggerExpiresAt;
        private bool _triggerRead;
        private bool _standingRead;
        private bool _readingTrigger;
        private bool _readTriggerAgain;
        private bool _readingStanding;
        private bool _readStandingAgain;

        // Presses also call ReadTriggerOnce directly; reject older replies even when they bypass the scheduled-read guard.
        private int _triggerGeneration;

        // A pre-press read must not undo a new score or reward state when its response arrives.
        private int _standingGeneration;

        private float _nextTriggerRead;

        private int _pressReadsLeft;

        // Polling may repeat one failure; report it once until a successful read clears the latch.
        private readonly ShowroomLatch _triggerFailures = new ShowroomLatch();
        private readonly ShowroomLatch _standingFailures = new ShowroomLatch();

        private readonly List<UnityEngine.Events.UnityEvent> _pressEvents = new List<UnityEngine.Events.UnityEvent>();

        private void OnEnable()
        {
            DemoTimeOffset.Loaded += OnOffsetLoaded;
            StartCoroutine(Run());
        }

        private void OnDisable()
        {
            DemoTimeOffset.Loaded -= OnOffsetLoaded;
            foreach (var pressed in _pressEvents) pressed.RemoveListener(OnPressed);
            _pressEvents.Clear();
        }

        private IEnumerator Run()
        {
            IGameSession? session;
            while (!ShowroomRuntime.TryGet(out _, out session))
            {
                yield return new WaitForSeconds(0.25f);
            }
            UserId = session.UserId;
            ListenToPresses();
            DemoTimeOffset.TryGet(UserId, out _);
            ReadTrigger();
            ReadStanding();

            var tick = new WaitForSecondsRealtime(1f);
            var nextStandingRead = Time.realtimeSinceStartup + StandingPollSeconds;
            var wasOpen = Open;
            while (true)
            {
                yield return tick;
                var now = Time.realtimeSinceStartup;
                if (now >= _nextTriggerRead) ReadTrigger();
                if (now >= nextStandingRead)
                {
                    nextStandingRead = now + StandingPollSeconds;
                    ReadStanding();
                }
                // Clock expiry can close the contest without a new trigger value; subscribers still need that transition.
                if (wasOpen != Open) Updated?.Invoke();
                wasOpen = Open;
            }
        }

        private void ListenToPresses()
        {
            foreach (var button in FindObjectsByType<RankingContestStartContestButton>(
                         FindObjectsInactive.Include, FindObjectsSortMode.None))
            {
                Listen(button.OnCompleted);
            }
            foreach (var button in FindObjectsByType<RankingContestFinishContestButton>(
                         FindObjectsInactive.Include, FindObjectsSortMode.None))
            {
                Listen(button.OnCompleted);
            }
        }

        private void Listen(UnityEngine.Events.UnityEvent pressed)
        {
            pressed.AddListener(OnPressed);
            _pressEvents.Add(pressed);
        }

        private void OnPressed()
        {
            _pressReadsLeft = PressReads;
            ReadTrigger();
        }

        private void OnOffsetLoaded(string userId)
        {
            if (userId == UserId) Updated?.Invoke();
        }

        // This demo retains the best score, but its ranking replaces submissions; do not submit a lower roll.
        public async Task<string> Play()
        {
            if (!ShowroomRuntime.TryGet(out var gs2, out var session)) return "Not signed in yet.";
            if (!HasValue) return "Still reading your standing; try again in a moment.";
            // A server-side start may not be reflected locally yet; reread before rejecting the press as closed.
            if (!Open) await ReadTriggerOnce(gs2, session);
            if (!Open) return "Your contest is not open. Press Start contest first.";

            var score = UnityEngine.Random.Range(1, MaximumScore + 1);
            if (Best != null && score <= Best)
            {
                return $"You scored {score}. Your best of {Best} still stands.";
            }
            try
            {
                await gs2.Ranking2.Namespace(RankingNamespace).GlobalRankingModel(RankingName)
                    .GlobalRankingSeason(Season, session)
                    .PutGlobalRankingAsync(score);
            }
            catch (NotFoundException)
            {
                // The submission can outlast the local open-window check; refresh the trigger after a server refusal.
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

        public async Task<string> Receive()
        {
            if (!ShowroomRuntime.TryGet(out var gs2, out var session)) return "Not signed in yet.";
            if (!HasValue) return "Still reading your standing; try again in a moment.";
            if (Open) await ReadTriggerOnce(gs2, session);
            if (Open) return "Your contest is still open. Finish it, or wait for it to end, to receive.";
            if (Best == null) return "Play at least once to receive a reward.";
            if (Received) return "You have already received this contest's reward.";
            try
            {
                var transaction = await gs2.Ranking2.Namespace(RankingNamespace).GlobalRankingModel(RankingName)
                    .GlobalRankingSeason(Season, session)
                    .GlobalRankingReceivedReward()
                    .ReceiveGlobalRankingRewardAsync(speculativeExecute: false);
                if (transaction != null) await transaction.WaitAsync(true);
            }
            catch (RewardAlreadyReceivedException)
            {
                _standingGeneration++;
                Received = true;
                Updated?.Invoke();
                return "You have already received this contest's reward.";
            }
            catch (SeasonNotEndedException)
            {
                // Local clock comparison is not server authorization; refresh after a season-not-ended refusal.
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

        // Coalesce scheduled trigger reads; direct press-time reads remain protected by the generation check.
        private async void ReadTrigger()
        {
            if (!ShowroomRuntime.TryGet(out var gs2, out var session)) return;
            if (_readingTrigger)
            {
                _readTriggerAgain = true;
                return;
            }
            _readingTrigger = true;
            try
            {
                await ReadTriggerOnce(gs2, session);
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
            // Schedule the next attempt before awaiting REST so failures are rate-limited too.
            if (_pressReadsLeft > 0)
            {
                _pressReadsLeft--;
                _nextTriggerRead = Time.realtimeSinceStartup + PressReadSeconds;
            }
            else
            {
                _nextTriggerRead = Time.realtimeSinceStartup + TriggerBackstopSeconds;
            }
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
                // A missing trigger means no active window; treat it as contest state rather than a transport failure.
                expiresAt = 0;
            }
            catch (Exception error)
            {
                if (this != null) _triggerFailures.Fail("The contest trigger could not be read", error);
                return;
            }
            if (this == null) return;
            _triggerFailures.Succeeded();
            if (generation != _triggerGeneration) return;
            var moved = _triggerRead && expiresAt != _triggerExpiresAt;
            var changed = !_triggerRead || moved;
            _triggerRead = true;
            _triggerExpiresAt = expiresAt;
            if (moved)
            {
                // An observed trigger change ends the short polling burst; resume the periodic backstop.
                _pressReadsLeft = 0;
                _nextTriggerRead = Time.realtimeSinceStartup + TriggerBackstopSeconds;
            }
            if (changed) Updated?.Invoke();
        }

        // A press can request refresh during a REST batch; queue one follow-up instead of overlapping more batches.
        private async void ReadStanding()
        {
            if (!ShowroomRuntime.TryGet(out var gs2, out var session)) return;
            if (_readingStanding)
            {
                _readStandingAgain = true;
                return;
            }
            _readingStanding = true;
            try
            {
                await ReadStandingOnce(gs2, session);
                if (this != null) _standingFailures.Succeeded();
            }
            catch (Exception error)
            {
                if (this != null) _standingFailures.Fail("The board could not be read", error);
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

            // Season 0 is fixed for this demo, so keep a confirmed receipt across board refreshes instead of rereading it.
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
    }
}
