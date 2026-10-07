// Use the configured exchange so code consumption, the redemption limit and the reward share its atomic transaction.
#nullable enable

using System;
using System.Collections;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

using UnityEngine;
using UnityEngine.UI;

using Gs2.Core.Exception;
using Gs2.Gs2Limit;
using Gs2.Gs2Limit.Request;
using Gs2.Unity.Core;
using Gs2.Unity.Gs2Exchange.Model;
using Gs2.Unity.Util;

using CodeNotFoundException = Gs2.Gs2SerialKey.Exception.CodeNotFoundException;
using CounterOverflowException = Gs2.Gs2Limit.Exception.OverflowException;

namespace GS2Studio.Showroom.Demo
{
    [AddComponentMenu("GS2 Studio/Showroom/Code Redeem")]
    public sealed class SerialCodeRedemptionRedeemPanel : MonoBehaviour
    {
        private const string ExchangeNamespace = "SerialCodeRedeem";
        private const string RedeemRate = "serialcoderedemption";
        private const string CodeConfigKey = "code";

        private const string StartOverNamespace = "SerialCodeStartOver";

        private const string LimitNamespace = "SerialCodeLimit";
        private const string LimitName = "serialcoderedemption";
        private const string CounterName = "redeemed";

        // The code is substituted into exchange actions; reject unsupported characters before sending it.
        private static readonly Regex CodePattern = new Regex("^[A-Za-z0-9_.-]{1,64}$");

        private static readonly Color FieldColor = new Color(0.16f, 0.15f, 0.22f, 1f);
        private static readonly Color LightText = new Color(0.922f, 0.91f, 0.949f, 1f);
        private static readonly Color MutedText = new Color(0.643f, 0.616f, 0.729f, 1f);

        [SerializeField] private RectTransform? _panel;
        [SerializeField] private Button? _buttonTemplate;
        [SerializeField] private Font? _font;

        private InputField? _field;
        private Button? _redeem;
        private Button? _startOver;

        // Unknown until the first successful read; an unread counter must not appear unredeemed.
        private bool? _redeemed;
        private Text? _status;
        private Coroutine? _waiting;

        private void OnEnable()
        {
            if (_panel == null || _buttonTemplate == null || _font == null)
            {
                ShowroomLog.Say("The code panel was baked without its region, button or font.");
                return;
            }
            if (_field == null) Build();
            _waiting = StartCoroutine(WaitForSignIn());
        }

        private void OnDisable()
        {
            if (_waiting != null) StopCoroutine(_waiting);
            _waiting = null;
        }

        // Authentication may finish after OnEnable; defer the counter read until a session exists.
        private IEnumerator WaitForSignIn()
        {
            while (!ShowroomRuntime.TryGet(out _, out _))
            {
                yield return new WaitForSeconds(0.25f);
            }
            _waiting = null;
            ReadRedeemed();
        }

        private void Build()
        {
            _status = Caption("Checking whether you have redeemed...");

            var field = Child("CodeField", _panel!);
            field.gameObject.AddComponent<Image>().color = FieldColor;
            field.gameObject.AddComponent<LayoutElement>().minHeight = 48;
            var placeholder = FieldText(field, "Placeholder", "Type a code", MutedText);
            placeholder.fontStyle = FontStyle.Italic;
            var text = FieldText(field, "Text", "", LightText);
            _field = field.gameObject.AddComponent<InputField>();
            _field.textComponent = text;
            _field.placeholder = placeholder;
            _field.lineType = InputField.LineType.SingleLine;
            _field.characterLimit = 64;

            _redeem = Instantiate(_buttonTemplate!, _panel!);
            _redeem.name = "RedeemButton";
            var label = _redeem.GetComponentInChildren<Text>();
            if (label != null) label.text = "Redeem";
            _redeem.onClick.RemoveAllListeners();
            _redeem.onClick.AddListener(Redeem);

            _startOver = Instantiate(_buttonTemplate!, _panel!);
            _startOver.name = "StartOverButton";
            var startOverLabel = _startOver.GetComponentInChildren<Text>();
            if (startOverLabel != null) startOverLabel.text = "Start over";
            _startOver.onClick.RemoveAllListeners();
            _startOver.onClick.AddListener(StartOver);
        }

