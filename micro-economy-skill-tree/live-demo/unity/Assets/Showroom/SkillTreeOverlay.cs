// The panel a skill tree is read in.
//
// A tree is a picture, and a picture wants the screen rather than a band of a
// page that is otherwise a stack of one-line rows. It is also read against a
// balance — every box charges — so it is something a visitor opens, spends
// from, and puts away, which is a panel rather than a section.
//
// It follows the ad demo's `AdBreakOverlay`: a backdrop that swallows the page
// beneath it, a card on top of it, and its own screen-space canvas above the
// page's. Built in code and never written to the scene, for the same reason —
// the page's rows live under the content mount, a re-bake clears that mount,
// and anything authored outside it that referenced a generated component would
// go null the next time the page was baked, silently.
//
// What differs from the ad's panel is that this one holds something that
// changes size. A tree is as tall as it is deep, so the card is fitted to the
// board it was handed and the board scrolls when the card has run out of
// screen to grow into.
//
// The backdrop is a sibling of the card rather than its parent. It takes a
// press to dismiss the panel, and a press lands on the nearest handler above
// what was hit — so a card inside it would hand every press that missed a box
// to the backdrop, and the panel would close under the visitor's finger.
#nullable enable

using UnityEngine;
using UnityEngine.UI;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// A full-screen panel holding one skill tree: a heading, the balance the
    /// tree is bought with, a way out, and the board itself.
    ///
    /// Plain rather than a <see cref="MonoBehaviour"/>: the page draws rows
    /// from the behaviours a demo wrote, and this is not a row. The component
    /// that owns one drives it.
    /// </summary>
    internal sealed class SkillTreeOverlay
    {
        /// <summary>
        /// Above the page's own canvas, which sits at zero. The same order the
        /// ad demo's break uses; there is never more than one of either up.
        /// </summary>
        private const int OverlaySortingOrder = 100;

        private const float SideMargin = 36f;

        /// <summary>
        /// The least screen left above and below the card. What is left over
        /// after it is the most the card may grow to, so a tree deeper than
        /// that scrolls rather than running off the top of the window.
        /// </summary>
        private const float VerticalMargin = 60f;

        private const float CardPadding = 36f;

        /// <summary>
        /// How far below the card's top edge the board starts: the heading,
        /// the rule under it, and the balance line, with the padding above the
        /// heading and below the balance.
        /// </summary>
        private const float BodyTop = CardPadding + 116f;

        /// <summary>
        /// Enough for the heading block and a single row of boxes. A card
        /// shorter than this would be a panel with its own furniture and no
        /// room for what it was opened for.
        /// </summary>
        private const float MinimumCardHeight = BodyTop + 160f + CardPadding;

        /// <summary>
        /// What the card is fitted against before the canvas has been laid out
        /// once — the scaler's own reference height. Only the first frame of
        /// the first open can read a canvas with no rect yet, and a card that
        /// was briefly a little too tall is better than one that was zero.
        /// </summary>
        private const float AssumedCanvasHeight = 1920f;

        // The page's palette, so the panel reads as part of the page rather
        // than as something that landed on top of it.
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

        /// <summary>
        /// The height of the board this panel was last fitted to, so a balance
        /// arriving between two redraws does not re-fit the card to nothing.
        /// </summary>
        private float _boardHeight;

        /// <param name="font">
        /// The page's font, so the panel cannot drift from the text around it.
        /// Null falls back to Unity's built-in, which is what a page with no
        /// text to copy from would have given anyway.
        /// </param>
        public SkillTreeOverlay(Font? font)
        {
            _font = font ?? Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");

            _root = new GameObject(
                "SkillTreeOverlay", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            _canvasRect = (RectTransform)_root.transform;

            var canvas = _root.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = OverlaySortingOrder;

            // The page's own canvas scales against this, so the panel is the
            // same size on a phone as the rows behind it.
            var scaler = _root.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1080f, 1920f);
            scaler.matchWidthOrHeight = 0.5f;

            var backdrop = NewRect("Backdrop", _root.transform);
            Stretch(backdrop);
            var backdropImage = backdrop.gameObject.AddComponent<Image>();
            backdropImage.color = PageBackdrop;
            // Presses meant for the page are the point of a panel that covers
            // it, and a press on what the panel is not is a way out of it.
            backdropImage.raycastTarget = true;
            _backdropButton = backdrop.gameObject.AddComponent<Button>();
            _backdropButton.transition = Selectable.Transition.None;
            _backdropButton.targetGraphic = backdropImage;
            _backdropButton.onClick.AddListener(Close);

            // A sibling of the backdrop, drawn after it. See the file's note:
            // a card inside the backdrop would give it every press that did not
            // land on a box.
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

            // What the tree is bought from. It belongs on the panel because the
            // panel is where it is spent: a visitor who had to close the tree
            // to find out what a release left them is a visitor reading the
            // page in the wrong order.
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

            // The rest of the card, which is where the board goes. A mask
            // rather than a shorter card: the tree's own height is what decides
            // whether there is anything to scroll, and that is not known until
            // it has been drawn.
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

        /// <summary>
        /// Puts the board in the panel, as the thing the panel scrolls.
        ///
        /// The board keeps its own drawing entirely — this only says where it
        /// hangs and that its width is the panel's, which is what lets a box
        /// sit at a fraction of it.
        /// </summary>
        public void Mount(RectTransform board)
        {
            board.SetParent(_viewport, false);
            // Across the viewport, and hung from its top edge: the width is
            // the panel's, and the height is the board's own to declare.
            board.anchorMin = new Vector2(0f, 1f);
            board.anchorMax = new Vector2(1f, 1f);
            board.pivot = new Vector2(0.5f, 1f);
            board.sizeDelta = new Vector2(0f, board.sizeDelta.y);
            board.anchoredPosition = Vector2.zero;
            _scroll.content = board;
        }

        /// <summary>
        /// Sizes the card to the board it holds, up to what the screen leaves.
        /// Past that the card stops growing and the board scrolls inside it.
        /// </summary>
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

        /// <summary>
        /// What the tree is paid from, or nothing when the page has no wallet
        /// to read. Blank rather than a zero: a balance nobody could read is
        /// not a balance of none.
        /// </summary>
        public void SetBalance(string? balance)
        {
            _balanceText.text = balance ?? "";
        }

        public void Open()
        {
            if (_open) return;
            _open = true;
            _root.SetActive(true);
            // The card was last fitted against whatever the screen was then,
            // which a browser window is free to have changed since.
            FitTo(_boardHeight);
            // Back to the root of the tree. A panel reopened halfway down is a
            // panel that opened on the middle of something.
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
