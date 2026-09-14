// uGUI construction helpers. The demo builds its interface in code so a new
// feature package needs no hand-authored scene or prefab.
#nullable disable
using UnityEngine;
using UnityEngine.UI;

namespace GS2Studio.Showroom
{
    public static class ShowroomUi
    {
        public static readonly Color Background = new Color(0.071f, 0.063f, 0.098f);
        public static readonly Color Surface = new Color(0.102f, 0.090f, 0.145f);
        public static readonly Color Line = new Color(0.176f, 0.153f, 0.251f);
        public static readonly Color Ink = new Color(0.922f, 0.910f, 0.949f);
        public static readonly Color Muted = new Color(0.643f, 0.616f, 0.729f);
        public static readonly Color Accent = new Color(0.643f, 0.549f, 1f);

        private static Font _font;

        public static Font Font =>
            _font != null ? _font : (_font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"));

        public static GameObject CreateCanvas(string name)
        {
            var canvasObject = new GameObject(
                name,
                typeof(Canvas),
                typeof(CanvasScaler),
                typeof(GraphicRaycaster)
            );
            var canvas = canvasObject.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasObject.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1024f, 768f);
            scaler.matchWidthOrHeight = 0.5f;
            return canvasObject;
        }

        public static RectTransform CreateRect(string name, Transform parent)
        {
            var child = new GameObject(name, typeof(RectTransform));
            child.transform.SetParent(parent, false);
            return (RectTransform)child.transform;
        }

        public static Image CreatePanel(string name, Transform parent, Color color)
        {
            var rect = CreateRect(name, parent);
            var image = rect.gameObject.AddComponent<Image>();
            image.color = color;
            return image;
        }

        public static VerticalLayoutGroup AddVerticalLayout(
            GameObject target,
            int padding,
            float spacing
        )
        {
            var layout = target.AddComponent<VerticalLayoutGroup>();
            layout.padding = new RectOffset(padding, padding, padding, padding);
            layout.spacing = spacing;
            layout.childControlWidth = true;
            // The group owns child height so nested panels stack instead of
            // overlapping; only the scroll content sizes itself.
            layout.childControlHeight = true;
            layout.childForceExpandWidth = true;
            layout.childForceExpandHeight = false;
            return layout;
        }

        public static Text CreateText(
            string name,
            Transform parent,
            string content,
            int fontSize,
            Color color,
            FontStyle style = FontStyle.Normal
        )
        {
            var rect = CreateRect(name, parent);
            var text = rect.gameObject.AddComponent<Text>();
            text.font = Font;
            text.fontSize = fontSize;
            text.color = color;
            text.text = content;
            text.fontStyle = style;
            text.horizontalOverflow = HorizontalWrapMode.Wrap;
            text.verticalOverflow = VerticalWrapMode.Overflow;
            text.supportRichText = false;
            return text;
        }

        /// <summary>A label/value row: the caption on the left, the bound value on the right.</summary>
        public static Text CreateValueRow(Transform parent, string caption)
        {
            var row = CreateRect($"Row_{caption}", parent);
            var layout = row.gameObject.AddComponent<HorizontalLayoutGroup>();
            layout.spacing = 12f;
            layout.childControlWidth = true;
            layout.childControlHeight = true;
            layout.childForceExpandWidth = true;
            layout.childForceExpandHeight = false;
            row.gameObject.AddComponent<LayoutElement>().minHeight = 26f;

            var captionText = CreateText("Caption", row, caption, 18, Muted);
            captionText.alignment = TextAnchor.MiddleLeft;

            var valueText = CreateText("Value", row, "-", 18, Ink, FontStyle.Bold);
            valueText.alignment = TextAnchor.MiddleRight;
            return valueText;
        }

        /// <summary>A titled panel that a demo fills with rows and buttons.</summary>
        public static Transform CreateSection(Transform parent, string title)
        {
            var panel = CreatePanel($"Section_{title}", parent, Surface);
            AddVerticalLayout(panel.gameObject, 16, 8f);
            CreateText("Heading", panel.transform, title, 20, Accent, FontStyle.Bold);
            return panel.transform;
        }

        public static Button CreateButton(Transform parent, string label, UnityEngine.Events.UnityAction onClick)
        {
            var button = CreateButton(parent, label);
            button.onClick.AddListener(onClick);
            return button;
        }

        private static Button CreateButton(Transform parent, string label)
        {
            var rect = CreateRect($"Button_{label}", parent);
            var image = rect.gameObject.AddComponent<Image>();
            image.color = Accent;
            var button = rect.gameObject.AddComponent<Button>();
            button.targetGraphic = image;
            var element = rect.gameObject.AddComponent<LayoutElement>();
            element.minHeight = 32f;
            element.preferredHeight = 32f;

            var text = CreateText("Label", rect, label, 16, Background, FontStyle.Bold);
            text.alignment = TextAnchor.MiddleCenter;
            StretchToParent((RectTransform)text.transform);
            return button;
        }

        public static ScrollRect CreateScrollView(string name, Transform parent)
        {
            var viewport = CreatePanel(name, parent, new Color(0f, 0f, 0f, 0f));
            var scroll = viewport.gameObject.AddComponent<ScrollRect>();
            viewport.gameObject.AddComponent<RectMask2D>();
            scroll.horizontal = false;
            scroll.vertical = true;
            scroll.movementType = ScrollRect.MovementType.Clamped;
            scroll.scrollSensitivity = 24f;

            var content = CreateRect("Content", viewport.transform);
            content.anchorMin = new Vector2(0f, 1f);
            content.anchorMax = new Vector2(1f, 1f);
            content.pivot = new Vector2(0.5f, 1f);
            content.offsetMin = new Vector2(0f, 0f);
            content.offsetMax = new Vector2(0f, 0f);
            AddVerticalLayout(content.gameObject, 0, 12f);
            var fitter = content.gameObject.AddComponent<ContentSizeFitter>();
            fitter.verticalFit = ContentSizeFitter.FitMode.PreferredSize;

            scroll.viewport = (RectTransform)viewport.transform;
            scroll.content = content;
            return scroll;
        }

        public static void StretchToParent(RectTransform rect, float margin = 0f)
        {
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.one;
            rect.offsetMin = new Vector2(margin, margin);
            rect.offsetMax = new Vector2(-margin, -margin);
        }
    }
}
