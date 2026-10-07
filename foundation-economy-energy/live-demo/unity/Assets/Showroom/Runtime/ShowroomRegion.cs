// Rebuilding unchanged rows can swallow a click by replacing the button under the pointer.
// Use on the main thread because drawing and click handling access Unity objects.
#nullable enable

using System;
using System.Collections.Generic;
using System.Text;

using UnityEngine;
using UnityEngine.UI;

namespace GS2Studio.Showroom
{
    public sealed class ShowroomRegion
    {
        private readonly RectTransform _parent;
        private readonly Button _buttonTemplate;
        private readonly Font _font;
        private readonly List<Action> _actions = new List<Action>();
        private string? _shown;

        public ShowroomRegion(RectTransform parent, Button buttonTemplate, Font font)
        {
            _parent = parent != null ? parent : throw new ArgumentNullException(nameof(parent));
            _buttonTemplate = buttonTemplate != null ? buttonTemplate : throw new ArgumentNullException(nameof(buttonTemplate));
            _font = font != null ? font : throw new ArgumentNullException(nameof(font));
        }

        // Equal visuals can still carry callbacks that close over newer state; replace those callbacks.
        public bool Draw(Action<Description> describe)
        {
            if (describe == null) throw new ArgumentNullException(nameof(describe));
            var description = new Description();
            describe(description);
            var signature = description.Signature();
            if (signature == _shown)
            {
                _actions.Clear();
                foreach (var entry in description.Entries)
                {
                    if (entry.OnClick != null) _actions.Add(entry.OnClick);
                }
                return false;
            }
            Build(description);
            _shown = signature;
            ShowroomSettle.MarkChanged();
            return true;
        }

        public void Clear()
        {
            ClearChildren();
            _actions.Clear();
            _shown = null;
        }

        private void Build(Description description)
        {
            ClearChildren();
            _actions.Clear();
            foreach (var entry in description.Entries)
            {
                if (entry.OnClick != null) AddPress(entry.Text, entry.OnClick);
                else AddCaption(entry.Text, entry.Size, entry.Color);
            }
        }

        private void ClearChildren()
        {
            for (var i = _parent.childCount - 1; i >= 0; i--)
            {
                var child = _parent.GetChild(i).gameObject;
                // Destroy waits until frame end; detach first so layout no longer counts the old rows.
                child.transform.SetParent(null, false);
                UnityEngine.Object.Destroy(child);
            }
        }

        private void AddPress(string text, Action onClick)
        {
            var index = _actions.Count;
            _actions.Add(onClick);
            var button = UnityEngine.Object.Instantiate(_buttonTemplate, _parent);
            button.name = "Press";
            var label = button.GetComponentInChildren<Text>();
            if (label != null)
            {
                label.supportRichText = false;
                label.text = text;
            }
            button.onClick.RemoveAllListeners();
            button.onClick.AddListener(() =>
            {
                // Read the current callback rather than capturing the one from the first draw.
                if (index >= _actions.Count) return;
                if (!ShowroomSettle.Settled()) return;
                _actions[index]();
            });
        }

        private void AddCaption(string text, int size, Color color)
        {
            var caption = new GameObject("Caption", typeof(RectTransform)).GetComponent<RectTransform>();
            caption.SetParent(_parent, false);
            var label = caption.gameObject.AddComponent<Text>();
            label.font = _font;
            label.fontSize = size;
            label.color = color;
            label.supportRichText = false;
            label.text = text;
            caption.gameObject.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            caption.gameObject.AddComponent<LayoutElement>().minHeight = 24;
        }

        public sealed class Description
        {
            internal readonly List<Entry> Entries = new List<Entry>();

            internal Description()
            {
            }

            public Description Caption(string text, int size, Color color)
            {
                Entries.Add(new Entry(text ?? "", size, color, null));
                return this;
            }

            public Description Press(string text, Action onClick)
            {
                if (onClick == null) throw new ArgumentNullException(nameof(onClick));
                Entries.Add(new Entry(text ?? "", 0, default, onClick));
                return this;
            }

            internal string Signature()
            {
                var signature = new StringBuilder();
                foreach (var entry in Entries)
                {
                    if (entry.OnClick != null)
                    {
                        signature.Append("press:");
                    }
                    else
                    {
                        signature.Append("caption:").Append(entry.Size).Append(':')
                            .Append(ColorUtility.ToHtmlStringRGBA(entry.Color)).Append(':');
                    }
                    // Length prefixes prevent caption text from forging entry boundaries.
                    signature.Append(entry.Text.Length).Append(':').Append(entry.Text).Append('|');
                }
                return signature.ToString();
            }
        }

        internal readonly struct Entry
        {
            public readonly string Text;
            public readonly int Size;
            public readonly Color Color;
            public readonly Action? OnClick;

            public Entry(string text, int size, Color color, Action? onClick)
            {
                Text = text;
                Size = size;
                Color = color;
                OnClick = onClick;
            }
        }
    }
}
