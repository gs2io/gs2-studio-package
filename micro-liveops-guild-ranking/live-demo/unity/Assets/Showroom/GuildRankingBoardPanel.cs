// The visitor's guild's board for the season being played: the top places,
// best first. Members who left the guild keep their places, so a board can
// hold more than the ten members a guild has at once.
//
// A row of the page reads one value, and a board is a table, so this draws its
// own region. Every visitor is anonymous, so a place is named by a short tag
// made from the player's id rather than by anything a player wrote; the
// visitor's own place reads "You". Members of other guilds are on boards of
// their own: GS2 ranks the members of one guild against each other, never one
// guild against another.
#nullable enable

using System.Linq;

using UnityEngine;
using UnityEngine.UI;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>Draws the guild's board into the region the page gives it.</summary>
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

        /// <summary>What the board was last drawn from; null before the first draw.</summary>
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
                // Only the top places are read, and members who left keep
                // theirs, so a visitor who scored can be below them; their own
                // place is added under the board. It also covers a read that
                // raced a play.
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

            // Drawn again only when what it shows changed: a row that appears
            // or vanishes moves every button below the board, and presses wait
            // for that.
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
                // Destroy waits for the end of the frame, and until then a
                // layout group still counts the child; an inactive one it
                // skips.
                var child = parent.GetChild(index).gameObject;
                child.SetActive(false);
                Destroy(child);
            }
        }
    }
}
