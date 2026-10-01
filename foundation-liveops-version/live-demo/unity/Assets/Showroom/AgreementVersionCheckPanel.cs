// The version check, pressed by hand: answering the agreements, picking the
// versions the client reports, and checking.
//
// A row of the page reads one value or makes one press, and a version check
// is several presses and a verdict per version, so this draws its own region.
// Answering and checking are not actions a package can host, so every press
// goes straight to GS2 through the REST client, and so do the reads of what
// the visitor has answered. Nothing here reloads or invalidates anything.
// Every press runs through `ShowroomPress`, so it waits its turn with every
// other press on the page and says its outcome in one line.
//
// The check sends the app and asset versions together every time: GS2 refuses
// a check that leaves out any version the client is meant to report.
#nullable enable

using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

using UnityEngine;
using UnityEngine.UI;

using Gs2.Core.Exception;
using Gs2.Gs2Version;
using Gs2.Gs2Version.Model;
using Gs2.Gs2Version.Request;

using VersionStatus = Gs2.Gs2Version.Model.Status;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>Draws the version check into the region the page gives it.</summary>
    [AddComponentMenu("GS2 Studio/Showroom/Version Check")]
    public sealed class AgreementVersionCheckPanel : MonoBehaviour
    {
        /// <summary>The version namespace the feature package deploys.</summary>
        private const string VersionNamespace = "Version";

        /// <summary>The agreements, as the demo package names them.</summary>
        private const string Terms = "terms";
        private const string Marketing = "marketing";

        /// <summary>The versions the client reports, as the demo package names them.</summary>
        private const string App = "app";
        private const string Asset = "asset";

        /// <summary>
        /// The versions a visitor can claim for each, one below the refusal,
        /// one at the warning and one above it.
        /// </summary>
        private static readonly (int, int, int)[] AppChoices = { (1, 0, 0), (1, 1, 0), (1, 2, 0) };
        private static readonly (int, int, int)[] AssetChoices = { (0, 9, 0), (1, 5, 0), (2, 1, 0) };

        /// <summary>The terms versions a visitor can accept: an old one, and the latest.</summary>
        private static readonly (int, int, int) OldTerms = (1, 0, 0);
        private static readonly (int, int, int) LatestTerms = (2, 0, 0);

        private static readonly Color MutedText = new Color(0.643f, 0.616f, 0.729f, 1f);
        private static readonly Color LightText = new Color(0.922f, 0.91f, 0.949f, 1f);

        [SerializeField] private RectTransform? _panel;
        [SerializeField] private Button? _buttonTemplate;
        [SerializeField] private Font? _font;

        private Text? _answers;
        private Text? _verdict;
        private Button? _appButton;
        private Button? _assetButton;
        private readonly List<Button> _buttons = new List<Button>();
        /// <summary>Bumped by every read of the answers as it starts; only the latest one to start is shown.</summary>
        private int _answersGeneration;
        private int _app;
        private int _asset;
        private Coroutine? _waiting;

        private void OnEnable()
        {
            if (_panel == null || _buttonTemplate == null || _font == null)
            {
                ShowroomLog.Say("The version check was baked without its region, button or font.");
                return;
            }
            if (_answers == null) Build();
            _waiting = StartCoroutine(WaitForSignIn());
        }

        private void OnDisable()
        {
            if (_waiting != null) StopCoroutine(_waiting);
            _waiting = null;
        }

        /// <summary>
        /// The page signs in after it starts, and nothing announces it, so the
        /// panel asks until the session is there.
        /// </summary>
        private IEnumerator WaitForSignIn()
        {
            while (!ShowroomRuntime.TryGet(out _, out _))
            {
                yield return new WaitForSeconds(0.25f);
            }
            _waiting = null;
            ReadAnswers();
        }

        private void Build()
        {
            Caption("Your answers", 15, MutedText);
            _answers = Caption("Reading your answers...", 17, LightText);
            Press($"Accept terms {Format(OldTerms)} (an old version)", () => Answer(Terms, true, OldTerms));
            Press($"Accept terms {Format(LatestTerms)} (the latest)", () => Answer(Terms, true, LatestTerms));
            Press("Accept marketing", () => Answer(Marketing, true, null));
            Press("Reject marketing", () => Answer(Marketing, false, null));
            Press("Clear my answers", Clear);

            Caption("What the client reports", 15, MutedText);
            _appButton = Press("", () => { _app = (_app + 1) % AppChoices.Length; ShowChoices(); });
            _assetButton = Press("", () => { _asset = (_asset + 1) % AssetChoices.Length; ShowChoices(); });
            ShowChoices();

            Press("Check versions", Check);
            _verdict = Caption("Press Check versions to see the verdict.", 17, LightText);
        }

        private void ShowChoices()
        {
            SetLabel(_appButton, $"App version {Format(AppChoices[_app])} (press to change)");
            SetLabel(_assetButton, $"Asset version {Format(AssetChoices[_asset])} (press to change)");
        }

        /// <summary>Accepts or rejects one agreement; a null version means the latest.</summary>
        private void Answer(string agreement, bool accept, (int, int, int)? version) =>
            Run(async (client, token) =>
            {
                var target = version is { } v ? ToVersion(v) : null;
                if (accept)
                {
                    await client.AcceptAsync(new AcceptRequest()
                        .WithNamespaceName(VersionNamespace)
                        .WithVersionName(agreement)
                        .WithVersion(target)
                        .WithAccessToken(token));
                    return version is { } accepted
                        ? $"Accepted {agreement} {Format(accepted)}."
                        : $"Accepted {agreement}.";
                }
                await client.RejectAsync(new RejectRequest()
                    .WithNamespaceName(VersionNamespace)
                    .WithVersionName(agreement)
                    .WithVersion(target)
                    .WithAccessToken(token));
                return $"Rejected {agreement}.";
            }, "answering an agreement", readAfter: true);

        /// <summary>Deletes both answers, so the visitor starts over unanswered.</summary>
        private void Clear() =>
            Run(async (client, token) =>
            {
                foreach (var agreement in new[] { Terms, Marketing })
                {
                    try
                    {
                        await client.DeleteAcceptVersionAsync(new DeleteAcceptVersionRequest()
                            .WithNamespaceName(VersionNamespace)
                            .WithVersionName(agreement)
                            .WithAccessToken(token));
                    }
                    catch (NotFoundException)
                    {
                        // Never answered: nothing to clear.
                    }
                }
                return "Cleared your answers.";
            }, "clearing your answers", readAfter: true);

        /// <summary>
        /// Checks every version at once and shows the verdict for each. GS2
        /// issues a project token only when nothing is an error.
        /// </summary>
        private void Check()
        {
            var started = Run(async (client, token) =>
            {
                var result = await client.CheckVersionAsync(new CheckVersionRequest()
                    .WithNamespaceName(VersionNamespace)
                    .WithTargetVersions(new[]
                    {
                        new TargetVersion().WithVersionName(App).WithVersion(ToVersion(AppChoices[_app])),
                        new TargetVersion().WithVersionName(Asset).WithVersion(ToVersion(AssetChoices[_asset])),
                    })
                    .WithAccessToken(token));
                var errors = Names(result?.Errors);
                var warnings = Names(result?.Warnings);
                var lines = new[] { Terms, Marketing, App, Asset }.Select(name =>
                    $"{name}: " + (errors.Contains(name) ? "error" : warnings.Contains(name) ? "warning" : "ok"));
                var passed = !string.IsNullOrEmpty(result?.ProjectToken);
                if (_verdict != null)
                {
                    _verdict.text = string.Join("\n", lines) + "\n" + (passed
                        ? "Passed: GS2 issued a project token."
                        : "Not passed: no project token.");
                }
                return passed ? "The version check passed." : "The version check did not pass.";
            }, "the version check", readAfter: false, onFailed: () =>
            {
                if (_verdict != null) _verdict.text = "The check failed; see the log below.";
            });
            if (started && _verdict != null) _verdict.text = "Checking...";
        }

        private static HashSet<string> Names(VersionStatus[]? statuses) =>
            new HashSet<string>((statuses ?? Array.Empty<VersionStatus>())
                .Select(status => status.VersionModel?.Name ?? "")
                .Where(name => name.Length > 0));

        /// <summary>Reads what the visitor has answered, for the answers line.</summary>
        private async void ReadAnswers()
        {
            if (!ShowroomRuntime.TryGet(out var gs2, out var session)) return;
            var generation = ++_answersGeneration;
            AcceptVersion[] items;
            try
            {
                var result = await new Gs2VersionRestClient(gs2.Super.RestSession).DescribeAcceptVersionsAsync(
                    new DescribeAcceptVersionsRequest()
                        .WithNamespaceName(VersionNamespace)
                        .WithAccessToken(session.AccessToken.Token));
                items = result?.Items ?? Array.Empty<AcceptVersion>();
            }
            catch (Exception error)
            {
                if (this != null && generation == _answersGeneration) ShowroomLog.Failure("Your answers could not be read", error);
                return;
            }
            if (this == null || _answers == null || generation != _answersGeneration) return;
            _answers.text = string.Join("\n", new[] { Terms, Marketing }.Select(name =>
            {
                var item = items.FirstOrDefault(entry => entry.VersionName == name);
                if (item == null) return $"{name}: not answered";
                var verb = item.Status == "reject" ? "rejected" : "accepted";
                return $"{name}: {verb} {Format(item.Version)}";
            }));
        }

        /// <summary>
        /// Runs one press through `ShowroomPress`, with the page's buttons off
        /// while it is out. <paramref name="onFailed"/> runs when the press
        /// threw; <paramref name="readAfter"/> reads the answers again once it
        /// is over (a REST read, which no SDK cache holds). Returns whether the
        /// press started.
        /// </summary>
        private bool Run(
            Func<Gs2VersionRestClient, string, Task<string>> press,
            string name,
            bool readAfter,
            Action? onFailed = null)
        {
            var succeeded = false;
            SetInteractable(false);
            var started = ShowroomPress.Run(new ShowroomPressOptions
            {
                Name = name,
                Owner = this,
                Explain = error => $"GS2 refused {name}: {ShowroomErrors.Describe(error)}",
                Afterward = () =>
                {
                    SetInteractable(true);
                    if (!succeeded) onFailed?.Invoke();
                    if (readAfter) ReadAnswers();
                },
            }, async (gs2, session) =>
            {
                var message = await press(new Gs2VersionRestClient(gs2.Super.RestSession), session.AccessToken.Token);
                succeeded = true;
                return message;
            });
            if (!started) SetInteractable(true);
            return started;
        }

        private static Version_ ToVersion((int, int, int) value) =>
            new Version_().WithMajor(value.Item1).WithMinor(value.Item2).WithMicro(value.Item3);

        private static string Format((int, int, int) value) => $"{value.Item1}.{value.Item2}.{value.Item3}";

        private static string Format(Version_? value) =>
            value == null ? "?" : $"{value.Major ?? 0}.{value.Minor ?? 0}.{value.Micro ?? 0}";

        private Button Press(string text, Action onClick)
        {
            var button = Instantiate(_buttonTemplate!, _panel!);
            button.name = "Press";
            SetLabel(button, text);
            button.onClick.RemoveAllListeners();
            button.onClick.AddListener(() => onClick());
            _buttons.Add(button);
            return button;
        }

        private static void SetLabel(Button? button, string text)
        {
            var label = button != null ? button.GetComponentInChildren<Text>() : null;
            if (label != null) label.text = text;
        }

        private void SetInteractable(bool interactable)
        {
            foreach (var button in _buttons) button.interactable = interactable;
        }

        private Text Caption(string text, int size, Color color)
        {
            var caption = new GameObject("Caption", typeof(RectTransform)).GetComponent<RectTransform>();
            caption.SetParent(_panel, false);
            var label = caption.gameObject.AddComponent<Text>();
            label.font = _font;
            label.fontSize = size;
            label.color = color;
            label.text = text;
            caption.gameObject.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            caption.gameObject.AddComponent<LayoutElement>().minHeight = 24;
            return label;
        }
    }
}
