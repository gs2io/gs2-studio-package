// A hand-drawn region that is rebuilt only when what it shows changed.
//
// A panel that draws its own rows (a lobby, a board) redraws whenever
// something it watches reports, and most reports change nothing visible. A
// redraw that destroys and recreates every row replaces the button under the
// visitor's cursor with an identical one, can swallow a click in flight, and
// moves nothing while still looking like the page moved.
//
// So a draw first describes the region (captions and presses, in order), and
// the description's signature is compared with the one drawn last:
// - The same: nothing is rebuilt. Each existing button is given the press
//   the new description holds at its place, because a press's action may
//   close over fresher state than the one it replaced.
// - Different: the region is cleared and built anew, and the page is told
//   it moved (`ShowroomSettle.MarkChanged`), so a press in the next moment
//   waits rather than landing on a row that just slid under the cursor.
//
// A press drawn here waits for the page to settle before it runs its action.
//
// Main thread only.
#nullable enable

using System;
using System.Collections.Generic;
using System.Text;

using UnityEngine;
using UnityEngine.UI;

namespace GS2Studio.Showroom
{
    /// <summary>Draws captions and presses into a region, rebuilding only on change.</summary>
    public sealed class ShowroomRegion
    {
        private readonly RectTransform _parent;
        private readonly Button _buttonTemplate;
        private readonly Font _font;
        private readonly List<Action> _actions = new List<Action>();
        private string? _shown;

        /// <param name="parent">The region; everything under it belongs to this.</param>
        /// <param name="buttonTemplate">The page's button, copied for every press.</param>
        /// <param name="font">The font every caption is drawn in.</param>
        public ShowroomRegion(RectTransform parent, Button buttonTemplate, Font font)
        {
            _parent = parent != null ? parent : throw new ArgumentNullException(nameof(parent));
            _buttonTemplate = buttonTemplate != null ? buttonTemplate : throw new ArgumentNullException(nameof(buttonTemplate));
            _font = font != null ? font : throw new ArgumentNullException(nameof(font));
        }

        /// <summary>
        /// Describes the region with <paramref name="describe"/> and shows it:
        /// rebuilt when it differs from what is shown, otherwise only the
        /// presses' actions are replaced. Returns whether it was rebuilt.
        /// </summary>
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

        /// <summary>Empties the region; the next draw builds it whatever it describes.</summary>
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
                // Detached first: Destroy waits for the end of the frame, and a
                // layout rebuilt in between would still count the old rows.
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
                // The action at this place now, not the one drawn first.
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

        /// <summary>What one draw puts in the region, in order.</summary>
        public sealed class Description
        {
            internal readonly List<Entry> Entries = new List<Entry>();

            internal Description()
            {
            }

            /// <summary>A line of text.</summary>
            public Description Caption(string text, int size, Color color)
            {
                Entries.Add(new Entry(text ?? "", size, color, null));
                return this;
            }

            /// <summary>A button with <paramref name="text"/> that runs <paramref name="onClick"/>.</summary>
            public Description Press(string text, Action onClick)
            {
                if (onClick == null) throw new ArgumentNullException(nameof(onClick));
                Entries.Add(new Entry(text ?? "", 0, default, onClick));
                return this;
            }

            /// <summary>Everything the region shows, as one comparable value.</summary>
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
                    // Length-prefixed, so no text can forge a boundary.
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
