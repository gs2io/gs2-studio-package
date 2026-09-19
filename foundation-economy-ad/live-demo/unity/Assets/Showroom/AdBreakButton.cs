// The ad break, as this demo has to show it.
//
// A rewarded view is two halves. One is the placement: an ad SDK fills the
// screen, plays something, and calls back when the view completed. The other
// is the grant, which is GS2's: `Gs2AdReward:AcquirePointByUserId` takes a
// namespace, a user and a number of points, and verifies nothing. Deciding
// that a view really happened belongs to the title, between the two.
//
// This demo has only the second half, and cannot have the first: the ad
// networks GS2 accepts do not reach a browser. Unity Ads supports iOS and
// Android only, as does the LevelPlay mediation that replaced it, and AdMob
// is mobile-only too. The showroom is a WebGL player, so there is no
// placement to play and no completion callback to grant from.
//
// So the demo stands where the placement would be and says so. This panel is
// the shape of an ad break with the ad missing, and the press that closes it
// is the decision a title would make from its network's callback — spelled
// out on the panel, because a visitor who cannot tell a mock from the real
// thing has been misled rather than shown something.
//
// How it is built matters as much as what it says. The page's rows live under
// the content mount, and a re-bake clears that mount and re-creates every
// generated component on it — so anything placed outside the mount that holds
// an Inspector reference to a generated component goes null the next time the
// page is baked, silently. This row therefore owns the whole break: it adds
// the generated `AdViewPointWatchButton` to its own GameObject at run time,
// where the generated component finds the handler by walking up to the mount
// on its own, and it builds the panel in code. Nothing of either is written
// to the scene or to a prefab, so a re-bake has nothing to break.
//
// Shaped like a generated action button on purpose — a `Button` to wire and
// an `OnCompleted` to raise, plus the `OnFailed` the page shows failures
// through — because that is what the page knows how to draw, and this is a
// row like any other once it is drawn.
#nullable enable

using System;
using System.Collections;
using System.Reflection;

using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

using Gs2.Core.Exception;
using Gs2.Unity.Util;

