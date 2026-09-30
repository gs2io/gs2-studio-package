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
// asking GS2 again.
#nullable enable

using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Threading.Tasks;

using UnityEngine;
using UnityEngine.UI;

using Gs2.Core.Exception;

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

        /// <summary>What the clipboard is being asked to do, until it answers.</summary>
        private enum Clipboard
        {
            Idle,
            CopyingCode,
            Pasting,
        }

        private Clipboard _clipboard;

        /// <summary>
        /// How long the clipboard may take to answer. A browser can leave a
        /// permission prompt open, or never settle, and the buttons would
        /// otherwise wait for it forever.
        /// </summary>
        private const float ClipboardSeconds = 10f;
        private float _clipboardDeadline;

        /// <summary>The signed-in account, set once signed in.</summary>
        private string _userId = "";
        private TakeOverDomain? _code;

        /// <summary>
        /// Whether this account has a transfer code; null until the SDK has
        /// said. The one button issues or replaces by it.
        /// </summary>
        private bool? _registered;

        /// <summary>What the SDK said, handed over to the main thread.</summary>
        private readonly ConcurrentQueue<Action> _inbox = new ConcurrentQueue<Action>();
        private int _watchTicket;
        private Action? _unsubscribe;
        private bool _watchFailed;
        private float _nextTick;
        private bool _reloading;

        private void OnEnable()
        {
            if (_panel == null || _buttonTemplate == null || _font == null)
            {
                IdentityDemo.Log("The transfer panel was baked without its region, button or font.");
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
            ForgetIssued();
        }

        private IEnumerator WaitForSignIn()
        {
            while (!IdentityDemo.TryRuntime(out _, out _))
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
            if (!IdentityDemo.TryRuntime(out var gs2, out var session)) return;
            _userId = session!.UserId;
            Debug.Log($"{nameof(TransferCodePanel)}: signed in as {IdentityDemo.Tag(_userId)}");
            if (_accountText != null) _accountText.text = $"This browser is signed in as {IdentityDemo.Tag(_userId)}.";
            _code = IdentityDemo.Me(gs2!, session).TakeOver(IdentityDemo.TakeOverType);
            _nextTick = Time.realtimeSinceStartup + TickSeconds;
            Watch();
        }

        private async void Watch()
        {
            var code = _code;
            if (code == null) return;
            StopSubscription();
            var ticket = ++_watchTicket;
            _watchFailed = false;
            try
            {
                var id = await code.SubscribeWithInitialCallAsync(model => _inbox.Enqueue(() =>
                {
                    if (ticket == _watchTicket) SetRegistered(model);
                }));
                if (ticket == _watchTicket) _unsubscribe = () => code.Unsubscribe(id);
                else code.Unsubscribe(id);
            }
            catch (Gs2Exception error)
            {
                if (ticket != _watchTicket) return;
                _watchFailed = true;
                Debug.LogWarning($"{nameof(TransferCodePanel)}: your transfer code could not be read: {IdentityDemo.Summary(error)}");
                IdentityDemo.Log($"Your transfer code could not be read ({IdentityDemo.Summary(error)}); trying again shortly.");
            }
        }

        private void StopSubscription()
        {
            var unsubscribe = _unsubscribe;
            _unsubscribe = null;
            unsubscribe?.Invoke();
        }

        /// <summary>
        /// Drops the subscription, so the SDK holds no callback into a
        /// disabled or destroyed panel, and forgets what was read.
        /// </summary>
        private void StopWatching()
        {
            _watchTicket++;
            StopSubscription();
            while (_inbox.TryDequeue(out _)) { }
            _code = null;
            _registered = null;
            _watchFailed = false;
        }

        private void Update()
        {
            PollClipboard();
            while (_inbox.TryDequeue(out var apply)) apply();
            if (_code != null && _watchFailed && Time.realtimeSinceStartup >= _nextTick)
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
            IdentityDemo.MarkChanged();
            if (_issueLabel != null) _issueLabel.text = registered ? "Delete and reissue" : "Issue a transfer code";
        }

        // ------------------------------------------------------------------
        // Issuing

        private void IssueOrReissue()
        {
            if (_reloading) return;
            var replacing = _registered == true;
            var issued = false;
            IdentityDemo.Run(replacing ? IdentityPress.Reissue : IdentityPress.Issue, async (gs2, session) =>
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
            }, afterward: () =>
            {
                if (issued) SetRegistered(true);
            });
        }

        /// <summary>Deletes the account's transfer code; one already gone is what was asked for.</summary>
        private static async Task Delete(Gs2.Unity.Core.Gs2Domain gs2, Gs2.Unity.Util.IGameSession session)
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
        /// refused with a 500, so a refused ID is replaced by a new one once.
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
                catch (InternalServerErrorException error) when (attempt == 0)
                {
                    Debug.LogWarning($"{nameof(TransferCodePanel)}: a new transfer ID was refused ({IdentityDemo.Summary(error)}); trying another.");
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
                IdentityDemo.Log("Paste or type the other browser's transfer ID and password first.");
                return;
            }
            if (identifierText.Contains('@') || passwordText.Contains('@'))
            {
                IdentityDemo.Log("That looks like an email address. A transfer ID looks like demo-XXXX-XXXX; this page never asks for an email address or a password of your own.");
                return;
            }
            var identifier = IdentityDemo.ParseIdentifier(identifierText);
            if (identifier == null)
            {
                IdentityDemo.Log("That is not a transfer ID: it looks like demo-XXXX-XXXX, as the other browser shows it.");
                return;
            }
            var password = IdentityDemo.ParsePassword(passwordText);
            if (password == null)
            {
                IdentityDemo.Log("That is not a transfer code password: it looks like XXXX-XXXX-XXXX-XXXX, as the other browser shows it.");
                return;
            }
            var store = FindAnyObjectByType<ShowroomAccountStore>();
            if (store == null)
            {
                IdentityDemo.Log("This page has no account store, so it cannot remember another account.");
                return;
            }

            string? takenUserId = null;
            string? takenPassword = null;
            var own = false;
            IdentityDemo.Run(IdentityPress.TakeOver, async (gs2, session) =>
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
                    return $"That code is this browser's own: it is already signed in as {IdentityDemo.Tag(model.UserId)}.";
                }
                return $"Took over {IdentityDemo.Tag(model.UserId)}. Reloading to sign in as it...";
            }, afterward: () =>
            {
                if (takenUserId == null || takenPassword == null) return;
                // localStorage writes are synchronous, so the reloaded page reads this.
                store.Remember(takenUserId, takenPassword);
                var stuck = IdentityDemo.IsRemembered(takenUserId, takenPassword);
                takenPassword = null;
                if (_takePasswordField != null) _takePasswordField.text = "";
                if (!stuck)
                {
                    IdentityDemo.Log(own
                        ? "The browser did not keep the account: its storage is blocked, so the next visit starts a new account."
                        : "The browser did not keep the account: its storage is blocked (private mode or blocked site data), so reloading would not sign in as it. Allow site data and try again.");
                    return;
                }
                if (own) return;
                _reloading = true;
                IdentityDemo.Freeze();
                StartCoroutine(ReloadSoon());
            });
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
            if (_reloading || _clipboard != Clipboard.Idle) return;
            var identifier = _issuedIdField?.text ?? "";
            var password = _issuedPasswordField?.text ?? "";
            if (identifier.Length == 0 || password.Length == 0)
            {
                IdentityDemo.Log(_registered == true
                    ? "The password was shown only when the code was issued. Press \"Delete and reissue\" for a new code to copy."
                    : "Issue a transfer code first.");
                return;
            }
            _clipboard = Clipboard.CopyingCode;
            _clipboardDeadline = Time.realtimeSinceStartup + ClipboardSeconds;
            ShowroomClipboard.Copy($"{identifier} {password}");
        }

        private void Paste()
        {
            if (_reloading || _clipboard != Clipboard.Idle) return;
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
            if (doing == Clipboard.CopyingCode)
            {
                IdentityDemo.Log(outcome == ShowroomClipboard.Outcome.Done
                    ? "Copied the ID and password. Paste them into this page in the other browser."
                    : $"The browser did not let the page copy ({text}). Select the ID and password above and copy them.");
                return;
            }
            if (outcome != ShowroomClipboard.Outcome.Done)
            {
                IdentityDemo.Log($"The browser did not let the page paste ({text}). Type the ID and password into the fields instead.");
                return;
            }
            FillFromPaste(text);
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
                IdentityDemo.Log("What was pasted looks like an email address, not a transfer code. Nothing was filled in.");
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
            IdentityDemo.Log(filled
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
