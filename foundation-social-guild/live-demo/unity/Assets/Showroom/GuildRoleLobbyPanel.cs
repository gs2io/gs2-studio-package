// The guild lobby: founding, finding and joining a guild, answering join
// requests, and leaving, handing over or disbanding.
//
// A row of the page reads one value or makes one press, and a lobby is a
// search, a form and a guild's worth of members, so this draws its own region.
// None of it is an action a package can host.
//
// Reads go through the REST client every few seconds and are shown as they
// are. Writes go through the SDK's domain, so the cache hears them: the
// generated rows of the guilds the visitor belongs to update from there.
// Nothing here reloads or invalidates anything.
//
// Answering requests, handing over and disbanding are done as the guild: the
// master assumes the guild, and GS2 lets the guild token do only what the
// master role's policy allows.
#nullable enable

using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

using UnityEngine;
using UnityEngine.UI;

using Gs2.Core.Exception;
using Gs2.Gs2Guild;
using Gs2.Gs2Guild.Model;
using Gs2.Gs2Guild.Request;
using Gs2.Unity.Core;
using Gs2.Unity.Util;

using GuildModel = Gs2.Gs2Guild.Model.Guild;
using AuthAccessToken = Gs2.Gs2Auth.Model.AccessToken;

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

        private const float PollSeconds = 5f;
        private const int SearchLimit = 10;
        private const int NameLimit = 64;

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
        private int _generation;
        private Coroutine? _polling;
        private ShowroomPage? _page;

        /// <summary>What the last read found; redrawn whole each time.</summary>
        private GuildModel? _guild;
        private GuildModel[] _found = Array.Empty<GuildModel>();
        private SendMemberRequest[] _sent = Array.Empty<SendMemberRequest>();
        private ReceiveMemberRequest[] _received = Array.Empty<ReceiveMemberRequest>();
        private string _userId = "";
        private bool _read;

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
            _polling = StartCoroutine(Poll());
        }

        private void OnDisable()
        {
            if (_polling != null) StopCoroutine(_polling);
            _polling = null;
        }

        private IEnumerator Poll()
        {
            while (!TryRuntime(out _, out _))
            {
                yield return new WaitForSeconds(0.25f);
            }
            var wait = new WaitForSecondsRealtime(PollSeconds);
            while (true)
            {
                Read();
                yield return wait;
            }
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
        // Reading

        /// <summary>
        /// Reads the visitor's guild, or the guilds they can join and the
        /// requests they sent; for a master, the requests the guild received.
        /// Only the latest read to start is drawn.
        /// </summary>
        private async void Read()
        {
            if (!TryRuntime(out var gs2, out var session)) return;
            var generation = ++_generation;
            var client = new Gs2GuildRestClient(gs2!.Super.RestSession);
            var token = session!.AccessToken.Token;
            try
            {
                var joined = await client.DescribeJoinedGuildsAsync(new DescribeJoinedGuildsRequest()
                    .WithNamespaceName(GuildNamespace)
                    .WithGuildModelName(GuildKind)
                    .WithAccessToken(token));
                var membership = joined?.Items?.FirstOrDefault();

                GuildModel? guild = null;
                var found = Array.Empty<GuildModel>();
                var sent = Array.Empty<SendMemberRequest>();
                var received = Array.Empty<ReceiveMemberRequest>();
                if (membership != null)
                {
                    guild = (await client.GetGuildAsync(new GetGuildRequest()
                        .WithNamespaceName(GuildNamespace)
                        .WithGuildModelName(GuildKind)
                        .WithGuildName(membership.GuildName)
                        .WithAccessToken(token)))?.Item;
                    if (guild == null)
                    {
                        // Drawing the lobby here would invite a member to found
                        // or join another guild.
                        ReadFailed("Your guild could not be read.");
                        return;
                    }
                    if (RoleOf(guild, session.UserId) == MasterRole)
                    {
                        received = await ReceivedRequests(client, token, guild.Name);
                    }
                    else
                    {
                        // A master's token must not outlive the role.
                        _guildToken = null;
                    }
                }
                else
                {
                    found = (await client.SearchGuildsAsync(new SearchGuildsRequest()
                        .WithNamespaceName(GuildNamespace)
                        .WithGuildModelName(GuildKind)
                        .WithIncludeFullMembersGuild(false)
                        .WithOrderBy("last_updated")
                        .WithLimit(SearchLimit)
                        .WithAccessToken(token)))?.Items ?? Array.Empty<GuildModel>();
                    sent = (await client.DescribeSendRequestsAsync(new DescribeSendRequestsRequest()
                        .WithNamespaceName(GuildNamespace)
                        .WithGuildModelName(GuildKind)
                        .WithAccessToken(token)))?.Items ?? Array.Empty<SendMemberRequest>();
                }

                if (this == null || generation != _generation) return;
                _userId = session.UserId;
                _guild = guild;
                _found = found;
                _sent = sent;
                _received = received;
                _read = true;
                _readFailure = null;
                Draw();
            }
            catch (Exception error)
            {
                Debug.LogError($"{nameof(GuildRoleLobbyPanel)}: the guilds could not be read: {error}");
                ReadFailed($"The guilds could not be read: {error.Message}");
            }
        }

        /// <summary>
        /// The requests the master's guild received. A failure here is said on
        /// the page and leaves the rest of the guild drawn.
        /// </summary>
        private async Task<ReceiveMemberRequest[]> ReceivedRequests(Gs2GuildRestClient client, string token, string guildName)
        {
            try
            {
                var guildToken = await GuildToken(client, token, guildName);
                return (await client.DescribeReceiveRequestsAsync(new DescribeReceiveRequestsRequest()
                    .WithNamespaceName(GuildNamespace)
                    .WithGuildModelName(GuildKind)
                    .WithAccessToken(guildToken.Token)))?.Items ?? Array.Empty<ReceiveMemberRequest>();
            }
            catch (Exception error)
            {
                Debug.LogError($"{nameof(GuildRoleLobbyPanel)}: the join requests could not be read: {error}");
                _guildToken = null;
                ReadFailed($"The requests to join could not be read: {error.Message}");
                return Array.Empty<ReceiveMemberRequest>();
            }
        }

        /// <summary>
        /// Says a failed read on the page once; the same failure on every
        /// later poll stays quiet until a read succeeds.
        /// </summary>
        private void ReadFailed(string message)
        {
            if (this == null || message == _readFailure) return;
            _readFailure = message;
            Log(message);
        }

        /// <summary>
        /// The token to act as the guild, assumed again when it has run out
        /// or belongs to another guild.
        /// </summary>
        private async Task<AuthAccessToken> GuildToken(Gs2GuildRestClient client, string token, string guildName)
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (_guildToken != null && _guildToken.UserId == guildName && (_guildToken.Expire ?? 0) > now + 60_000)
            {
                return _guildToken;
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

        // ------------------------------------------------------------------
        // Drawing

        private void Draw()
        {
            if (_body == null || _nameField == null || !_read) return;
            Clear(_body);
            if (_guild != null)
            {
                _nameField.gameObject.SetActive(false);
                DrawGuild(_guild);
            }
            else
            {
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
            Press(_body!, "Found a guild with this name", Found);

            Caption(_body!, "Guilds you can join", 15, MutedText);
            if (_found.Length == 0) Caption(_body!, "No guild has room right now. Found one.", 15, MutedText);
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

        private void Found()
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
                return $"Founded {name}.";
            });
        }

        private void Join(string guildName, bool approval) =>
            Run(async (gs2, session) =>
            {
                await gs2.Super.Guild.Namespace(GuildNamespace).AccessToken(session.AccessToken)
                    .SendRequestAsync(new SendRequestRequest()
                        .WithGuildModelName(GuildKind)
                        .WithTargetGuildName(guildName));
                return approval ? "Asked to join; the master decides." : "Joined the guild.";
            });

        private void CancelRequest(string guildName) =>
            Run(async (gs2, session) =>
            {
                await gs2.Super.Guild.Namespace(GuildNamespace).AccessToken(session.AccessToken)
                    .DeleteAsync(new DeleteRequestRequest()
                        .WithGuildModelName(GuildKind)
                        .WithTargetGuildName(guildName));
                return "Cancelled the request.";
            });

        private void Leave(string guildName) =>
            Run(async (gs2, session) =>
            {
                await gs2.Super.Guild.Namespace(GuildNamespace).AccessToken(session.AccessToken)
                    .JoinedGuild(GuildKind, guildName)
                    .WithdrawalAsync(new WithdrawalRequest());
                return "Left the guild.";
            });

        private void Answer(string guildName, string fromUserId, bool accept) =>
            Run(async (gs2, session) =>
            {
                var guild = await AsGuild(gs2, session, guildName);
                var request = guild.ReceiveMemberRequest(fromUserId);
                if (accept) await request.AcceptAsync(new AcceptRequestRequest());
                else await request.RejectAsync(new RejectRequestRequest());
                return accept ? $"Accepted {Tag(fromUserId)}." : $"Declined {Tag(fromUserId)}.";
            });

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
            });

        private void Disband(string guildName) =>
            Run(async (gs2, session) =>
            {
                var guild = await AsGuild(gs2, session, guildName);
                await guild.DeleteAsync(new DeleteGuildRequest());
                _guildToken = null;
                return "Disbanded the guild.";
            });

        /// <summary>The SDK's domain for acting as the visitor's guild.</summary>
        private async Task<Gs2.Gs2Guild.Domain.Model.GuildAccessTokenDomain> AsGuild(Gs2Domain gs2, IGameSession session, string? guildName)
        {
            if (guildName == null) throw new InvalidOperationException("Not in a guild.");
            var token = await GuildToken(new Gs2GuildRestClient(gs2.Super.RestSession), session.AccessToken.Token, guildName);
            return gs2.Super.Guild.Namespace(GuildNamespace).GuildAccessToken(GuildKind, token);
        }

        /// <summary>Runs one press, one at a time, and reads again after it.</summary>
        private async void Run(Func<Gs2Domain, IGameSession, Task<string>> press)
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
                if (this != null) Log(Explain(error));
            }
            catch (Exception error)
            {
                if (this != null) Log($"Failed: {error.Message}");
            }
            finally
            {
                _busy = false;
            }
            if (this != null) Read();
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
