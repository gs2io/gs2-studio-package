#nullable enable

using UnityEngine;
using UnityEngine.UI;

namespace GS2Studio.Showroom.Demo
{
    internal sealed class SkillTreeOverlay
    {
        private const int OverlaySortingOrder = 100;

        private const float SideMargin = 36f;

        // Reserve space around the card so deeper trees scroll inside the viewport.
        private const float VerticalMargin = 60f;

        private const float CardPadding = 36f;

        private const float BodyTop = CardPadding + 116f;

        // Keep room for a node row even when the board is empty.
        private const float MinimumCardHeight = BodyTop + 160f + CardPadding;

        // Use the scaler reference height until the canvas has a nonzero layout size.
        private const float AssumedCanvasHeight = 1920f;

        private static readonly Color PageBackdrop = new Color(0.071f, 0.063f, 0.098f, 0.93f);
        private static readonly Color CardBackground = new Color(0.102f, 0.09f, 0.145f, 1f);
        private static readonly Color Accent = new Color(0.643f, 0.549f, 1f, 1f);
        private static readonly Color MutedText = new Color(0.643f, 0.616f, 0.729f, 1f);

        private const string Heading = "Skill tree";
        private const string CloseLabel = "Close";

        private readonly GameObject _root;
        private readonly RectTransform _canvasRect;
        private readonly RectTransform _card;
        private readonly RectTransform _viewport;
        private readonly ScrollRect _scroll;
        private readonly Button _backdropButton;
        private readonly Button _closeButton;
        private readonly Text _balanceText;
        private readonly Font _font;

        private bool _open;

        // Retain board height so reopening can refit after a window resize without waiting for another redraw.
        private float _boardHeight;

        public SkillTreeOverlay(Font? font)
        {
            _font = font ?? Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");

            _root = new GameObject(
                "SkillTreeOverlay", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            _canvasRect = (RectTransform)_root.transform;

            var canvas = _root.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = OverlaySortingOrder;

            // Match the page scaler so the modal and the rows behind it scale together.
            var scaler = _root.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1080f, 1920f);
            scaler.matchWidthOrHeight = 0.5f;

            var backdrop = NewRect("Backdrop", _root.transform);
            Stretch(backdrop);
            var backdropImage = backdrop.gameObject.AddComponent<Image>();
            backdropImage.color = PageBackdrop;
            backdropImage.raycastTarget = true;
            _backdropButton = backdrop.gameObject.AddComponent<Button>();
            _backdropButton.transition = Selectable.Transition.None;
            _backdropButton.targetGraphic = backdropImage;
            _backdropButton.onClick.AddListener(Close);

            // Keep the card beside the backdrop; nesting it would send otherwise unhandled card clicks to the dismiss button.
            _card = NewRect("Card", _root.transform);
            _card.anchorMin = new Vector2(0f, 0.5f);
            _card.anchorMax = new Vector2(1f, 0.5f);
            _card.pivot = new Vector2(0.5f, 0.5f);
            _card.offsetMin = new Vector2(SideMargin, 0f);
            _card.offsetMax = new Vector2(-SideMargin, 0f);
            _card.sizeDelta = new Vector2(_card.sizeDelta.x, MinimumCardHeight);
            _card.gameObject.AddComponent<Image>().color = CardBackground;

            var heading = AddText(_card, "Heading", Heading, 38, Accent, TextAnchor.UpperLeft);
            Band((RectTransform)heading.transform, CardPadding, 44f, CardPadding + 190f);

            var rule = NewRect("Rule", _card);
            Band(rule, CardPadding + 58f, 2f);
            var ruleImage = rule.gameObject.AddComponent<Image>();
            ruleImage.color = new Color(MutedText.r, MutedText.g, MutedText.b, 0.3f);
            ruleImage.raycastTarget = false;

            // Show the wallet here so checking the balance does not require closing the tree.
            _balanceText = AddText(_card, "Balance", "", 20, MutedText, TextAnchor.UpperLeft);
            Band((RectTransform)_balanceText.transform, CardPadding + 76f, 26f);

            _closeButton = AddButton(_card, "Close", CloseLabel, CardBackground, MutedText, 24);
            var closeRect = (RectTransform)_closeButton.transform;
            closeRect.anchorMin = new Vector2(1f, 1f);
            closeRect.anchorMax = new Vector2(1f, 1f);
            closeRect.pivot = new Vector2(1f, 1f);
            closeRect.sizeDelta = new Vector2(160f, 56f);
            closeRect.anchoredPosition = new Vector2(-CardPadding, -CardPadding);
            _closeButton.onClick.AddListener(Close);

            // Clip and scroll the board because its depth is known only after the nodes arrive.
            _viewport = NewRect("Viewport", _card);
            _viewport.anchorMin = new Vector2(0f, 0f);
            _viewport.anchorMax = new Vector2(1f, 1f);
            _viewport.pivot = new Vector2(0.5f, 1f);
            _viewport.offsetMin = new Vector2(CardPadding, CardPadding);
            _viewport.offsetMax = new Vector2(-CardPadding, -BodyTop);
            _viewport.gameObject.AddComponent<RectMask2D>();

            _scroll = _card.gameObject.AddComponent<ScrollRect>();
            _scroll.viewport = _viewport;
            _scroll.horizontal = false;
            _scroll.vertical = true;
            _scroll.movementType = ScrollRect.MovementType.Clamped;
            _scroll.scrollSensitivity = 40f;

            _root.SetActive(false);
        }

