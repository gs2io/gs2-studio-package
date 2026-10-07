// Own the collection directly: this board draws nodes without spawning a generated list-handler row for each one.
#nullable enable

using System;
using System.Collections.Generic;
using System.Globalization;

using Cysharp.Threading.Tasks;

using UnityEngine;
using UnityEngine.UI;

using GS2Studio.Generated.SkillNode;
using GS2Studio.Generated.Wallet;

using SkillNodeModel = GS2Studio.Generated.SkillNode.SkillNode;
using WalletModel = GS2Studio.Generated.Wallet.Wallet;

namespace GS2Studio.Showroom.Demo
{
    [DisallowMultipleComponent]
    public sealed class SkillNodeTreeCanvas : MonoBehaviour
    {
        private const float BoxWidth = 220f;
        private const float BoxHeight = 116f;

        // Leave enough space between boxes for the elbow connectors to remain legible.
        private const float RowPitch = 180f;

        private const float BoardPadding = 10f;
        private const float BorderWidth = 2f;
        private const float LineWidth = 3f;

        private const float EmptyHeight = 72f;

        // Show feedback before the asynchronous read finishes so opening the tree does not appear unresponsive.
        private const string ReadingMessage = "Reading this character's tree...";

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

        // Reuse one modal when switching characters so trees cannot stack over each other.
        private static SkillNodeTreeCanvas? _instance;

        private Font? _font;
        private SkillTreeOverlay? _overlay;
        private RectTransform? _board;
        private RectTransform? _lines;
        private RectTransform? _boxes;

        // Subscription callbacks enter through the inbox so board changes run on the Unity thread.
        private readonly ShowroomInbox _inbox = new ShowroomInbox();

        // The owner is a constructor argument; switching characters requires a new collection.
        private SkillNodeBinderCollection? _collection;

        private string? _owner;

        // Reject an older character's mount result if a later selection has already taken over.
        private long _generation;

        private WalletHandlerBase? _wallet;

        private bool _walletSubscribed;
        private bool _dirty;

        // Disable overlapping presses on this board because each plan changes the state used to compute the next one.
        private HashSet<string>? _pressing;

        // Use a separate object so inventory reconciliation cannot destroy the panel with the character row that opened it.
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

        // Retain the subscribed collection when reopening the same character; another mount would discard its current state.
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

        // Dispose the previous collection before mounting another so old subscriptions cannot keep updating this board.
        private async void Reaim(string owner)
        {
            var generation = ++_generation;
            DisposeCollection();
            _owner = owner;
            _dirty = true;

            if (!ShowroomRuntime.TryGet(out var gs2, out var session))
            {
                ShowroomLog.Say("Not signed in yet, so the tree cannot be read.");
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
                // Subscribe after mounting so initial notifications observe mounted node models.
                collection.SubscribeFromSkillTreeSkillTreeMasterData(
                    OnCollectionChanged, OnCollectionFailed);
                _dirty = true;
            }
            catch (OperationCanceledException)
            {
                // Destruction cancels the mount; release the local collection without reporting that cancellation as a read failure.
                collection?.Dispose();
            }
            catch (Exception error)
            {
                // An older read failure must not clear the collection installed for a newer selection.
                if (generation == _generation)
                {
                    _collection = null;
                    _owner = null;
                }
                collection?.Dispose();
                ShowroomLog.Failure("The skill tree could not be read", error);
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
            // Resolve the baked wallet handler at runtime; a stored scene reference would not survive rebaking the page.
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
                $"Your coins: {model.Free.ToString(CultureInfo.InvariantCulture)}");
        }

        private void OnDestroy()
        {
            _generation++;
            _inbox.Clear();
            UnsubscribeFromTheWallet();
            DisposeCollection();
            _overlay?.Destroy();
            _overlay = null;
            if (ReferenceEquals(_instance, this)) _instance = null;
        }

        private void OnCollectionChanged()
        {
            _inbox.Post(() => _dirty = true);
        }

        private void OnCollectionFailed(Exception error)
        {
            _inbox.Post(() => ShowroomLog.Failure("The skill tree could not be read", error));
        }

