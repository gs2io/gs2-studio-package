// The transfer page's own region: which account this browser is, issuing a
// transfer code for it, and taking over another browser's account with that
// browser's code.
//
// A transfer code is an ID and a password registered under the take-over type
// the feature package reserves for it. The page makes both at random: GS2
// keeps an ID unique across the namespace (another player's ID is refused),
// and it stores only a hash of the password, so the password is shown once,
// right after issuing, and never again. It is never logged or saved.
//
// Taking over asks GS2 for the account the code belongs to. It needs no
// session: it is how a browser that is not that account yet signs in as it.
// The account is then remembered where every showroom demo on this site reads
// it, and the page reloads, so every binder starts over signed in as that
// account. The other demos opened in this browser sign in as it too.
//
// Whether this account has a code is watched in the SDK's cache, which the
// SDK's own writes update, so the panel hears an issue or a delete without
// asking GS2 again. What the SDK reports reaches the panel through its
// `ShowroomInbox`, drained in `Update`.
//
// Every press here carries a password or its result, so its failures are
// reported by kind and GS2's codes only (`ShowroomPressOptions.Redact`).
#nullable enable

using System;
using System.Collections;
using System.Threading.Tasks;

using UnityEngine;
using UnityEngine.UI;

using Gs2.Core.Exception;
using Gs2.Unity.Core;
using Gs2.Unity.Util;

