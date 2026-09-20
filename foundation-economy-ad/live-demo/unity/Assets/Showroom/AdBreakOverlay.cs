// The panel an ad break puts on the screen, and the wait in front of it.
//
// A rewarded view is two halves. One is the placement: an ad SDK fills the
// screen, plays something, and calls back when the view completed. The other
// is whatever the title does with that callback — grant a point, hand out a
// continue, lift a limit for one more try.
//
// A demo in a browser has only the second half and cannot have the first: the
// ad networks GS2 accepts do not reach one. Unity Ads supports iOS and Android
// only, as does the LevelPlay mediation that replaced it, and AdMob is
// mobile-only too. So this stands where the placement would be and says so —
// the shape of an ad break with the ad missing, and a press that stands for
// the network's completion callback.
//
// It is here rather than in the row that opens it because more than one row
// wants it: one banks a view, another spends one, and a panel that said
// different things in two copies would be two demos of the same thing. What
// differs between them is the prose and what the confirming press is wired to,
// so that is all a caller passes.
//
// Built in code and never written to the scene. The page's rows live under the
// content mount and a re-bake clears that mount, so anything authored outside
// it that referenced a generated component would go null the next time the
// page was baked, silently.
#nullable enable

using UnityEngine;
using UnityEngine.UI;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// A full-screen ad break: a backdrop that swallows the page beneath it, a
    /// card that explains why nothing is playing, a wait, and a press that says
    /// the placement finished.
    ///
    /// Plain rather than a <see cref="MonoBehaviour"/>: the page draws rows
    /// from the behaviours a demo wrote, and this is not a row. The row that
    /// owns one drives it — <see cref="Tick"/> from its `Update`,
    /// <see cref="Destroy"/> from its `OnDestroy`.
    /// </summary>
    internal sealed class AdBreakOverlay
    {
        /// <summary>
        /// How long the panel stays before it can be dismissed for its reward.
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

        /// <summary>
        /// Short enough to survive a browser window that is wider than it is
        /// tall. The canvas scales against 1080x1920 at a match of 0.5, so a
        /// 1920x700 viewport — a laptop with a bookmarks bar — leaves only 870
        /// of these units of height, and a card taller than that loses its
        /// heading and its button off-screen with no way to scroll to them.
        /// </summary>
        private const float CardHeight = 724f;

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
        private const string ConfirmLabel = "I finished watching";
        private const string CloseLabel = "Close";

        /// <summary>
        /// What every break says about why nothing is playing. The caller adds
        /// what its own press then does, because that is the half the demo is
        /// actually about and it differs from row to row.
        /// </summary>
        public const string MissingPlacementBody =
            "Nothing is playing here. A rewarded placement would fill this panel in a shipped " +
            "title, and this demo has none to show: the ad SDKs GS2 accepts are mobile-only — " +
            "Unity Ads, the LevelPlay mediation that replaced it, and AdMob — and the showroom " +
            "is a WebGL player.";

        private readonly GameObject _root;
        private readonly Button _confirmButton;
        private readonly Button _closeButton;
        private readonly Text _statusText;
        private readonly string _readyStatus;

        private bool _open;
        private bool _ready;

        /// <summary>
        /// When the wait is up, on the clock that measures seconds rather than
        /// frames. A browser stops drawing a tab it is not showing, and
        /// `Time.deltaTime` is clamped to `Time.maximumDeltaTime`, so counting
        /// frames down would leave a visitor who looked away still waiting for
        /// a wait that had already passed.
        /// </summary>
        private float _readyAt;

        /// <param name="row">
        /// The button that opens this break. Read for the page's font, so the
        /// panel cannot drift from the text around it.
        /// </param>
        /// <param name="body">What the card says, above the wait.</param>
        /// <param name="readyStatus">What it says once the wait is up.</param>
        public AdBreakOverlay(Button row, string body, string readyStatus)
        {
            _readyStatus = readyStatus;
            var font = PageFont(row);

            _root = new GameObject(
                "AdBreakOverlay", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));

            var canvas = _root.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = OverlaySortingOrder;

            // The page's own canvas scales against this, so the break is the
            // same size on a phone as the rows behind it.
            var scaler = _root.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1080f, 1920f);
            scaler.matchWidthOrHeight = 0.5f;

            var backdrop = NewRect("Backdrop", _root.transform);
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
            Band((RectTransform)heading.transform, 44f, 56f, CardPadding + 190f);

            var rule = NewRect("Rule", card);
            Band(rule, 112f, 2f);
            var ruleImage = rule.gameObject.AddComponent<Image>();
            ruleImage.color = new Color(MutedText.r, MutedText.g, MutedText.b, 0.3f);
            ruleImage.raycastTarget = false;

            // The band is 360 against a measured 299 the longest body needs at
            // this size, so a font whose metrics differ from the editor's has
            // two spare lines before it would spill over the status line.
            var bodyText = AddText(card, "Body", font, body, 24, PrimaryText, TextAnchor.UpperLeft);
            Band((RectTransform)bodyText.transform, 140f, 360f);

            _statusText = AddText(card, "Status", font, "", 24, MutedText, TextAnchor.MiddleCenter);
            Band((RectTransform)_statusText.transform, 516f, 48f);

            _confirmButton = AddButton(card, "Confirm", font, ConfirmLabel, Accent, OnAccentText, 32);
            Band((RectTransform)_confirmButton.transform, 580f, 100f);
            _confirmButton.interactable = false;

            // A way out that pays nothing. The panel needs one: a press that
            // fails for a reason the page cannot show would otherwise leave a
            // visitor looking at a panel that never closes.
            _closeButton = AddButton(card, "Close", font, CloseLabel, CardBackground, MutedText, 26);
            var closeRect = (RectTransform)_closeButton.transform;
            closeRect.anchorMin = new Vector2(1f, 1f);
            closeRect.anchorMax = new Vector2(1f, 1f);
            closeRect.pivot = new Vector2(1f, 1f);
            closeRect.sizeDelta = new Vector2(160f, 60f);
            closeRect.anchoredPosition = new Vector2(-CardPadding, -CardPadding);
            _closeButton.onClick.AddListener(Close);

            _root.SetActive(false);
        }

        /// <summary>
        /// The press that means the placement finished. Whatever a row does
        /// with a completed view hangs off this one, so the break itself never
        /// pays and no other way out of the panel can.
        /// </summary>
        public Button ConfirmButton => _confirmButton;

        public bool IsOpen => _open;

        /// <summary>Starts the break, and the wait in front of its reward.</summary>
        public void Open()
        {
            if (_open) return;
            _open = true;
            _ready = false;
            _readyAt = Time.realtimeSinceStartup + DwellSeconds;
            _confirmButton.interactable = false;
            SetStatus($"You can continue in {Mathf.CeilToInt(DwellSeconds)}s.");
            _root.SetActive(true);
        }

        /// <summary>Puts the panel away. Closing it is only closing it.</summary>
        public void Close()
        {
            _open = false;
            _root.SetActive(false);
        }

        /// <summary>
        /// Counts the wait down. Called from the owning row's `Update`; does
        /// nothing once the wait is up, so a status the row writes afterwards
        /// stays written.
        /// </summary>
        public void Tick()
        {
            if (!_open || _ready) return;
            var remaining = _readyAt - Time.realtimeSinceStartup;
            if (remaining > 0f)
            {
                SetStatus($"You can continue in {Mathf.CeilToInt(remaining)}s.");
                return;
            }
            _ready = true;
            _confirmButton.interactable = true;
            SetStatus(_readyStatus);
        }

        /// <summary>Holds the confirming press while what it asked for is out.</summary>
        public void SetBusy(string status)
        {
            _confirmButton.interactable = false;
            SetStatus(status);
        }

        public void SetStatus(string status)
        {
            _statusText.text = status;
        }

        public void Destroy()
        {
            _closeButton.onClick.RemoveListener(Close);
            UnityEngine.Object.Destroy(_root);
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
        private static void Band(
            RectTransform rect, float top, float height, float rightPadding = CardPadding)
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
    }
}