        // The reset exchange owns privileged counter deletion and can be called with the player session.
        private void StartOver()
        {
            if (_redeemed == false)
            {
                ShowroomLog.Say("You have not redeemed yet, so there is nothing to clear.");
                return;
            }
            Run("starting over", async (gs2, session) =>
            {
                var transaction = await gs2.Exchange.Namespace(StartOverNamespace).Me(session).Exchange()
                    .ExchangeAsync(RedeemRate, 1, speculativeExecute: false);
                if (transaction != null) await transaction.WaitAsync(true);
                return "Your redemption is cleared; you can redeem again.";
            }, error => $"Starting over failed: {ShowroomErrors.Describe(error)}");
        }

        private void Redeem()
        {
            if (_field == null) return;
            var code = _field.text.Trim();
            if (code.Length == 0)
            {
                ShowroomLog.Say("Type a code first.");
                return;
            }
            if (!CodePattern.IsMatch(code))
            {
                ShowroomLog.Say("Codes use letters, digits, '.', '_' and '-'.");
                return;
            }
            Run("redeeming a code", async (gs2, session) =>
            {
                var transaction = await gs2.Exchange.Namespace(ExchangeNamespace).Me(session).Exchange()
                    .ExchangeAsync(
                        RedeemRate,
                        1,
                        new[] { new EzConfig { Key = CodeConfigKey, Value = code } },
                        speculativeExecute: false);
                if (transaction != null) await transaction.WaitAsync(true);
                if (_field != null) _field.text = "";
                return $"Redeemed {code}.";
            }, error => Explain(error, code));
        }

        // A failed wait does not prove rollback; refresh the actual redemption state after the attempt.
        private void Run(string name, Func<Gs2Domain, IGameSession, Task<string>> press, Func<Gs2Exception, string?> explain)
        {
            SetInteractable(false);
            var started = ShowroomPress.Run(new ShowroomPressOptions
            {
                Name = name,
                Owner = this,
                Explain = explain,
                Afterward = () =>
                {
                    SetInteractable(true);
                    ReadRedeemed();
                },
            }, press);
            if (!started) SetInteractable(true);
        }

        private void SetInteractable(bool interactable)
        {
            if (_redeem != null) _redeem.interactable = interactable;
            if (_startOver != null) _startOver.interactable = interactable;
        }

        // Failures originate in individual exchange actions; distinguish their service-specific exception types.
        private static string Explain(Gs2Exception error, string code)
        {
            if (error is CounterOverflowException)
            {
                return "You have already redeemed a code; each visitor can redeem once.";
            }
            if (error is CodeNotFoundException)
            {
                return $"{code} is not a code GS2 knows. Codes are case sensitive.";
            }
            return $"Redeeming {code} failed: {ShowroomErrors.Describe(error)}";
        }

        // Read the counter directly so post-attempt status does not depend on an older SDK cache entry.
        private async void ReadRedeemed()
        {
            if (!ShowroomRuntime.TryGet(out var gs2, out var session)) return;
            bool redeemed;
            try
            {
                var result = await new Gs2LimitRestClient(gs2.Super.RestSession).GetCounterAsync(
                    new GetCounterRequest()
                        .WithNamespaceName(LimitNamespace)
                        .WithLimitName(LimitName)
                        .WithCounterName(CounterName)
                        .WithAccessToken(session.AccessToken.Token));
                redeemed = (result?.Item?.Count ?? 0) > 0;
            }
            catch (NotFoundException)
            {
                redeemed = false;
            }
            catch (Exception error)
            {
                if (this != null) ShowroomLog.Failure("Whether you have redeemed could not be read", error);
                return;
            }
            if (this == null || _status == null) return;
            _redeemed = redeemed;
            _status.text = redeemed
                ? "You have redeemed your code."
                : "You have not redeemed a code yet.";
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

        private Text Caption(string text)
        {
            var caption = Child("Caption", _panel!);
            var label = caption.gameObject.AddComponent<Text>();
            label.font = _font;
            label.fontSize = 15;
            label.color = MutedText;
            label.text = text;
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