using TakeOverDomain = Gs2.Unity.Gs2Account.Domain.Model.EzTakeOverGameSessionDomain;
using EzTakeOver = Gs2.Unity.Gs2Account.Model.EzTakeOver;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>Draws the account tag, transfer code issuing and taking over into the region the page gives it.</summary>
    [AddComponentMenu("GS2 Studio/Showroom/Transfer Code")]
    public sealed class TransferCodePanel : MonoBehaviour
    {
        /// <summary>How often a watch that failed to start is tried again.</summary>
        private const float TickSeconds = 30f;

        /// <summary>How long the page shows the outcome of a take-over before it reloads.</summary>
        private const float ReloadDelaySeconds = 1.5f;

        private static readonly Color RowColor = new Color(0.16f, 0.15f, 0.22f, 1f);
        private static readonly Color LightText = new Color(0.922f, 0.91f, 0.949f, 1f);
        private static readonly Color MutedText = new Color(0.643f, 0.616f, 0.729f, 1f);

        [SerializeField] private RectTransform? _panel;
        [SerializeField] private Button? _buttonTemplate;
        [SerializeField] private Font? _font;

        private Text? _accountText;
        private Text? _issueLabel;
        private InputField? _issuedIdField;
        private InputField? _issuedPasswordField;
        private InputField? _takeIdField;
        private InputField? _takePasswordField;
        private Coroutine? _signingIn;

        /// <summary>The panel's Copy or Paste, until the browser answers.</summary>
        private readonly ShowroomClipboardRequest _clipboard = new ShowroomClipboardRequest();

        /// <summary>The signed-in account, set once signed in.</summary>
        private string _userId = "";
        private TakeOverDomain? _code;

        /// <summary>
        /// Whether this account has a transfer code; null until the SDK has
        /// said. The one button issues or replaces by it.
        /// </summary>
        private bool? _registered;

        /// <summary>What the SDK said, handed over to the main thread.</summary>
        private readonly ShowroomInbox _inbox = new ShowroomInbox();
        private readonly ShowroomWatch _watch;
        private float _nextTick;
        private bool _reloading;

        public TransferCodePanel()
        {
            _watch = new ShowroomWatch(_inbox, ShowroomWatch.RereadFailure.Keep, "your transfer code");
        }

        private void OnEnable()
        {
            if (_panel == null || _buttonTemplate == null || _font == null)
            {
                ShowroomLog.Say("The transfer panel was baked without its region, button or font.");
                return;
            }
            if (_accountText == null) Build();
            _signingIn = StartCoroutine(WaitForSignIn());
        }

        private void OnDisable()
        {
            if (_signingIn != null) StopCoroutine(_signingIn);
            _signingIn = null;
            StopWatching();
            _clipboard.Abandon();
            ForgetIssued();
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
            var panel = _panel!;
            _accountText = Caption(panel, "Signing in...", 18, LightText);
            Caption(panel,
                "Every showroom demo on this site signs in as the account this browser remembers. " +
                "Issue a transfer code here, then use it in another browser to sign in there as this account.", 14, MutedText);

            Caption(panel, "Issue a transfer code", 15, MutedText);
            _issueLabel = Press(panel, "Issue a transfer code", IssueOrReissue);
            _issuedIdField = Field(panel, "IssuedId", "Your transfer ID shows here", 32);
            _issuedIdField.readOnly = true;
            _issuedPasswordField = Field(panel, "IssuedPassword", "Its password shows here, once", 32);
            _issuedPasswordField.readOnly = true;
            Press(panel, "Copy the ID and password", CopyCode);
            Caption(panel,
                "GS2 keeps only a hash of the password, so it is shown this once and never again. " +
                "Copy it now; if it is lost, delete and reissue.", 13, MutedText);

            Caption(panel, "Take over another browser's account", 15, MutedText);
            _takeIdField = Field(panel, "TakeId", "Transfer ID, like demo-XXXX-XXXX", 64);
            _takePasswordField = Field(panel, "TakePassword", "Password, like XXXX-XXXX-XXXX-XXXX", 64);
            _takePasswordField.contentType = InputField.ContentType.Password;
            Press(panel, "Paste the ID and password", Paste);
            Press(panel, "Take over that account", TakeOver);
            Caption(panel,
                "Taking over replaces the account this browser remembers, and the page reloads as the other account. " +
                "This browser's current account cannot be reached from here again. " +
                "The other showroom demos opened in this browser then sign in as that account too.", 13, MutedText);
        }

        // ------------------------------------------------------------------
        // Watching

        private void StartWatching()
        {
            if (!ShowroomRuntime.TryGet(out var gs2, out var session)) return;
            _userId = session.UserId;
            Debug.Log($"{nameof(TransferCodePanel)}: signed in as {ShowroomPlayerTag.Of(_userId)}");
            if (_accountText != null) _accountText.text = $"This browser is signed in as {ShowroomPlayerTag.Of(_userId)}.";
            _code = IdentityDemo.Me(gs2, session).TakeOver(IdentityDemo.TakeOverType);
            _nextTick = Time.realtimeSinceStartup + TickSeconds;
            Watch();
        }

        private void Watch()
        {
            var code = _code;
            if (code == null) return;
            _watch.Subscribe<EzTakeOver>(
                callback => code.SubscribeWithInitialCallAsync(callback),
                code.Unsubscribe,
                SetRegistered,
                failed: WatchFailed);
        }

        /// <summary>
        /// Says a failed start by kind and code only: what the SDK read is
        /// this account's transfer code. The tick tries again.
        /// </summary>
        private static void WatchFailed(Exception error)
        {
            var summary = error is Gs2Exception gs2Error ? ShowroomErrors.Summary(gs2Error) : error.GetType().Name;
            Debug.LogWarning($"[showroom] {nameof(TransferCodePanel)}: your transfer code could not be read: {summary}");
            ShowroomLog.Say($"Your transfer code could not be read ({summary}); trying again shortly.");
        }

        /// <summary>
        /// Drops the subscription, so the SDK holds no callback into a
        /// disabled or destroyed panel, and forgets what was read.
        /// </summary>
        private void StopWatching()
        {
            _watch.Stop();
            _inbox.Clear();
            _code = null;
            _registered = null;
        }

        private void Update()
        {
            _clipboard.Poll();
            _inbox.Drain();
            if (_code != null && _watch.Failed && Time.realtimeSinceStartup >= _nextTick)
            {
                _nextTick = Time.realtimeSinceStartup + TickSeconds;
                Watch();
            }
        }

        /// <summary>
        /// Keeps whether a code is registered, and turns the one issuing
        /// button into what it now does.
        /// </summary>
        private void SetRegistered(EzTakeOver? model) => SetRegistered(model != null);

        private void SetRegistered(bool registered)
        {
            if (_registered == registered) return;
            _registered = registered;
            ShowroomSettle.MarkChanged();
            if (_issueLabel != null) _issueLabel.text = registered ? "Delete and reissue" : "Issue a transfer code";
        }

        // ------------------------------------------------------------------
        // Issuing

        private void IssueOrReissue()
        {
            if (_reloading) return;
            var replacing = _registered == true;
            var issued = false;
            Run(replacing ? IdentityPress.Reissue : IdentityPress.Issue, async (gs2, session) =>
            {
                var code = IdentityDemo.Me(gs2, session).TakeOver(IdentityDemo.TakeOverType);
                if (replacing) await Delete(gs2, session);
                (string Identifier, string Password) registered;
                try
                {
                    registered = await Register(code);
                }
                catch (Gs2Exception error) when (!replacing && IdentityDemo.IsAlreadyRegistered(error))
                {
                    // GS2 sends no notification when a code is added elsewhere,
                    // e.g. by the browser this account was taken over from, so
                    // the SDK's cache can say "none" while GS2 has one. The
                    // visitor asked for a working code, so the one GS2 has is
                    // replaced in the same press.
                    replacing = true;
                    await Delete(gs2, session);
                    registered = await Register(code);
                }
                issued = true;
                ShowIssued(registered.Identifier, registered.Password);
                return replacing
                    ? $"Replaced your transfer code: the new ID is {registered.Identifier}. The old code no longer works."
                    : $"Issued a transfer code: the ID is {registered.Identifier}. Copy the password now; it is not shown again.";
            }, () =>
            {
                if (issued) SetRegistered(true);
            });
        }

        /// <summary>Deletes the account's transfer code; one already gone is what was asked for.</summary>
        private static async Task Delete(Gs2Domain gs2, IGameSession session)
        {
            try
            {
                await IdentityDemo.Me(gs2, session).DeleteTakeOverSettingAsync(IdentityDemo.TakeOverType);
            }
            catch (NotFoundException)
            {
                // Deleted from another tab or browser.
            }
        }

        /// <summary>
        /// Registers a new random code. An ID another player already holds is
        /// refused, so a refused ID is replaced by a new one once.
        /// </summary>
        private static async Task<(string Identifier, string Password)> Register(TakeOverDomain code)
        {
            for (var attempt = 0; ; attempt++)
            {
                var identifier = IdentityDemo.NewIdentifier();
                var password = IdentityDemo.NewPassword();
                try
                {
                    await code.AddTakeOverSettingAsync(identifier, password);
                    return (identifier, password);
                }
                catch (Gs2Exception error) when (attempt == 0 && IdentityDemo.IsIdentifierTaken(error))
                {
                    Debug.LogWarning($"{nameof(TransferCodePanel)}: a new transfer ID was refused ({ShowroomErrors.Summary(error)}); trying another.");
                }
            }
        }

        private void ShowIssued(string identifier, string password)
        {
            if (_issuedIdField != null) _issuedIdField.text = identifier;
            if (_issuedPasswordField != null) _issuedPasswordField.text = password;
        }

        /// <summary>The password leaves the page with the panel; nothing keeps it.</summary>
        private void ForgetIssued()
        {
            if (_issuedIdField != null) _issuedIdField.text = "";
            if (_issuedPasswordField != null) _issuedPasswordField.text = "";
        }

        // ------------------------------------------------------------------
        // Taking over

        private void TakeOver()
        {
            if (_reloading) return;
            var identifierText = (_takeIdField?.text ?? "").Trim();
            var passwordText = (_takePasswordField?.text ?? "").Trim();
            if (identifierText.Length == 0 || passwordText.Length == 0)
            {
                ShowroomLog.Say("Paste or type the other browser's transfer ID and password first.");
                return;
            }
            if (identifierText.Contains('@') || passwordText.Contains('@'))
            {
                ShowroomLog.Say("That looks like an email address. A transfer ID looks like demo-XXXX-XXXX; this page never asks for an email address or a password of your own.");
                return;
            }
            var identifier = IdentityDemo.ParseIdentifier(identifierText);
            if (identifier == null)
            {
                ShowroomLog.Say("That is not a transfer ID: it looks like demo-XXXX-XXXX, as the other browser shows it.");
                return;
            }
            var password = IdentityDemo.ParsePassword(passwordText);
            if (password == null)
            {
                ShowroomLog.Say("That is not a transfer code password: it looks like XXXX-XXXX-XXXX-XXXX, as the other browser shows it.");
                return;
            }
            var store = FindAnyObjectByType<ShowroomAccountStore>();
            if (store == null)
            {
                ShowroomLog.Say("This page has no account store, so it cannot remember another account.");
                return;
            }

            string? takenUserId = null;
            string? takenPassword = null;
            var own = false;
            Run(IdentityPress.TakeOver, async (gs2, session) =>
            {
                var account = await IdentityDemo.Accounts(gs2).DoTakeOverAsync(IdentityDemo.TakeOverType, identifier, password);
                var model = await account.ModelAsync();
                if (model == null || string.IsNullOrEmpty(model.UserId) || string.IsNullOrEmpty(model.Password))
                {
                    return "GS2 accepted the code but did not hand the account over; nothing was changed.";
                }
                takenUserId = model.UserId;
                takenPassword = model.Password;
                if (model.UserId == session.UserId)
                {
                    // Remembered all the same, so the saved password is the
                    // one GS2 now holds for this account.
                    own = true;
                    return $"That code is this browser's own: it is already signed in as {ShowroomPlayerTag.Of(model.UserId)}.";
                }
                return $"Took over {ShowroomPlayerTag.Of(model.UserId)}. Reloading to sign in as it...";
            }, () =>
            {
                if (takenUserId == null || takenPassword == null) return;
                // localStorage writes are synchronous, so the reloaded page reads this.
                store.Remember(takenUserId, takenPassword);
                var stuck = IdentityDemo.IsRemembered(takenUserId, takenPassword);
                takenPassword = null;
                if (_takePasswordField != null) _takePasswordField.text = "";
                if (!stuck)
                {
                    ShowroomLog.Say(own
                        ? "The browser did not keep the account: its storage is blocked, so the next visit starts a new account."
                        : "The browser did not keep the account: its storage is blocked (private mode or blocked site data), so reloading would not sign in as it. Allow site data and try again.");
                    return;
                }
                if (own) return;
                _reloading = true;
                ShowroomPress.Freeze();
                StartCoroutine(ReloadSoon());
            });
        }

        /// <summary>
        /// Runs one press through the page's press runner, redacted, with the
        /// refusals a visitor can meet explained in its terms.
        /// <paramref name="afterward"/> runs once the press is over, whether
        /// it worked or not.
        /// </summary>
        private void Run(IdentityPress press, Func<Gs2Domain, IGameSession, Task<string>> action, Action afterward)
        {
            ShowroomPress.Run(new ShowroomPressOptions
            {
                Name = $"{nameof(TransferCodePanel)} {press}",
                Owner = this,
                Redact = true,
                Explain = error => IdentityDemo.Explain(press, error),
                Afterward = afterward,
            }, action);
        }

        private IEnumerator ReloadSoon()
        {
            yield return new WaitForSecondsRealtime(ReloadDelaySeconds);
            ShowroomReload.Reload();
        }

        // ------------------------------------------------------------------
        // Clipboard

        private void CopyCode()
        {
            if (_reloading || _clipboard.Pending) return;
            var identifier = _issuedIdField?.text ?? "";
            var password = _issuedPasswordField?.text ?? "";
            if (identifier.Length == 0 || password.Length == 0)
            {
                ShowroomLog.Say(_registered == true
                    ? "The password was shown only when the code was issued. Press \"Delete and reissue\" for a new code to copy."
                    : "Issue a transfer code first.");
                return;
            }
            // A refusal is not a failure of the page: the browser decides, so
            // the visitor is told how to do it by hand.
            if (!_clipboard.Copy($"{identifier} {password}",
                    () => ShowroomLog.Say("Copied the ID and password. Paste them into this page in the other browser."),
                    reason => ShowroomLog.Say($"The browser did not let the page copy ({reason}). Select the ID and password above and copy them.")))
            {
                ShowroomLog.Say("One moment: the browser is still answering the last copy or paste.");
            }
        }

        private void Paste()
        {
            if (_reloading || _clipboard.Pending) return;
            if (!_clipboard.Paste(
                    FillFromPaste,
                    reason => ShowroomLog.Say($"The browser did not let the page paste ({reason}). Type the ID and password into the fields instead.")))
            {
                ShowroomLog.Say("One moment: the browser is still answering the last copy or paste.");
            }
        }

        /// <summary>
        /// Puts a pasted code into the fields: the ID and the password as the
        /// other browser copied them, or either one alone. Nothing pasted is
        /// logged, because it may hold a password.
        /// </summary>
        private void FillFromPaste(string text)
        {
            if (text.Contains('@'))
            {
                ShowroomLog.Say("What was pasted looks like an email address, not a transfer code. Nothing was filled in.");
                return;
            }
            var filled = false;
            foreach (var token in text.Split(new[] { ' ', '\t', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var identifier = IdentityDemo.ParseIdentifier(token);
                if (identifier != null && _takeIdField != null)
                {
                    _takeIdField.text = identifier;
                    filled = true;
                    continue;
                }
                var password = IdentityDemo.ParsePassword(token);
                if (password != null && _takePasswordField != null)
                {
                    _takePasswordField.text = password;
                    filled = true;
                }
            }
            ShowroomLog.Say(filled
                ? "Pasted. Check the fields, then press \"Take over that account\"."
                : "What was pasted is not a transfer code. Copy the ID and password from the other browser's page.");
        }

        // ------------------------------------------------------------------
        // Building blocks

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

        /// <summary>Adds a button and returns its label, for a button whose meaning changes.</summary>
        private Text? Press(RectTransform parent, string text, Action onClick)
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
            return label;
        }

        private Text Caption(RectTransform parent, string text, int size, Color color)
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
