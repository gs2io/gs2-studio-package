// The tree, drawn as a tree.
//
// A page is a stack of rows, and a keyed model is a list of them: one row per
// node, each a line of text and a press. Four nodes drawn that way are four
// lines about 110 points apart, and the only thing left to say which node
// follows which is an indent of a few characters — a structure nobody can see
// at that spacing. A skill tree is a picture, not a list, and the picture is
// the whole point of the feature: what it costs to go one step deeper, and
// what you have to have taken before you can.
//
// So the page has no `SkillNode` section at all. The tree is a board built in
// code, a box per node and a line per edge, drawn in a panel over the page
// ({@link SkillTreeOverlay}) the way the ad demo's break is — opened from the
// character row whose tree it is, closed when the visitor is done with it.
//
// **Why a panel.** A tree is a picture, and a picture on a page of one-line
// rows is a picture squeezed into a band. It is also read against a balance:
// every box charges, and what a release left is the next thing a visitor wants
// to know. A panel can hold both at once, at the size the picture wants, and
// it is what the visitor asked for by pressing `Open tree` on a character.
//
// **Where the nodes come from.** This reads them itself, rather than through
// the generated `SkillNodeListHandler`. The handler exists to spawn one row
// per node under a section, and the page builder mounts one only for a section
// that draws rows — so keeping the nodes coming meant keeping a section whose
// only job was to be a section. `SkillNodeBinderCollection` takes the owner in
// its constructor, which is the same thing the handler would have handed it,
// so the panel builds one directly and the section is gone.
//
// **One panel per page.** The collection is built for one character, because
// the owner is a constructor argument rather than something a live collection
// can be re-aimed at. So a press on a second character disposes the first
// collection and builds a second, and a press on the character already on
// screen reopens the panel over the collection that is already subscribed —
// no round trip, and no empty board between the press and the answer.
//
// **Where the geometry comes from.** Nothing here measures the page. A box
// sits at a fraction of the board's width — one node in a row is at a half,
// two are at a quarter and three quarters — so anchors carry the horizontal
// and the board is correct at any width a browser gives it. The vertical is
// fixed: a row of boxes every `RowPitch` points, which is what the board's own
// height is then declared to be, and what the panel is fitted to.
//
// **Depth, not descent.** Where a node sits comes from {@link SkillNodeTree}:
// its depth is one more than the deepest thing it needs. `last` needs both
// `left` and `right`, so it hangs off neither in particular — it sits one row
// below both and both lines run into it, which is the join an indent could
// never draw.
//
// **Every box is a press.** Not only the ones a step away: a press carries the
// whole path up to the node it is on, because GS2 reads a release's premises
// against the released set plus the request. So the tree is opened by naming
// what is wanted rather than by climbing to it, and a box's own line says how
// far the press reaches and what the lot of it costs. What a balance will not
// cover is the server's to refuse, and it says so on the page's log.
#nullable enable

using System;
using System.Collections.Generic;
using System.Globalization;

using Cysharp.Threading.Tasks;

using UnityEngine;
using UnityEngine.UI;

using Gs2.Core.Exception;

using GS2Studio.Generated.Runtime;
using GS2Studio.Generated.SkillNode;
using GS2Studio.Generated.Wallet;