        public bool IsOpen => _open;

        public void Mount(RectTransform board)
        {
            board.SetParent(_viewport, false);
            board.anchorMin = new Vector2(0f, 1f);
            board.anchorMax = new Vector2(1f, 1f);
            board.pivot = new Vector2(0.5f, 1f);
            board.sizeDelta = new Vector2(0f, board.sizeDelta.y);
            board.anchoredPosition = Vector2.zero;
            _scroll.content = board;
        }

        public void FitTo(float boardHeight)
        {
            _boardHeight = boardHeight;
            var available = _canvasRect.rect.height;
            if (available <= 0f) available = AssumedCanvasHeight;
            var ceiling = Mathf.Max(MinimumCardHeight, available - VerticalMargin * 2f);
            var wanted = BodyTop + boardHeight + CardPadding;
            _card.sizeDelta = new Vector2(
                _card.sizeDelta.x, Mathf.Clamp(wanted, MinimumCardHeight, ceiling));
        }

        // An unread balance is unknown, not zero; leave it blank.
        public void SetBalance(string? balance)
        {
            _balanceText.text = balance ?? "";
        }

        public void Open()
        {
            if (_open) return;
            _open = true;
            _root.SetActive(true);
            // The window may have resized while this panel was closed.
            FitTo(_boardHeight);
            // Reopen at the tree root rather than retaining a scroll position in the middle.
            if (_scroll.content != null) _scroll.verticalNormalizedPosition = 1f;
        }

        public void Close()
        {
            _open = false;
            _root.SetActive(false);
        }

        public void Destroy()
        {
            _backdropButton.onClick.RemoveListener(Close);
            _closeButton.onClick.RemoveListener(Close);
            UnityEngine.Object.Destroy(_root);
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

        private Text AddText(
            Transform parent, string name, string content, int size, Color color,
            TextAnchor alignment)
        {
            var rect = NewRect(name, parent);
            var text = rect.gameObject.AddComponent<Text>();
            text.font = _font;
            text.fontSize = size;
            text.color = color;
            text.alignment = alignment;
            text.horizontalOverflow = HorizontalWrapMode.Wrap;
            text.verticalOverflow = VerticalWrapMode.Overflow;
            text.supportRichText = false;
            text.raycastTarget = false;
            text.text = content;
            return text;
        }

        private Button AddButton(
            Transform parent, string name, string label, Color background, Color labelColor,
            int size)
        {
            var rect = NewRect(name, parent);
            var image = rect.gameObject.AddComponent<Image>();
            image.color = background;
            var button = rect.gameObject.AddComponent<Button>();
            button.targetGraphic = image;
            var text = AddText(rect, "Label", label, size, labelColor, TextAnchor.MiddleCenter);
            Stretch((RectTransform)text.transform);
            return button;
        }
    }
}
