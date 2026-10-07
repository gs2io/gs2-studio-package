// Build the overlay at runtime so rebaking page content cannot leave serialized references to destroyed rows.
#nullable enable

using UnityEngine;
using UnityEngine.UI;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>Keep this outside MonoBehaviour row discovery; the owning row drives its lifetime and updates.</summary>
    internal sealed class AdBreakOverlay
    {
        private const float DwellSeconds = 5f;

        private const int OverlaySortingOrder = 100;

        private const float CardWidth = 940f;

        /// <summary>Leave enough vertical room for the heading and controls in short, wide browser viewports.</summary>
        private const float CardHeight = 724f;

        private const float CardPadding = 56f;

        private static readonly Color PageBackdrop = new Color(0.071f, 0.063f, 0.098f, 0.93f);
        private static readonly Color CardBackground = new Color(0.102f, 0.09f, 0.145f, 1f);
        private static readonly Color Accent = new Color(0.643f, 0.549f, 1f, 1f);
        private static readonly Color PrimaryText = new Color(0.922f, 0.91f, 0.949f, 1f);
        private static readonly Color MutedText = new Color(0.643f, 0.616f, 0.729f, 1f);
        private static readonly Color OnAccentText = new Color(0.07f, 0.06f, 0.1f, 1f);

        private const string Heading = "Advertisement";
        private const string ConfirmLabel = "I finished watching";
        private const string CloseLabel = "Close";

        public const string MissingPlacementBody =
            "Nothing plays here: GS2's ad SDKs (Unity Ads, LevelPlay, AdMob) are mobile-only, " +
            "and this page runs in a browser.";

        private readonly GameObject _root;
        private readonly Button _confirmButton;
        private readonly Button _closeButton;
        private readonly Text _statusText;
        private readonly string _readyStatus;

        private bool _open;
        private bool _ready;

        /// <summary>Use an absolute realtime deadline so a background tab does not extend the wait through missed frames.</summary>
        private float _readyAt;

        public AdBreakOverlay(Button row, string body, string readyStatus)
        {
            _readyStatus = readyStatus;
            var font = PageFont(row);

            _root = new GameObject(
                "AdBreakOverlay", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));

            var canvas = _root.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = OverlaySortingOrder;

            // Match the page canvas scale so overlay controls retain the same visual size.
            var scaler = _root.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1080f, 1920f);
            scaler.matchWidthOrHeight = 0.5f;

            var backdrop = NewRect("Backdrop", _root.transform);
            Stretch(backdrop);
            var backdropImage = backdrop.gameObject.AddComponent<Image>();
            backdropImage.color = PageBackdrop;
            // Block clicks from reaching the page beneath the overlay.
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

            // Leave spare text height for fonts whose metrics differ from the editor font.
            var bodyText = AddText(card, "Body", font, body, 24, PrimaryText, TextAnchor.UpperLeft);
            Band((RectTransform)bodyText.transform, 140f, 360f);

            _statusText = AddText(card, "Status", font, "", 24, MutedText, TextAnchor.MiddleCenter);
            Band((RectTransform)_statusText.transform, 516f, 48f);

            _confirmButton = AddButton(card, "Confirm", font, ConfirmLabel, Accent, OnAccentText, 32);
            Band((RectTransform)_confirmButton.transform, 580f, 100f);
            _confirmButton.interactable = false;

            // Provide an exit independent of the confirming action so a failed action cannot trap the visitor.
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

        /// <summary>Expose only the confirmation trigger; the owning row decides what a completed view grants.</summary>
        public Button ConfirmButton => _confirmButton;

        public bool IsOpen => _open;

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

        public void Close()
        {
            _open = false;
            _root.SetActive(false);
        }

        /// <summary>Stop updating once ready so the owning row's later status message is not overwritten.</summary>
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

        /// <summary>Prefer the row's font so overlay text matches the surrounding page.</summary>
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