// The namespace and the model share a name, so the model is aliased where it
// is used as a type rather than qualified at each mention.
using SkillNodeModel = GS2Studio.Generated.SkillNode.SkillNode;
using WalletModel = GS2Studio.Generated.Wallet.Wallet;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// The skill tree as a visitor reads it: a box per node, laid out by
    /// depth, with a line from every premise to the node that needs it, drawn
    /// in a panel over the page.
    ///
    /// Lives on an object of its own, made the first time a character row is
    /// pressed. Nothing the bake writes is involved: the page has no section
    /// for `SkillNode` to have hung it from, and an object made here survives
    /// the list rows that opened it — a character row is spawned and destroyed
    /// as the inventory reconciles, and the panel is not.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class SkillNodeTreeCanvas : MonoBehaviour
    {
        private const float BoxWidth = 220f;
        private const float BoxHeight = 116f;

        /// <summary>
        /// Between one row of boxes and the next. The difference over
        /// <see cref="BoxHeight"/> is what the connectors are drawn in, and it
        /// is generous on purpose: an elbow that has to turn twice in a dozen
        /// points reads as a smudge rather than as a line.
        /// </summary>
        private const float RowPitch = 180f;

        private const float BoardPadding = 10f;
        private const float BorderWidth = 2f;
        private const float LineWidth = 3f;

        /// <summary>
        /// What the board is worth with nothing on it, which is what the panel
        /// holds between the press that opened it and the nodes arriving.
        /// </summary>
        private const float EmptyHeight = 72f;

        /// <summary>
        /// What the panel says while the read is out. A press puts the panel up
        /// straight away — a press that showed nothing until the round trip
        /// came back would read as a press that did nothing — so the board has
        /// a moment with nothing on it and this is what it says then.
        /// </summary>
        private const string ReadingMessage = "Reading this character's tree…";

        // The page's palette, so the board reads as part of the page rather
        // than as something that landed on top of it.
        private static readonly Color Accent = new Color(0.643f, 0.549f, 1f, 1f);
        private static readonly Color PrimaryText = new Color(0.922f, 0.91f, 0.949f, 1f);
        private static readonly Color MutedText = new Color(0.643f, 0.616f, 0.729f, 1f);
        private static readonly Color OnAccentText = new Color(0.07f, 0.06f, 0.1f, 1f);

        private static readonly Color ReleasedFill = new Color(0.18f, 0.153f, 0.29f, 1f);
        private static readonly Color ReadyFill = new Color(0.125f, 0.11f, 0.18f, 1f);
        private static readonly Color LockedFill = new Color(0.086f, 0.078f, 0.118f, 1f);

        private static readonly Color ReleasedBorder = Accent;
        private static readonly Color ReadyBorder = new Color(0.643f, 0.549f, 1f, 0.5f);
        private static readonly Color LockedBorder = new Color(0.643f, 0.616f, 0.729f, 0.22f);

        private static readonly Color LitLine = new Color(0.643f, 0.549f, 1f, 0.85f);
        private static readonly Color DimLine = new Color(0.643f, 0.616f, 0.729f, 0.28f);

        private static readonly Color QuietButton = new Color(0.071f, 0.063f, 0.098f, 1f);
        private static readonly Color DeadButton = new Color(0.13f, 0.122f, 0.161f, 1f);

        /// <summary>
        /// The one panel on the page. A tree is read one character at a time
        /// and drawn over everything else, so a second would be a second modal
        /// on top of the first; the press that opens one for another character
        /// re-aims this one.
        /// </summary>
        private static SkillNodeTreeCanvas? _instance;

        private Font? _font;
        private SkillTreeOverlay? _overlay;
        private RectTransform? _board;
        private RectTransform? _lines;
        private RectTransform? _boxes;
        private ShowroomPage? _page;

        /// <summary>
        /// The nodes, read for whoever the panel was last opened for. Built
        /// here rather than taken from a generated list handler — see the
        /// file's note — and rebuilt whenever the owner changes, because the
        /// owner is a constructor argument.
        /// </summary>
        private SkillNodeBinderCollection? _collection;

        /// <summary>Whose tree <see cref="_collection"/> was built for.</summary>
        private string? _owner;

        /// <summary>
        /// Which aiming the collection in hand belongs to. A press on a second
        /// character while the first character's read is still out would
        /// otherwise install a collection nobody is looking at any more, over
        /// the one that is.
        /// </summary>
        private long _generation;

        /// <summary>
        /// The wallet the tree is paid from, so the panel can say what is left
        /// while a visitor is spending it. Null on a page that draws no wallet,
        /// which is a page where the panel simply says nothing about balances.
        /// </summary>
        private WalletHandlerBase? _wallet;

        private bool _walletSubscribed;
        private bool _dirty;

        /// <summary>
        /// The nodes the press still out is about, if there is one — which is
        /// the whole of what it will move, not just the box that was clicked.
        /// One press at a time: a release moves a balance every other box's
        /// cost is read against, so a second press before the first has landed
        /// would be made against a tree that is already out of date.
        /// </summary>
        private HashSet<string>? _pressing;

        /// <summary>
        /// The page's panel, made on the first press and kept after it.
        ///
        /// On an object of its own: the press comes from a character row, and
        /// a character row is spawned and destroyed as the inventory list
        /// reconciles, so a panel hung off one would go with it.
        /// </summary>
        /// <param name="font">
        /// The page's font, so the panel cannot drift from the text around it.
        /// Taken from the row that pressed, and kept from the first press —
        /// every row of a page carries the same one.
        /// </param>
        public static SkillNodeTreeCanvas Ensure(Font? font)
        {
            if (_instance == null)
            {
                var host = new GameObject(nameof(SkillNodeTreeCanvas));
                _instance = host.AddComponent<SkillNodeTreeCanvas>();
            }
            if (_instance._font == null) _instance._font = font;
            return _instance;
        }

        /// <summary>
        /// Puts the panel up on one character's tree.
        ///
        /// Up first and read second: the read is a round trip, and a press that
        /// showed nothing until it came back would read as a press that did
        /// nothing. The board says it is reading, which is what is true.
        ///
        /// A second press on the character already on screen is a reopen. The
        /// collection in hand is subscribed and current, so there is nothing to
        /// read again and nothing to throw away.
        /// </summary>
        public void OpenFor(string owner)
        {
            if (string.IsNullOrEmpty(owner)) throw new ArgumentNullException(nameof(owner));
            Build();
            SubscribeToTheWallet();
            _overlay?.Open();
            _dirty = true;
            if (_collection != null && string.Equals(_owner, owner, StringComparison.Ordinal)) return;
            Reaim(owner);
        }

        /// <summary>
        /// Builds the collection for one character, and takes down whatever the
        /// panel was reading before.
        ///
        /// The previous one is disposed first rather than after: it holds a
        /// loader subscription and a binder per node, and two of them alive at
        /// once would have the board redrawn by a character nobody is looking
        /// at.
        /// </summary>
        private async void Reaim(string owner)
        {
            var generation = ++_generation;
            DisposeCollection();
            _owner = owner;
            // Whatever the last character left on the board is not this one's.
            _dirty = true;

            var runtime = FindAnyObjectByType<Gs2HolderRuntimeContextProvider>();
            if (runtime == null || !runtime.TryGet(out var gs2, out var session) ||
                gs2 == null || session == null)
            {
                Report("The GS2 runtime context is not available, so the tree cannot be read.");
                return;
            }

            SkillNodeBinderCollection? collection = null;
            try
            {
                collection = new SkillNodeBinderCollection(gs2, session, owner);
                await collection.MountFromSkillTreeSkillTreeMasterDataAsync(
                    this.GetCancellationTokenOnDestroy());
                if (generation != _generation || this == null)
                {
                    collection.Dispose();
                    return;
                }
                _collection = collection;
                // After the mount, so the first notification the subscription
                // raises is over a board that already has the nodes on it.
                collection.SubscribeFromSkillTreeSkillTreeMasterData(
                    OnCollectionChanged, OnCollectionFailed);
                _dirty = true;
            }
            catch (OperationCanceledException)
            {
                // The panel went with the page; nothing is left to draw on.
                collection?.Dispose();
            }
            catch (Exception error)
            {
                // Only when nothing newer has taken over: a later press has
                // already put its own collection and owner in place, and this
                // failure is not about them.
                if (generation == _generation)
                {
                    _collection = null;
                    _owner = null;
                }
                collection?.Dispose();
                Report($"The skill tree could not be read: {error.Message}");
                Debug.LogException(error, this);
            }
        }

        private void DisposeCollection()
        {
            var collection = _collection;
            _collection = null;
            _owner = null;
            collection?.Dispose();
        }

        private void SubscribeToTheWallet()
        {
            if (_walletSubscribed) return;
            // Found rather than wired: the wallet's handler is baked onto the
            // page root by the builder, and an Inspector reference to it from
            // here would go null the next time the page was baked.
            if (_wallet == null) _wallet = FindAnyObjectByType<WalletHandlerBase>();
            if (_wallet == null) return;
            _wallet.Updated += OnWalletUpdated;
            _walletSubscribed = true;
            if (_wallet.Model != null) OnWalletUpdated(_wallet.Model);
        }

        private void UnsubscribeFromTheWallet()
        {
            if (!_walletSubscribed || _wallet == null) return;
            _wallet.Updated -= OnWalletUpdated;
            _walletSubscribed = false;
        }

        private void OnWalletUpdated(WalletModel model)
        {
            _overlay?.SetBalance(
                $"Balance {model.Free.ToString(CultureInfo.InvariantCulture)}");
        }

        private void OnDestroy()
        {
            _generation++;
            UnsubscribeFromTheWallet();
            DisposeCollection();
            _overlay?.Destroy();
            _overlay = null;
            if (ReferenceEquals(_instance, this)) _instance = null;
        }

        private void OnCollectionChanged()
        {
            _dirty = true;
        }

        private void OnCollectionFailed(Exception error)
        {
            Report($"The skill tree could not be read: {error.Message}");
            Debug.LogException(error, this);
        }

        /// <summary>
        /// Redrawn once a frame at most. The subscription notifies for a
        /// membership reconcile and again for every node whose status moved, so
        /// a single release can raise it several times in one frame; each one
        /// only marks the board as out of date.
        /// </summary>
        private void LateUpdate()
        {
            if (!_dirty) return;
            _dirty = false;
            Redraw();
        }

        /// <summary>
        /// The panel and the board inside it.
        ///
        /// The board is built here rather than by the panel because the board
        /// is this component's drawing; the panel only holds it, fits itself to
        /// it, and scrolls it when it has grown past the screen.
        ///
        /// Idempotent: the first press builds it, and every press after that
        /// finds it already up.
        /// </summary>
        private void Build()
        {
            if (_board != null) return;
            _overlay = new SkillTreeOverlay(_font);

            _board = NewRect("SkillTreeBoard", transform);
            _board.sizeDelta = new Vector2(0f, EmptyHeight);
            _overlay.Mount(_board);
            _overlay.FitTo(EmptyHeight);

            // Lines under boxes: an elbow runs to the middle of a box's top
            // edge, and the box is what should cover the last few points of it.
            _lines = NewRect("Lines", _board);
            Stretch(_lines);
            _boxes = NewRect("Boxes", _board);
            Stretch(_boxes);
        }

        private void Redraw()
        {
            Draw(Nodes());
        }

        /// <summary>
        /// The whole board, from a set of nodes: where each one sits, what
        /// joins it to what it needs, and how tall the panel has to be to hold
        /// the result.
        ///
        /// Takes the set rather than reading it, so what is drawn is separable
        /// from where it came from — the collection is the only source in the
        /// page, and the drawing has no business knowing that.
        /// </summary>
        private void Draw(IReadOnlyList<SkillNodeModel> nodes)
        {
            if (_board == null || _lines == null || _boxes == null) return;
            ClearChildren(_lines);
            ClearChildren(_boxes);

            if (nodes.Count == 0)
            {
                SetBoardHeight(EmptyHeight);
                var empty = AddText(
                    _boxes, "Empty", ReadingMessage, 17, MutedText, TextAnchor.MiddleCenter);
                Stretch((RectTransform)empty.transform);
                return;
            }

            var premises = SkillNodeTree.PremisesOf(nodes);
            var byName = new Dictionary<string, SkillNodeModel>(StringComparer.Ordinal);
            foreach (var node in nodes)
            {
                var name = SkillNodeTree.NameOf(node);
                if (name.Length > 0 && !byName.ContainsKey(name)) byName[name] = node;
            }

            var rows = RowsOf(nodes, premises);
            var placed = new Dictionary<string, Placement>(StringComparer.Ordinal);
            for (var row = 0; row < rows.Count; row++)
            {
                var band = rows[row];
                for (var column = 0; column < band.Count; column++)
                {
                    var name = SkillNodeTree.NameOf(band[column]);
                    if (name.Length == 0) continue;
                    placed[name] = new Placement
                    {
                        Fraction = (column + 0.5f) / band.Count,
                        Top = BoardPadding + row * RowPitch,
                    };
                }
            }

            SetBoardHeight(BoardPadding * 2f + (rows.Count - 1) * RowPitch + BoxHeight);

            // Every edge first, so nothing is drawn over a box.
            foreach (var node in nodes)
            {
                var name = SkillNodeTree.NameOf(node);
                if (name.Length == 0 || !placed.TryGetValue(name, out var child)) continue;
                var needed = node.PremiseNodes;
                if (needed == null) continue;
                foreach (var premise in needed)
                {
                    if (string.IsNullOrEmpty(premise)) continue;
                    if (!placed.TryGetValue(premise, out var parent)) continue;
                    var lit = byName.TryGetValue(premise, out var held) && held.Released;
                    DrawEdge(parent, child, lit ? LitLine : DimLine);
                }
            }

            foreach (var node in nodes)
            {
                var name = SkillNodeTree.NameOf(node);
                if (name.Length == 0 || !placed.TryGetValue(name, out var slot)) continue;
                DrawBox(node, name, slot, byName, nodes);
            }
        }

        /// <summary>Where one box sits: across the board, and down it.</summary>
        private struct Placement
        {
            public float Fraction;
            public float Top;
        }

        private IReadOnlyList<SkillNodeModel> Nodes()
        {
            var binders = _collection == null
                ? (IReadOnlyList<IActionableSkillNodeBinder>)Array.Empty<IActionableSkillNodeBinder>()
                : _collection;
            var nodes = new List<SkillNodeModel>(binders.Count);
            foreach (var binder in binders)
            {
                if (binder == null) continue;
                if (SkillNodeTree.NameOf(binder).Length == 0) continue;
                nodes.Add(binder);
            }
            return nodes;
        }

        /// <summary>
        /// The nodes banded by depth, and ordered within a band by name.
        ///
        /// Ordinal, like the collection's own default: the order has to be
        /// total, or two nodes at the same depth would swap places between one
        /// redraw and the next for no reason a visitor could see.
        /// </summary>
        private static IReadOnlyList<IReadOnlyList<SkillNodeModel>> RowsOf(
            IReadOnlyList<SkillNodeModel> nodes,
            IReadOnlyDictionary<string, IReadOnlyList<string>> premises)
        {
            var byDepth = new SortedDictionary<int, List<SkillNodeModel>>();
            foreach (var node in nodes)
            {
                var depth = SkillNodeTree.DepthOf(SkillNodeTree.NameOf(node), premises);
                if (!byDepth.TryGetValue(depth, out var band))
                {
                    band = new List<SkillNodeModel>();
                    byDepth[depth] = band;
                }
                band.Add(node);
            }
            var rows = new List<IReadOnlyList<SkillNodeModel>>(byDepth.Count);
            foreach (var band in byDepth.Values)
            {
                band.Sort((left, right) => string.Compare(
                    SkillNodeTree.NameOf(left), SkillNodeTree.NameOf(right), StringComparison.Ordinal));
                rows.Add(band);
            }
            return rows;
        }

        /// <summary>
        /// One edge, as three segments: down out of the premise, across to the
        /// node that needs it, and down into it.
        ///
        /// Three rather than one diagonal because the corners are what carry
        /// the shape. Two nodes hanging off one premise share the run across,
        /// so the pair reads as a split; two premises running into one node
        /// share it the other way, and the pair reads as the join it is.
        /// </summary>
        private void DrawEdge(Placement parent, Placement child, Color color)
        {
            if (_lines == null) return;
            var parentBottom = parent.Top + BoxHeight;
            var childTop = child.Top;
            if (childTop <= parentBottom) return;
            var middle = (parentBottom + childTop) * 0.5f;
            var half = LineWidth * 0.5f;

            AddLine(parent.Fraction, parent.Fraction, parentBottom, middle - parentBottom + half, color);
            if (!Mathf.Approximately(parent.Fraction, child.Fraction))
            {
                AddBar(parent.Fraction, child.Fraction, middle - half, color);
            }
            AddLine(child.Fraction, child.Fraction, middle - half, childTop - middle + half, color);
        }

        private void AddLine(float from, float to, float top, float length, Color color)
        {
            if (_lines == null || length <= 0f) return;
            var rect = NewRect("Down", _lines);
            rect.anchorMin = new Vector2(from, 1f);
            rect.anchorMax = new Vector2(to, 1f);
            rect.pivot = new Vector2(0.5f, 1f);
            rect.sizeDelta = new Vector2(LineWidth, length);
            rect.anchoredPosition = new Vector2(0f, -top);
            Paint(rect, color);
        }

        private void AddBar(float from, float to, float top, Color color)
        {
            if (_lines == null) return;
            var rect = NewRect("Across", _lines);
            rect.anchorMin = new Vector2(Mathf.Min(from, to), 1f);
            rect.anchorMax = new Vector2(Mathf.Max(from, to), 1f);
            rect.pivot = new Vector2(0.5f, 1f);
            // The width the anchors span, plus half a line at each end, so the
            // run and the two drops it turns into meet at square corners.
            rect.sizeDelta = new Vector2(LineWidth, LineWidth);
            rect.anchoredPosition = new Vector2(0f, -top);
            Paint(rect, color);
        }

        /// <summary>
        /// One node: what it is called, what it charges, what pressing it
        /// would do, and the press.
        ///
        /// Three states, told apart by the border and the fill before any of
        /// the words are read — released, one step away, and further in. The
        /// third is not "cannot be pressed": a press carries the path up to
        /// the node with it, so every box is pressable and the fill says how
        /// much of the tree the press is about rather than whether there is
        /// one.
        /// </summary>
        private void DrawBox(
            SkillNodeModel node,
            string name,
            Placement slot,
            IReadOnlyDictionary<string, SkillNodeModel> byName,
            IReadOnlyList<SkillNodeModel> nodes)
        {
            if (_boxes == null) return;
            var released = node.Released;
            var plan = released
                ? SkillNodeTree.RestrainClosure(name, nodes)
                : SkillNodeTree.ReleaseClosure(name, byName);
            var deep = !released && plan.Count > 1;

            var border = NewRect(name, _boxes);
            border.anchorMin = new Vector2(slot.Fraction, 1f);
            border.anchorMax = new Vector2(slot.Fraction, 1f);
            border.pivot = new Vector2(0.5f, 1f);
            border.sizeDelta = new Vector2(BoxWidth, BoxHeight);
            border.anchoredPosition = new Vector2(0f, -slot.Top);
            Paint(border, released ? ReleasedBorder : deep ? LockedBorder : ReadyBorder);

            var fill = NewRect("Fill", border);
            Stretch(fill);
            fill.offsetMin = new Vector2(BorderWidth, BorderWidth);
            fill.offsetMax = new Vector2(-BorderWidth, -BorderWidth);
            Paint(fill, released ? ReleasedFill : deep ? LockedFill : ReadyFill);

            // Full strength whatever the state: every box is actionable now,
            // and a greyed name beside a lit button reads as a contradiction.
            var title = AddText(fill, "Name", name, 20, PrimaryText, TextAnchor.MiddleCenter);
            Band((RectTransform)title.transform, 8f, 26f);

            var cost = AddText(
                fill, "Cost", $"Cost {node.Cost.ToString(CultureInfo.InvariantCulture)}", 15,
                released ? Accent : MutedText, TextAnchor.MiddleCenter);
            Band((RectTransform)cost.transform, 34f, 18f);

            var standing = AddText(
                fill, "State", Standing(node, plan, byName), 12, MutedText,
                TextAnchor.MiddleCenter);
            Band((RectTransform)standing.transform, 52f, 16f);

            var owner = node.Owner ?? "";
            var working = _pressing != null && _pressing.Contains(name);
            var busy = _pressing != null;
            var pressable = !busy && owner.Length > 0 && plan.Count > 0;

            // One of three words, whatever the box is in the middle of: a
            // press that says how much it does is a press of a different width
            // on every box, and a row of buttons that are all different widths
            // is what this board replaced. How much is on the line above,
            // which is where the press's own reading belongs.
            var label = working ? "Working" : released ? "Restrain" : "Release";
            var button = AddButton(
                fill, "Press", label,
                pressable ? (released ? QuietButton : Accent) : DeadButton,
                pressable ? (released ? Accent : OnAccentText) : MutedText);
            button.interactable = pressable;
            if (!pressable) return;

            var release = !released;
            button.onClick.AddListener(() => Press(name, plan, owner, release));
        }

        /// <summary>
        /// What pressing this box would do, in one line.
        ///
        /// A press carries its whole plan, so the line is about the plan: how
        /// many boxes move and what the lot of them costs, or — when the plan
        /// is the box alone — the one fact that box has left to give, which is
        /// that it is ready or what putting it back returns.
        ///
        /// A premise the page cannot see is the exception, and it comes first:
        /// the plan cannot name it, so the press will be refused, and saying
        /// which name is missing is worth more than a count that will not
        /// happen.
        ///
        /// Everything read off the nodes themselves, so a page and a stack
        /// that have drifted apart say so instead of the page printing a rate
        /// or a prerequisite nothing enforces.
        /// </summary>
        private static string Standing(
            SkillNodeModel node,
            IReadOnlyList<string> plan,
            IReadOnlyDictionary<string, SkillNodeModel> byName)
        {
            if (!node.Released)
            {
                var unknown = SkillNodeTree.UnknownPremises(node, byName);
                if (unknown.Count > 0) return "needs " + SkillNodeTree.Listed(unknown);
                if (plan.Count <= 1) return "ready";
                return $"releases {plan.Count} · {PlanCost(plan, byName)} total";
            }
            if (plan.Count > 1)
            {
                // The share only when the whole plan agrees on one: a rate is
                // per node, and one figure standing for several different ones
                // would be the page inventing arithmetic the stack never did.
                var shared = SharedReturn(plan, byName);
                return shared == null
                    ? $"restrains {plan.Count}"
                    : $"restrains {plan.Count} · {shared}% back";
            }
            var rate = node.RestrainReturnRate;
            if (rate == null) return "unlocked";
            return $"unlocked · {Percent(rate.Value)}% back";
        }

        /// <summary>What the whole plan charges.</summary>
        private static int PlanCost(
            IReadOnlyList<string> plan, IReadOnlyDictionary<string, SkillNodeModel> byName)
        {
            var total = 0;
            foreach (var name in plan)
            {
                if (byName.TryGetValue(name, out var node)) total += node.Cost;
            }
            return total;
        }

        /// <summary>
        /// The one return rate the whole plan shares, or null when it does not
        /// share one.
        /// </summary>
        private static string? SharedReturn(
            IReadOnlyList<string> plan, IReadOnlyDictionary<string, SkillNodeModel> byName)
        {
            float? shared = null;
            foreach (var name in plan)
            {
                if (!byName.TryGetValue(name, out var node)) return null;
                var rate = node.RestrainReturnRate;
                if (rate == null) return null;
                if (shared == null) shared = rate.Value;
                else if (!Mathf.Approximately(shared.Value, rate.Value)) return null;
            }
            return shared == null ? null : Percent(shared.Value);
        }

        private static string Percent(float rate)
        {
            return (rate * 100f).ToString("0.#", CultureInfo.InvariantCulture);
        }

        /// <summary>
        /// A press, and the wait it puts the whole board into.
        ///
        /// One call for the whole plan rather than one per node, because the
        /// plan is one thing a visitor asked for and GS2 takes it as one:
        /// `nodeModelNames` is a list and the premise check reads the released
        /// set plus the request, so the path only has to be named, not
        /// climbed.
        ///
        /// It is not one charge, though. The namespace this demo deploys runs
        /// its transactions with `enableAtomicCommit` off, so the plan's
        /// consume actions are one per node and run in turn: a plan a balance
        /// cannot cover spends what it can before it stops, and the release
        /// never lands. That is the stack's behaviour rather than this page's
        /// to paper over, and it is why the box says what the whole plan costs
        /// before it is pressed.
        ///
        /// Nothing reloads afterwards. The collection is subscribed to each
        /// node's status, so the board redraws itself when the release lands;
        /// the redraw here is only to take the wait back off, and to put a
        /// refusal in front of a visitor whose board never changed.
        /// </summary>
        private async void Press(
            string node, IReadOnlyList<string> plan, string owner, bool release)
        {
            if (_pressing != null || plan.Count == 0) return;
            _pressing = new HashSet<string>(plan, StringComparer.Ordinal);
            _dirty = true;
            try
            {
                await (release
                    ? SkillNodeCommands.Release(node, plan, owner)
                    : SkillNodeCommands.Restrain(node, plan, owner));
            }
            catch (Gs2Exception error)
            {
                // Two lines: what was asked for, then the server's own account
                // of why not. A refusal names a rule rather than a node, and a
                // plan of four that comes back "not enough" is a different
                // thing to read than the same words after a plan of one.
                Report($"{Attempt(plan, release)} was refused.");
                ReportError(error);
                Debug.LogError($"SkillNodeTreeCanvas: {node} failed: {error}", this);
            }
            catch (Exception error)
            {
                Report($"{Attempt(plan, release)}: {error.Message}");
                Debug.LogError($"SkillNodeTreeCanvas: {node} failed: {error}", this);
            }
            finally
            {
                // The panel goes with the scene, and a press can outlive it.
                if (this != null)
                {
                    _pressing = null;
                    _dirty = true;
                }
            }
        }

        /// <summary>What a press asked for, for the log line that reports it.</summary>
        private static string Attempt(IReadOnlyList<string> plan, bool release)
        {
            var verb = release ? "Releasing" : "Restraining";
            return $"{verb} {SkillNodeTree.Listed(plan)}";
        }

        /// <summary>
        /// Put a failure where a visitor can see it. A browser hides the
        /// console, which is otherwise the only record.
        /// </summary>
        private void Report(string message)
        {
            _page ??= FindAnyObjectByType<ShowroomPage>();
            if (_page != null) _page.Log(message);
        }

        private void ReportError(Gs2Exception error)
        {
            _page ??= FindAnyObjectByType<ShowroomPage>();
            if (_page != null) _page.LogError(error, null);
        }

        private static void ClearChildren(Transform parent)
        {
            for (var index = parent.childCount - 1; index >= 0; index--)
            {
                // Unparented before it is destroyed: `Destroy` takes effect at
                // the end of the frame, and a box on its way out would
                // otherwise still be laid out beside the one replacing it.
                var child = parent.GetChild(index);
                child.SetParent(null, false);
                Destroy(child.gameObject);
            }
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
            rect.pivot = new Vector2(0.5f, 0.5f);
            rect.offsetMin = Vector2.zero;
            rect.offsetMax = Vector2.zero;
        }

        /// <summary>One band across a box: `top` below its top edge, `height` tall.</summary>
        private static void Band(RectTransform rect, float top, float height)
        {
            rect.anchorMin = new Vector2(0f, 1f);
            rect.anchorMax = new Vector2(1f, 1f);
            rect.pivot = new Vector2(0.5f, 1f);
            rect.offsetMin = new Vector2(10f, -top - height);
            rect.offsetMax = new Vector2(-10f, -top);
        }

        /// <summary>
        /// How tall the board is, and so how tall the panel wants to be.
        ///
        /// The board hangs from the top of the panel's viewport and stretches
        /// across it, so only the height is its own — which is what lets the
        /// panel scroll a tree it has run out of screen for.
        /// </summary>
        private void SetBoardHeight(float height)
        {
            if (_board == null) return;
            _board.sizeDelta = new Vector2(0f, height);
            _overlay?.FitTo(height);
        }

        private static void Paint(RectTransform rect, Color color)
        {
            var image = rect.gameObject.AddComponent<Image>();
            image.color = color;
            image.raycastTarget = false;
        }

        private Text AddText(
            Transform parent, string name, string content, int size, Color color,
            TextAnchor alignment)
        {
            var rect = NewRect(name, parent);
            var text = rect.gameObject.AddComponent<Text>();
            text.font = _font ?? Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            text.fontSize = size;
            text.color = color;
            text.alignment = alignment;
            text.horizontalOverflow = HorizontalWrapMode.Overflow;
            text.verticalOverflow = VerticalWrapMode.Overflow;
            text.supportRichText = false;
            text.raycastTarget = false;
            text.text = content;
            return text;
        }

        private Button AddButton(
            Transform parent, string name, string label, Color background, Color labelColor)
        {
            var rect = NewRect(name, parent);
            rect.anchorMin = new Vector2(0f, 0f);
            rect.anchorMax = new Vector2(1f, 0f);
            rect.pivot = new Vector2(0.5f, 0f);
            rect.offsetMin = new Vector2(10f, 10f);
            rect.offsetMax = new Vector2(-10f, 10f + 36f);
            var image = rect.gameObject.AddComponent<Image>();
            image.color = background;
            var button = rect.gameObject.AddComponent<Button>();
            button.targetGraphic = image;
            var text = AddText(rect, "Label", label, 16, labelColor, TextAnchor.MiddleCenter);
            Stretch((RectTransform)text.transform);
            return button;
        }
    }
}
