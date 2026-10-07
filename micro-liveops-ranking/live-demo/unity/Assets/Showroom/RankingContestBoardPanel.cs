#nullable enable

using System.Linq;

using UnityEngine;
using UnityEngine.UI;

namespace GS2Studio.Showroom.Demo
{
    [AddComponentMenu("GS2 Studio/Showroom/Contest Board")]
    public sealed class RankingContestBoardPanel : MonoBehaviour
    {
        private static readonly Color RowColor = new Color(0.16f, 0.15f, 0.22f, 1f);
        private static readonly Color OwnRowColor = new Color(0.643f, 0.549f, 1f, 1f);
        private static readonly Color DarkText = new Color(0.07f, 0.06f, 0.1f, 1f);
        private static readonly Color LightText = new Color(0.922f, 0.91f, 0.949f, 1f);
        private static readonly Color MutedText = new Color(0.643f, 0.616f, 0.729f, 1f);

        [SerializeField] private RectTransform? _panel;
        [SerializeField] private Font? _font;

        private RectTransform? _rows;
        private Text? _hint;
        private RankingContestState? _contest;

        private void OnEnable()
        {
            if (_panel == null || _font == null)
            {
                ShowroomLog.Say("The contest board was baked without its region or font.");
                return;
            }
            if (_rows == null) Build();
            _contest = RankingContestState.Shared;
            _contest.Updated += Draw;
            Draw();
        }

        private void OnDisable()
        {
            if (_contest != null) _contest.Updated -= Draw;
        }

        private void Build()
        {
            _rows = Child("Rows", _panel!);
            var layout = _rows.gameObject.AddComponent<VerticalLayoutGroup>();
            layout.spacing = 6;
            layout.childControlWidth = true;
            layout.childControlHeight = true;
            layout.childForceExpandWidth = true;
            layout.childForceExpandHeight = false;
            _hint = Caption("Reading the board...");
        }

        private void Draw()
        {
            if (_rows == null || _hint == null || _contest == null || !_contest.HasValue) return;
            Clear(_rows);

            // The personal score and board can describe different moments; merge the personal row for immediate local feedback.
            // Renumbering this mixed snapshot is a display adjustment, not proof of current server ranks.
            var board = _contest.Board;
            var places = board
                .Where(place => place.UserId != _contest.UserId)
                .Select(place => (rank: place.Rank, name: ShowroomPlayerTag.Of(place.UserId), score: place.Score, own: false))
                .ToList();
            var best = _contest.Best;
            if (best != null && (_contest.Rank ?? int.MaxValue) <= RankingContestState.BoardSize)
            {
                var at = places.FindIndex(place => (place.score ?? long.MinValue) < best);
                places.Insert(at < 0 ? places.Count : at, (rank: null, name: "You", score: best, own: true));
                // Trim another row so immediate feedback never removes the player's own updated score.
                while (places.Count > RankingContestState.BoardSize)
                {
                    places.RemoveAt(places.FindLastIndex(place => !place.own));
                }
                places = places
                    .Select((place, index) => (rank: (int?)(index + 1), place.name, place.score, place.own))
                    .ToList();
            }
            else if (best != null)
            {
                places.Add((rank: _contest.Rank, name: "You", score: best, own: true));
            }
            foreach (var place in places)
            {
                Row(place.rank, place.name, place.score, place.own);
            }

            _hint.text = board.Length == 0 && _contest.Best == null
                ? "No one is on the board yet. Start a contest and play to be the first."
                : "Other visitors' new scores can take a few minutes to appear.";
        }

        private void Row(int? rank, string name, long? score, bool own)
        {
            var row = Child("Place", _rows!);
            var background = row.gameObject.AddComponent<Image>();
            background.color = own ? OwnRowColor : RowColor;
            var layout = row.gameObject.AddComponent<HorizontalLayoutGroup>();
            layout.padding = new RectOffset(16, 16, 0, 0);
            layout.spacing = 12;
            layout.childControlWidth = true;
            layout.childControlHeight = true;
            layout.childForceExpandWidth = false;
            layout.childForceExpandHeight = true;
            row.gameObject.AddComponent<LayoutElement>().minHeight = 40;

            var textColor = own ? DarkText : LightText;
            Cell(row, rank != null ? $"#{rank}" : "-", textColor, TextAnchor.MiddleLeft, 72, 0);
            Cell(row, name, textColor, TextAnchor.MiddleLeft, 0, 1);
            Cell(row, score?.ToString() ?? "", textColor, TextAnchor.MiddleRight, 96, 0);
        }

        private void Cell(RectTransform row, string text, Color color, TextAnchor anchor, float width, float flexible)
        {
            var cell = Child("Cell", row);
            var label = cell.gameObject.AddComponent<Text>();
            label.font = _font;
            label.fontSize = 18;
            label.color = color;
            label.alignment = anchor;
            label.text = text;
            var element = cell.gameObject.AddComponent<LayoutElement>();
            if (width > 0) element.preferredWidth = width;
            element.flexibleWidth = flexible;
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

        private static void Clear(RectTransform parent)
        {
            for (var index = parent.childCount - 1; index >= 0; index--)
            {
                // Deactivate before deferred destruction so the layout stops counting rows being replaced.
                var child = parent.GetChild(index).gameObject;
                child.SetActive(false);
                Destroy(child);
            }
        }
    }
}
