#nullable enable

using System.Linq;

using UnityEngine;
using UnityEngine.UI;

namespace GS2Studio.Showroom.Demo
{
    [AddComponentMenu("GS2 Studio/Showroom/Guild Season Board")]
    public sealed class GuildRankingBoardPanel : MonoBehaviour
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
        private GuildRankingSeasonState? _season;

        private string? _shown;

        private void OnEnable()
        {
            if (_panel == null || _font == null)
            {
                ShowroomLog.Say("The guild board was baked without its region or font.");
                return;
            }
            if (_rows == null) Build();
            _season = GuildRankingSeasonState.Shared;
            _season.Updated += Draw;
            _shown = null;
            Draw();
        }

        private void OnDisable()
        {
            if (_season != null) _season.Updated -= Draw;
        }

        private void Build()
        {
            _rows = Child("Rows", _panel!);
            var rows = _rows.gameObject.AddComponent<VerticalLayoutGroup>();
            rows.spacing = 6;
            rows.childControlWidth = true;
            rows.childControlHeight = true;
            rows.childForceExpandWidth = true;
            rows.childForceExpandHeight = false;
            _hint = Caption("Reading the board...");
        }

        private void Draw()
        {
            if (_rows == null || _hint == null || _season == null) return;
            var season = _season;
            string hint;
            var places = season.Board
                .Select(place => (rank: place.Rank, name: place.UserId == season.UserId ? "You" : ShowroomPlayerTag.Of(place.UserId), score: place.Score, own: place.UserId == season.UserId))
                .ToList();
            if (!season.GuildKnown)
            {
                hint = "Reading the board...";
                places.Clear();
            }
            else if (season.GuildId == null)
            {
                hint = "Join a guild to see its board. Each guild has a board of its own.";
                places.Clear();
            }
            else if (season.Season == null)
            {
                hint = season.SeasonProblem ?? "Reading the season...";
                places.Clear();
            }
            else if (!season.StandingKnown)
            {
                hint = "Reading your guild's board...";
                places.Clear();
            }
            else
            {
                // The fetched board is truncated and may lag a play; append the personal standing when its row is absent.
                if (season.Total != null && places.All(place => !place.own))
                {
                    places.Add((rank: season.Rank, name: "You", score: season.Total, own: true));
                }
                hint = places.Count == 0
                    ? "No one in your guild has scored this season yet. Press Play to be the first."
                    : season.BoardHasMore
                        ? $"The top {GuildRankingSeasonState.BoardSize} places in your guild, including members who left. The board is read again every few seconds."
                        : "Only your guild's members, and members who left it, are ranked here. The board is read again every few seconds.";
            }

            // Skip unchanged draws so polling does not repeatedly restart the layout settle guard.
            var shown = hint + "|" + string.Join(";", places.Select(place => $"{place.rank}:{place.name}:{place.score}"));
            if (shown == _shown) return;
            _shown = shown;
            ShowroomSettle.MarkChanged();
            Clear(_rows);
            foreach (var place in places)
            {
                Row(place.rank, place.name, place.score, place.own);
            }
            _hint.text = hint;
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
            label.supportRichText = false;
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
            label.supportRichText = false;
            label.text = text;
            caption.gameObject.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;
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