using GS2Studio.Generated.AdViewPoint.UI;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// Opens a panel that stands in for a rewarded placement, and grants the
    /// view point when the visitor says the placement finished.
    /// </summary>
    [AddComponentMenu("GS2 Studio/Showroom/Ad Break")]
    public sealed class AdBreakButton : MonoBehaviour
    {
        /// <summary>
        /// How long the panel stays before it can be dismissed for a point.
        ///
        /// A real placement is not skippable until its reward point, and the
        /// wait is the part of the experience that survives having no ad to
        /// play. Short, because nobody came here to watch a rectangle.
        /// </summary>
        private const float DwellSeconds = 5f;

        /// <summary>
        /// Above the page's own canvas, which sits at zero.
        /// </summary>
        private const int OverlaySortingOrder = 100;

        private const float CardWidth = 940f;
        private const float CardHeight = 900f;
        private const float CardPadding = 56f;

        // The page's palette, so the break reads as part of the page rather
        // than as something that landed on top of it.
        private static readonly Color PageBackdrop = new Color(0.071f, 0.063f, 0.098f, 0.93f);
        private static readonly Color CardBackground = new Color(0.102f, 0.09f, 0.145f, 1f);
        private static readonly Color Accent = new Color(0.643f, 0.549f, 1f, 1f);
        private static readonly Color PrimaryText = new Color(0.922f, 0.91f, 0.949f, 1f);
        private static readonly Color MutedText = new Color(0.643f, 0.616f, 0.729f, 1f);
        private static readonly Color OnAccentText = new Color(0.07f, 0.06f, 0.1f, 1f);

        private const string Heading = "Advertisement";

        private const string Body =
            "Nothing is playing here. A rewarded placement would fill this panel in a shipped " +
            "title, and this demo has none to show: the ad SDKs GS2 accepts are mobile-only — " +
            "Unity Ads, the LevelPlay mediation that replaced it, and AdMob — and the showroom " +
            "is a WebGL player.\n\n" +
            "The button below does the half that is not the SDK's. It tells GS2 a view was " +
            "completed and asks for the point; GS2 verifies nothing. A shipped title presses it " +
            "from its ad network's completion callback, and that decision is what this panel is " +
            "standing in for.";

        private const string ConfirmLabel = "I finished watching";
        private const string ReadyStatus = "The placement has finished.";
        private const string GrantingStatus = "Asking GS2 for the point…";
        private const string CloseLabel = "Close";

        /// <summary>
        /// The field the generated button takes its press from, named by the
        /// package's own component manifest — `AdViewPoint.showroom.json`
        /// publishes it as the `button` role of `AdViewPointWatchButton`, and
        /// the page builder writes the same field from the same manifest when
        /// it bakes a generated row. Assigning it is using the published
        /// contract, not reaching into the component; what is missing is only
        /// a setter, because a baked row has no need of one.
        ///
        /// Reflection fails silently by nature, so <see cref="Start"/> refuses
        /// loudly when the field is not there rather than leaving a press that
        /// does nothing.
        /// </summary>
        private static readonly FieldInfo? GeneratedButtonField =
            typeof(AdViewPointWatchButton).GetField(
                "_button", BindingFlags.Instance | BindingFlags.NonPublic);

        [SerializeField] private Button? _button;

        /// <summary>
        /// Raised once the point has been granted, for a page that wants to
        /// hang something off it. What the grant changed does not need it: the
        /// balance row reads through its own binder's subscription.
        /// </summary>
        [SerializeField] private UnityEvent _onCompleted = new UnityEvent();

        /// <summary>
        /// Raised when the grant fails, which is how the page shows it. A
        /// browser hides the console, so a failure a visitor cannot see reads
        /// as nothing having happened.
        /// </summary>
        [SerializeField] private ErrorEvent _onFailed = new ErrorEvent();

        public UnityEvent OnCompleted => _onCompleted;
        public ErrorEvent OnFailed => _onFailed;

        private AdViewPointWatchButton? _watch;
        private GameObject? _overlay;
        private Button? _confirmButton;
        private Text? _statusText;
        private ShowroomPage? _page;

        private bool _open;
        private bool _granting;
        private float _remaining;

        private void Start()
        {
            if (_button == null)
            {
                Report("The ad break has no button to open it; the page did not bake this row.");
                return;
            }

            if (GeneratedButtonField == null)
            {
                Report(
                    "The generated watch button no longer takes its press from `_button`, so the " +
                    "ad break cannot hand it one. Re-read `AdViewPoint.showroom.json` for the " +
                    "field the `button` role now names.");
                return;
            }

            BuildOverlay(_button);

            // The generated component goes on this row's own GameObject, which
            // is under the content mount, so it resolves the handler by
            // walking up to it — the same way a baked row's button does.
            _watch = gameObject.AddComponent<AdViewPointWatchButton>();
            GeneratedButtonField.SetValue(_watch, _confirmButton);

            // `AddComponent` already ran the component's `OnEnable`, when it
            // had no button to subscribe to. It only subscribes there, so the
            // press it was just given reaches it on the next enable.
            _watch.enabled = false;
            _watch.enabled = true;

            _watch.OnCompleted.AddListener(OnGranted);
            _watch.OnFailed.AddListener(OnGrantFailed);

            _confirmButton!.onClick.AddListener(OnConfirmed);
            _button.onClick.AddListener(Open);
        }

        private void OnDestroy()
        {
            if (_button != null) _button.onClick.RemoveListener(Open);
            if (_confirmButton != null) _confirmButton.onClick.RemoveListener(OnConfirmed);
            if (_watch != null)
            {
                _watch.OnCompleted.RemoveListener(OnGranted);
                _watch.OnFailed.RemoveListener(OnGrantFailed);
            }
            if (_overlay != null) Destroy(_overlay);
        }

        private void Update()
        {
            if (!_open || _granting || _remaining <= 0f) return;
            _remaining -= Time.deltaTime;
            if (_remaining > 0f)
            {
                SetStatus($"You can claim the point in {Mathf.CeilToInt(_remaining)}s.");
                return;
            }
            _remaining = 0f;
            if (_confirmButton != null) _confirmButton.interactable = true;
            SetStatus(ReadyStatus);
        }

        private void Open()
        {
            if (_open || _overlay == null) return;
            _open = true;
            _granting = false;
            _remaining = DwellSeconds;
            if (_confirmButton != null) _confirmButton.interactable = false;
            SetStatus($"You can claim the point in {Mathf.CeilToInt(DwellSeconds)}s.");
            _overlay.SetActive(true);
        }

        /// <summary>
        /// Puts the panel away without granting anything.
        ///
        /// The grant only ever happens on the generated component's own press,
        /// so no way out of this panel can pay: closing it is closing it.
        /// </summary>
        private void Close()
        {
            _open = false;
            _granting = false;
            if (_overlay != null) _overlay.SetActive(false);
        }

        /// <summary>
        /// Runs beside the generated component's own listener on the same
        /// press: that one asks GS2 for the point, this one says so and stops
        /// a second press landing while the first is still out.
        /// </summary>
        private void OnConfirmed()
        {
            if (_granting) return;
            _granting = true;
            if (_confirmButton != null) _confirmButton.interactable = false;
            SetStatus(GrantingStatus);
        }

        private void OnGranted()
        {
            Close();
            _onCompleted.Invoke();
        }

        private void OnGrantFailed(Gs2Exception error, Func<IEnumerator>? retry)
        {
            Close();
            _onFailed.Invoke(error, retry);
        }

        /// <summary>
        /// Builds the panel: a canvas of its own above the page, a backdrop
        /// that swallows every press meant for the page beneath it, and the
        /// card.
        ///
        /// Built in code rather than authored, because the page's own content
        /// is cleared and re-created on every bake and anything authored
        /// outside it would hold references that a bake quietly breaks. None
        /// of this is ever written to the scene.
        /// </summary>
        private void BuildOverlay(Button row)
        {
            var font = PageFont(row);

            var overlay = new GameObject(
                "AdBreakOverlay", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            _overlay = overlay;

            var canvas = overlay.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = OverlaySortingOrder;

            // The page's own canvas scales against this, so the break is the
            // same size on a phone as the rows behind it.
            var scaler = overlay.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1080f, 1920f);
            scaler.matchWidthOrHeight = 0.5f;

            var backdrop = NewRect("Backdrop", overlay.transform);
            Stretch(backdrop);
            var backdropImage = backdrop.gameObject.AddComponent<Image>();
            backdropImage.color = PageBackdrop;
            // Presses meant for the page are the whole point of a placement
            // that covers it, so the backdrop takes them and does nothing.
            backdropImage.raycastTarget = true;

            var card = NewRect("Card", backdrop);
            card.anchorMin = new Vector2(0.5f, 0.5f);
            card.anchorMax = new Vector2(0.5f, 0.5f);
            card.pivot = new Vector2(0.5f, 0.5f);
            card.sizeDelta = new Vector2(CardWidth, CardHeight);
            card.anchoredPosition = Vector2.zero;
            card.gameObject.AddComponent<Image>().color = CardBackground;

            var heading = AddText(card, "Heading", font, Heading, 42, Accent, TextAnchor.UpperLeft);
            Band((RectTransform)heading.transform, 48f, 60f, CardPadding + 190f);

            var rule = NewRect("Rule", card);
            Band(rule, 124f, 2f);
            var ruleImage = rule.gameObject.AddComponent<Image>();
            ruleImage.color = new Color(MutedText.r, MutedText.g, MutedText.b, 0.3f);
            ruleImage.raycastTarget = false;

            var body = AddText(card, "Body", font, Body, 28, PrimaryText, TextAnchor.UpperLeft);
            Band((RectTransform)body.transform, 156f, 500f);

            _statusText = AddText(card, "Status", font, "", 28, MutedText, TextAnchor.MiddleCenter);
            Band((RectTransform)_statusText.transform, 672f, 52f);

            _confirmButton = AddButton(card, "Confirm", font, ConfirmLabel, Accent, OnAccentText, 32);
            Band((RectTransform)_confirmButton.transform, 740f, 112f);
            _confirmButton.interactable = false;

            // A way out that grants nothing. The panel needs one: the generated
            // press reports a GS2 failure and any other kind only to the
            // console, and a visitor who pressed before the page had signed in
            // would otherwise be left looking at a panel that never closes.
            var close = AddButton(card, "Close", font, CloseLabel, CardBackground, MutedText, 26);
            var closeRect = (RectTransform)close.transform;
            closeRect.anchorMin = new Vector2(1f, 1f);
            closeRect.anchorMax = new Vector2(1f, 1f);
            closeRect.pivot = new Vector2(1f, 1f);
            closeRect.sizeDelta = new Vector2(160f, 60f);
            closeRect.anchoredPosition = new Vector2(-CardPadding, -CardPadding);
            close.onClick.AddListener(Close);

            overlay.SetActive(false);
        }

        /// <summary>
        /// The page's font, taken from the row's own button rather than named.
        /// Every piece of text on the page is authored in the template, so
        /// there is one to copy and no way for the panel to drift from it.
        /// </summary>
        private static Font PageFont(Button row)
        {
            var label = row.GetComponentInChildren<Text>(true);
            if (label != null && label.font != null) return label.font;
            return Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        }

        private static RectTransform NewRect(string name, Transform parent)
        {
            var created = new GameObject(name, typeof(RectTransform));
            var rect = (RectTransform)created.transform;
            rect.SetParent(parent, false);
            return rect;
        }

        private static void Stretch(RectTransform rect)
        {
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.one;
            rect.offsetMin = Vector2.zero;
            rect.offsetMax = Vector2.zero;
        }

        /// <summary>
        /// One band across the card: the card's width less its padding,
        /// `height` tall, `top` below the card's top edge.
        /// </summary>
        private static void Band(RectTransform rect, float top, float height, float rightPadding = CardPadding)
        {
            rect.anchorMin = new Vector2(0f, 1f);
            rect.anchorMax = new Vector2(1f, 1f);
            rect.pivot = new Vector2(0.5f, 1f);
            rect.offsetMin = new Vector2(CardPadding, -top - height);
            rect.offsetMax = new Vector2(-rightPadding, -top);
        }

        private static Text AddText(
            Transform parent, string name, Font font, string content, int size, Color color,
            TextAnchor alignment)
        {
            var rect = NewRect(name, parent);
            var text = rect.gameObject.AddComponent<Text>();
            text.font = font;
            text.fontSize = size;
            text.color = color;
            text.alignment = alignment;
            text.horizontalOverflow = HorizontalWrapMode.Wrap;
            text.verticalOverflow = VerticalWrapMode.Overflow;
            text.lineSpacing = 1.2f;
            text.supportRichText = false;
            text.raycastTarget = false;
            text.text = content;
            return text;
        }

        private static Button AddButton(
            Transform parent, string name, Font font, string label, Color background,
            Color labelColor, int size)
        {
            var rect = NewRect(name, parent);
            var image = rect.gameObject.AddComponent<Image>();
            image.color = background;
            var button = rect.gameObject.AddComponent<Button>();
            button.targetGraphic = image;
            var text = AddText(rect, "Label", font, label, size, labelColor, TextAnchor.MiddleCenter);
            Stretch((RectTransform)text.transform);
            return button;
        }

        private void SetStatus(string status)
        {
            if (_statusText != null) _statusText.text = status;
        }

        /// <summary>
        /// Puts a wiring failure where both a developer and a visitor can see
        /// it. Reflection and a baked reference both fail by being absent, and
        /// a browser hides the console, so neither record is enough on its own.
        /// </summary>
        private void Report(string message)
        {
            Debug.LogError($"{nameof(AdBreakButton)} on '{name}': {message}", this);
            _page ??= FindAnyObjectByType<ShowroomPage>();
            if (_page != null) _page.Log(message);
        }
    }
}