        // Coalesce membership and per-node notifications so one update does not rebuild the board repeatedly in a frame.
        private void LateUpdate()
        {
            _inbox.Drain();
            if (!_dirty) return;
            _dirty = false;
            Redraw();
        }

        private void Build()
        {
            if (_board != null) return;
            _overlay = new SkillTreeOverlay(_font);

            _board = NewRect("SkillTreeBoard", transform);
            _board.sizeDelta = new Vector2(0f, EmptyHeight);
            _overlay.Mount(_board);
            _overlay.FitTo(EmptyHeight);

            // Keep connectors below boxes so their endpoints cannot paint over node content.
            _lines = NewRect("Lines", _board);
            Stretch(_lines);
            _boxes = NewRect("Boxes", _board);
            Stretch(_boxes);
        }

        private void Redraw()
        {
            Draw(Nodes());
        }

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

        // Use ordinal name order within each depth so redraws keep the same horizontal placement.
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

        // Elbow segments make shared branches and joins visible; a diagonal would obscure that structure.
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
            // Extend by half a line at each end so horizontal and vertical segments meet without gaps.
            rect.sizeDelta = new Vector2(LineWidth, LineWidth);
            rect.anchoredPosition = new Vector2(0f, -top);
            Paint(rect, color);
        }

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

            // Deep nodes can be requested together with their prerequisites; depth alone must not look disabled.
            var title = AddText(fill, "Name", name, 20, PrimaryText, TextAnchor.MiddleCenter);
            Band((RectTransform)title.transform, 8f, 26f);

            var cost = AddText(
                fill, "Cost", $"{node.Cost.ToString(CultureInfo.InvariantCulture)} coins", 15,
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

            // Keep plan details on the status line so action labels fit the same button width.
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
                return $"releases {plan.Count}, {PlanCost(plan, byName)} total";
            }
            if (plan.Count > 1)
            {
                // Show one return rate only when every planned node supplies approximately the same rate.
                var shared = SharedReturn(plan, byName);
                return shared == null
                    ? $"restrains {plan.Count}"
                    : $"restrains {plan.Count}, {shared}% back";
            }
            var rate = node.RestrainReturnRate;
            if (rate == null) return "unlocked";
            return $"unlocked, {Percent(rate.Value)}% back";
        }

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

        // The demo disables atomic commit; submitting one plan does not make its per-node consume actions atomic.
        // Display the full cost before submission, and let collection subscriptions report the resulting node state.
        private void Press(
            string node, IReadOnlyList<string> plan, string owner, bool release)
        {
            if (_pressing != null || plan.Count == 0) return;
            _pressing = new HashSet<string>(plan, StringComparer.Ordinal);
            _dirty = true;
            var started = ShowroomPress.Run(new ShowroomPressOptions
            {
                Name = $"{(release ? "releasing" : "restraining")} {node}",
                Owner = this,
                // Include the requested plan in failures so the server error can be tied to all affected nodes.
                Explain = error => $"{Attempt(plan, release)} was refused: {ShowroomErrors.Describe(error)}",
                Afterward = () =>
                {
                    _pressing = null;
                    _dirty = true;
                },
            }, async (gs2, session) =>
            {
                await (release
                    ? SkillNodeCommands.Release(gs2, session, node, plan, owner)
                    : SkillNodeCommands.Restrain(gs2, session, node, plan, owner));
                return "";
            });
            if (!started)
            {
                _pressing = null;
                _dirty = true;
            }
        }

        private static string Attempt(IReadOnlyList<string> plan, bool release)
        {
            var verb = release ? "Releasing" : "Restraining";
            return $"{verb} {SkillNodeTree.Listed(plan)}";
        }

        private static void ClearChildren(Transform parent)
        {
            for (var index = parent.childCount - 1; index >= 0; index--)
            {
                // Detach first because Destroy is deferred; the old boxes must leave this hierarchy before replacements are added.
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

        private static void Band(RectTransform rect, float top, float height)
        {
            rect.anchorMin = new Vector2(0f, 1f);
            rect.anchorMax = new Vector2(1f, 1f);
            rect.pivot = new Vector2(0.5f, 1f);
            rect.offsetMin = new Vector2(10f, -top - height);
            rect.offsetMax = new Vector2(-10f, -top);
        }

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
