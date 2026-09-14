// The page every live demo runs on: build the interface, connect to GS2, sign
// in, then hand over to the package's own Demo.
//
// It reads top to bottom on purpose. A demo is a small program, so the startup
// is one coroutine rather than a chain of components calling each other back.
#nullable disable
using System.Collections;
using System.Collections.Generic;
using Gs2.Unity.Core;
using Gs2.Unity.Core.ScriptableObject;
using Gs2.Unity.Util;
using GS2Studio.Generated.Runtime;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace GS2Studio.Showroom
{
    public sealed class ShowroomPage : MonoBehaviour
    {
        private const string UserIdKey = "gs2.showroom.userId";
        private const string PasswordKey = "gs2.showroom.password";
        private const int MaximumLogLines = 120;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Boot()
        {
            DontDestroyOnLoad(new GameObject("Showroom", typeof(ShowroomPage)));
        }

        public Gs2Domain Gs2 { get; private set; }
        public IGameSession Session { get; private set; }

        private readonly List<string> _lines = new List<string>();
        private Text _statusText;
        private Text _logText;
        private ScrollRect _logScroll;

        private IEnumerator Start()
        {
            BuildInterface();
            Log($"package: {ShowroomConfig.PackageId}");

            var clientHolder = CreateGs2Objects();
            yield return new WaitUntil(() => clientHolder.Initialized);
            Gs2 = clientHolder.Gs2;
            Log("GS2 client ready");

            _statusText.text = "Signing in…";
            yield return SignIn();
            if (Session == null)
            {
                _statusText.text = "Sign-in failed";
                yield break;
            }
            _statusText.text = "Connected";

            Demo.Build(Content, this);
        }

        // ---- interface -----------------------------------------------------

        public Transform Content { get; private set; }

        private void BuildInterface()
        {
            // Buttons need an event system; the scene is otherwise empty.
            var events = new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
            events.transform.SetParent(transform, false);

            var canvas = ShowroomUi.CreateCanvas("Canvas");
            canvas.transform.SetParent(transform, false);

            var background = ShowroomUi.CreatePanel("Background", canvas.transform, ShowroomUi.Background);
            ShowroomUi.StretchToParent((RectTransform)background.transform);
            var root = ShowroomUi.CreateRect("Root", background.transform);
            ShowroomUi.StretchToParent(root, 24f);
            ShowroomUi.AddVerticalLayout(root.gameObject, 0, 16f);

            var header = ShowroomUi.CreateRect("Header", root);
            ShowroomUi.AddVerticalLayout(header.gameObject, 0, 4f);
            ShowroomUi.CreateText("Title", header, ShowroomConfig.Title, 30, ShowroomUi.Ink, FontStyle.Bold);
            ShowroomUi.CreateText("Subtitle", header, ShowroomConfig.Description, 16, ShowroomUi.Muted);
            _statusText = ShowroomUi.CreateText("Status", header, "Connecting…", 16, ShowroomUi.Accent);

            var content = ShowroomUi.CreateScrollView("Content", root);
            content.gameObject.AddComponent<LayoutElement>().flexibleHeight = 1f;
            Content = content.content;

            var logPanel = ShowroomUi.CreatePanel("Log", root, ShowroomUi.Surface);
            var logSize = logPanel.gameObject.AddComponent<LayoutElement>();
            logSize.minHeight = 150f;
            logSize.flexibleHeight = 0f;
            ShowroomUi.AddVerticalLayout(logPanel.gameObject, 12, 0f);
            _logScroll = ShowroomUi.CreateScrollView("LogScroll", logPanel.transform);
            _logScroll.gameObject.AddComponent<LayoutElement>().flexibleHeight = 1f;
            _logText = ShowroomUi.CreateText("LogText", _logScroll.content, "", 13, ShowroomUi.Muted);
            _logText.alignment = TextAnchor.UpperLeft;
        }

        /// <summary>Writes one line to the on-screen log. WebGL hides the console.</summary>
        public void Log(string message)
        {
            _lines.Add($"[{System.DateTime.Now:HH:mm:ss}] {message}");
            if (_lines.Count > MaximumLogLines) _lines.RemoveAt(0);
            if (_logText == null) return;
            _logText.text = string.Join("\n", _lines);
            Canvas.ForceUpdateCanvases();
            _logScroll.verticalNormalizedPosition = 0f;
        }

        // ---- GS2 -----------------------------------------------------------

        private Gs2ClientHolder CreateGs2Objects()
        {
            var environment = ScriptableObject.CreateInstance<Gs2Environment>();
            environment.name = "showroom";
            environment.region = ShowroomConfig.Region;
            environment.clientId = ShowroomConfig.ClientId;
            environment.clientSecret = ShowroomConfig.ClientSecret;

            var host = new GameObject("Gs2");
            host.transform.SetParent(transform, false);

            var clientHolder = host.AddComponent<Gs2ClientHolder>();
            clientHolder.activeEnvironmentName = "showroom";
            clientHolder.environments = new List<Gs2Environment> { environment };
            clientHolder.OnError += (error, retry) => Log($"client error: {error.Message}");

            host.AddComponent<Gs2GameSessionHolder>();
            // The provider finds both holders on this object by itself.
            host.AddComponent<Gs2HolderRuntimeContextProvider>();
            return clientHolder;
        }

        /// <summary>
        /// Signs in as the same anonymous player each visit. The credentials of
        /// the account created on the first visit are kept in the browser, so a
        /// reload does not hand the visitor a new, empty account.
        /// </summary>
        private IEnumerator SignIn()
        {
            var userId = PlayerPrefs.GetString(UserIdKey, null);
            var password = PlayerPrefs.GetString(PasswordKey, null);

            if (string.IsNullOrEmpty(userId) || string.IsNullOrEmpty(password))
            {
                var create = Gs2.Account.Namespace(ShowroomConfig.AccountNamespace).CreateFuture();
                yield return create;
                if (create.Error != null)
                {
                    Log($"create account failed: {create.Error.Message}");
                    yield break;
                }

                var model = create.Result.ModelFuture();
                yield return model;
                if (model.Error != null)
                {
                    Log($"read account failed: {model.Error.Message}");
                    yield break;
                }

                userId = model.Result.UserId;
                password = model.Result.Password;
                PlayerPrefs.SetString(UserIdKey, userId);
                PlayerPrefs.SetString(PasswordKey, password);
                PlayerPrefs.Save();
                Log("created an anonymous account");
            }

            // The gateway session carries GS2's change notifications, so a
            // binder subscription only delivers updates once it is open.
            var login = Gs2.LoginFuture(
                new Gs2AccountAuthenticator(
                    new AccountSetting { accountNamespaceName = ShowroomConfig.AccountNamespace },
                    new GatewaySetting
                    {
                        gatewayNamespaceName = ShowroomConfig.GatewayNamespace,
                        allowConcurrentAccess = true,
                    }
                ),
                userId,
                password
            );
            yield return login;
            if (login.Error != null)
            {
                // A stored account the server no longer knows would wedge every
                // later visit, so it is dropped before reporting.
                PlayerPrefs.DeleteKey(UserIdKey);
                PlayerPrefs.DeleteKey(PasswordKey);
                PlayerPrefs.Save();
                Log($"sign-in failed: {login.Error.Message}");
                yield break;
            }

            Gs2GameSessionHolder.Instance.UpdateGameSession(login.Result);
            Session = login.Result;
            Log($"signed in as {Session.UserId}");
        }
    }
}
