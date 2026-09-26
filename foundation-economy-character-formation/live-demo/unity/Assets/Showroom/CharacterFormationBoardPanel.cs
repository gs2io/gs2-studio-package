// The party board: which party is being edited, who is in it, and who could be.
//
// A row of the page reads one value or makes one press, and a party screen is
// neither, so this draws its own region. Tabs pick a party; the slot cards
// show its members, and a filled one takes its member out; the character cards
// show everyone the player has, and a tap puts that character in or takes it
// out again.
//
// What changes comes from three subscriptions: the mold (how many parties the
// player has) grows when the page's Expand runs, the party being edited
// changes when a press writes it, and the characters change when a recruit
// lands. Each is subscribed before it is read, so a change between the two is
// not lost, and a read that finishes after a newer one is dropped. The slot
// names are master data and are read once.
//
// Nothing here reloads or invalidates anything. A write puts its result in the
// SDK cache, and these subscriptions hear it from there.
#nullable enable

using System;
using System.Collections;
using System.Collections.Generic;
using System.Threading.Tasks;

using UnityEngine;
using UnityEngine.UI;

using Gs2.Unity.Core;
using Gs2.Unity.Gs2Formation.Model;
using Gs2.Unity.Gs2Inventory.Model;
using Gs2.Unity.Util;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// Draws the party board into the region the page gives it.
    /// </summary>
    [AddComponentMenu("GS2 Studio/Showroom/Party Board")]
    public sealed class CharacterFormationBoardPanel : MonoBehaviour
    {
        /// <summary>The inventory the demo's characters are recruited into.</summary>
        private const string CharacterNamespace = "Character";
        private const string CharacterInventory = "Character";

        private const int RosterColumns = 3;

        private static readonly Color TabColor = new Color(0.22f, 0.2f, 0.3f, 1f);
        private static readonly Color SelectedTabColor = new Color(0.643f, 0.549f, 1f, 1f);
        private static readonly Color EmptyCardColor = new Color(0.16f, 0.15f, 0.22f, 1f);
        private static readonly Color MemberCardColor = new Color(0.643f, 0.549f, 1f, 1f);
        private static readonly Color RosterCardColor = new Color(0.3f, 0.28f, 0.4f, 1f);
        private static readonly Color DarkText = new Color(0.07f, 0.06f, 0.1f, 1f);
        private static readonly Color LightText = new Color(0.922f, 0.91f, 0.949f, 1f);
        private static readonly Color MutedText = new Color(0.643f, 0.616f, 0.729f, 1f);

        [SerializeField] private RectTransform? _panel;
        [SerializeField] private Button? _buttonTemplate;
        [SerializeField] private Font? _font;

        private RectTransform? _tabs;
        private RectTransform? _slots;
        private RectTransform? _roster;
        private Text? _rosterHint;

        private Gs2Domain? _gs2;
        private IGameSession? _session;
        private readonly List<Action> _unsubscribes = new List<Action>();
        private Action? _unsubscribeForm;

        /// <summary>How many parties the player has, or null until read.</summary>
        private int? _capacity;
        /// <summary>The party shape's slot names, in its order.</summary>
        private IReadOnlyList<string>? _slotNames;
        /// <summary>The party being edited, counted from 0.</summary>
        private int _editing;
        /// <summary>The edited party's filled slots, by slot name.</summary>
        private Dictionary<string, string> _members = new Dictionary<string, string>();
        private EzItemSet[] _characters = Array.Empty<EzItemSet>();

        // Each counts the reads started for its source, so a read that
        // finishes after a newer one knows it is stale.
        private int _moldRead;
        private int _formRead;
        private int _charactersRead;

        private bool _busy;
        private Coroutine? _waiting;
        private ShowroomPage? _page;

        private void OnEnable()
        {
            if (_panel == null || _buttonTemplate == null || _font == null)
            {
                Log("The party board was baked without its region, button or font.");
                return;
            }
            if (_tabs == null) Build();
            _waiting = StartCoroutine(WaitForSignIn());
        }

        private void OnDisable()
        {
            if (_waiting != null) StopCoroutine(_waiting);
            _waiting = null;
            _unsubscribeForm?.Invoke();
            _unsubscribeForm = null;
            foreach (var unsubscribe in _unsubscribes) unsubscribe();
            _unsubscribes.Clear();
            _gs2 = null;
            _session = null;
        }

        /// <summary>
        /// The page signs in after it starts, and nothing announces it, so the
        /// board asks until the session is there.
        /// </summary>
        private IEnumerator WaitForSignIn()
        {
            Gs2Domain? gs2;
            IGameSession? session;
            while (!FormationCommands.TryRuntime(out gs2, out session))
            {
                yield return new WaitForSeconds(0.25f);
            }
            _waiting = null;
            _gs2 = gs2;
            _session = session;
            Begin();
        }

        private void Begin()
        {
            var gs2 = _gs2!;
            var session = _session!;
            // Enabled again after a disable, the board starts over: what it
            // held was last heard through subscriptions it has since dropped.
            _capacity = null;
            _editing = 0;
            _members = new Dictionary<string, string>();

            var mold = new Gs2Bind.Gs2Formation.MoldLoader(FormationCommands.Namespace, FormationCommands.MoldModel);
            _unsubscribes.Add(mold.Subscribe(gs2, session, (_, _, value) =>
            {
                _moldRead++;
                OnCapacity(value?.Capacity);
                return Task.CompletedTask;
            }, () => { }));
            ReadCapacity(mold);

            var characters = new Gs2Bind.Gs2Inventory.ItemSetArrayLoader(CharacterNamespace, CharacterInventory);
            _unsubscribes.Add(characters.Subscribe(gs2, session, (_, _, value) =>
            {
                _charactersRead++;
                OnCharacters(value);
                return Task.CompletedTask;
            }, () => { }));
            ReadCharacters(characters);

            ReadSlotNames();
        }

        private async void ReadCapacity(Gs2Bind.Gs2Formation.MoldLoader mold)
        {
            var read = ++_moldRead;
            try
            {
                var value = await mold.Load(_gs2!, _session!);
                if (read == _moldRead && this != null) OnCapacity(value?.Capacity);
            }
            catch (Exception error)
            {
                Log($"The parties could not be read: {error.Message}");
            }
        }

        private async void ReadCharacters(Gs2Bind.Gs2Inventory.ItemSetArrayLoader characters)
        {
            var read = ++_charactersRead;
            try
            {
                var value = await characters.Load(_gs2!, _session!);
                if (read == _charactersRead && this != null) OnCharacters(value);
            }
            catch (Exception error)
            {
                Log($"The characters could not be read: {error.Message}");
            }
        }

        private async void ReadSlotNames()
        {
            try
            {
                var names = await FormationCommands.SlotNames(_gs2!, _session!);
                if (this == null) return;
                _slotNames = names;
                DrawSlots();
            }
            catch (Exception error)
            {
                Log($"The party shape could not be read: {error.Message}");
            }
        }

        private void OnCapacity(int? capacity)
        {
            // No mold says nothing new; keeping what was known keeps the
            // party being edited where it is.
            if (capacity == null) return;
            var first = _capacity == null;
            _capacity = capacity;
            DrawTabs();
            // A party past the capacity is never read: reading one makes a
            // record GS2 then refuses to use.
            if (first && capacity > 0) Edit(0);
        }

        private void OnCharacters(EzItemSet[]? characters)
        {
            _characters = characters ?? Array.Empty<EzItemSet>();
            DrawRoster();
        }

        /// <summary>Switches the party being edited and follows it.</summary>
        private void Edit(int index)
        {
            if (_gs2 == null || _session == null || _capacity == null) return;
            if (index < 0 || index >= _capacity) return;
            // The first switch comes from the capacity, with nothing followed
            // yet; after that, the party already followed needs nothing.
            if (index == _editing && _unsubscribeForm != null) return;

            _editing = index;
            _members = new Dictionary<string, string>();
            _unsubscribeForm?.Invoke();
            var form = new Gs2Bind.Gs2Formation.FormLoader(FormationCommands.Namespace, FormationCommands.MoldModel, index);
            _unsubscribeForm = form.Subscribe(_gs2, _session, (_, _, value) =>
            {
                _formRead++;
                OnForm(index, value);
                return Task.CompletedTask;
            }, () => { });
            ReadForm(form, index);
            DrawTabs();
            DrawSlots();
            DrawRoster();
        }

        private async void ReadForm(Gs2Bind.Gs2Formation.FormLoader form, int index)
        {
            var read = ++_formRead;
            try
            {
                var value = await form.LoadOrNull(_gs2!, _session!);
                if (read == _formRead && this != null) OnForm(index, value);
            }
            catch (Exception error)
            {
                Log($"Party {index + 1} could not be read: {error.Message}");
            }
        }

        private void OnForm(int index, EzForm? form)
        {
            if (index != _editing) return;
            var members = new Dictionary<string, string>();
            if (form?.Slots != null)
            {
                foreach (var slot in form.Slots)
                {
                    if (string.IsNullOrEmpty(slot.Name) || string.IsNullOrEmpty(slot.PropertyId)) continue;
                    members[slot.Name] = slot.PropertyId;
                }
            }
            _members = members;
            DrawSlots();
            DrawRoster();
        }

        private async void Press(Func<Task<string?>> write)
        {
            if (_busy)
            {
                Log("Still saving the last change.");
                return;
            }
            _busy = true;
            try
            {
                var note = await write();
                if (note != null) Log(note);
            }
            catch (Exception error)
            {
                Log($"The party could not be saved: {error.Message}");
                Debug.LogError($"CharacterFormationBoardPanel: failed: {error}", this);
            }
            finally
            {
                _busy = false;
            }
        }

        private bool IsMember(string characterId)
        {
            foreach (var member in _members.Values)
            {
                if (member == characterId) return true;
            }
            return false;
        }

        // Drawing. Each part is cleared and drawn again from the state above;
        // there are a handful of cards, so nothing is worth diffing.

        private void Build()
        {
            _tabs = Horizontal("Tabs", 52);
            Caption("Members  (tap a member to take it out)");
            _slots = Horizontal("Slots", 96);
            Caption("Your characters  (tap to put in or take out)");
            _roster = Grid("Roster");
            _rosterHint = Caption("Recruit a character above to start.");
        }

        private void DrawTabs()
        {
            if (_tabs == null) return;
            Clear(_tabs);
            if (_capacity == null) return;
            for (var index = 0; index < _capacity; index++)
            {
                var party = index;
                var selected = party == _editing;
                Card(_tabs, $"Party {party + 1}", selected ? SelectedTabColor : TabColor,
                    selected ? DarkText : LightText, () => Edit(party));
            }
        }

        private void DrawSlots()
        {
            if (_slots == null) return;
            Clear(_slots);
            if (_slotNames == null || _capacity == null) return;
            foreach (var name in _slotNames)
            {
                if (_members.TryGetValue(name, out var member))
                {
                    var index = _editing;
                    Card(_slots, $"{FormationCommands.CharacterName(member)}\n<size=13>{name}</size>",
                        MemberCardColor, DarkText,
                        () => Press(() => FormationCommands.TakeOut(member, index)));
                }
                else
                {
                    Card(_slots, $"Empty\n<size=13>{name}</size>", EmptyCardColor, MutedText,
                        () => Log("Tap a character below to put it in this party."));
                }
            }
        }

        private void DrawRoster()
        {
            if (_roster == null || _rosterHint == null) return;
            Clear(_roster);
            _rosterHint.gameObject.SetActive(_characters.Length == 0);
            foreach (var character in _characters)
            {
                var id = character.ItemSetId;
                if (string.IsNullOrEmpty(id)) continue;
                var member = IsMember(id);
                var index = _editing;
                Card(_roster,
                    member ? $"{character.ItemName}\n<size=13>In party {index + 1}</size>" : character.ItemName,
                    member ? MemberCardColor : RosterCardColor, member ? DarkText : LightText,
                    () => Press(() => member
                        ? FormationCommands.TakeOut(id, index)
                        : FormationCommands.PutIn(id, index)));
            }
        }

        private RectTransform Horizontal(string name, float height)
        {
            var row = Child(name);
            var layout = row.gameObject.AddComponent<HorizontalLayoutGroup>();
            layout.spacing = 12;
            layout.childControlWidth = true;
            layout.childControlHeight = true;
            layout.childForceExpandWidth = true;
            layout.childForceExpandHeight = true;
            row.gameObject.AddComponent<LayoutElement>().minHeight = height;
            return row;
        }

        private RectTransform Grid(string name)
        {
            var grid = Child(name);
            var layout = grid.gameObject.AddComponent<GridLayoutGroup>();
            layout.constraint = GridLayoutGroup.Constraint.FixedColumnCount;
            layout.constraintCount = RosterColumns;
            layout.spacing = new Vector2(12, 12);
            layout.cellSize = new Vector2(250, 72);
            return grid;
        }

        private Text Caption(string text)
        {
            var caption = Child("Caption");
            var label = caption.gameObject.AddComponent<Text>();
            label.font = _font;
            label.fontSize = 15;
            label.color = MutedText;
            label.text = text;
            caption.gameObject.AddComponent<LayoutElement>().minHeight = 24;
            return label;
        }

        private void Card(RectTransform parent, string text, Color color, Color textColor, Action onClick)
        {
            var button = Instantiate(_buttonTemplate!, parent);
            button.name = "Card";
            // The template is sized for a row's single button; in a board the
            // layout above decides the size instead.
            var element = button.GetComponent<LayoutElement>();
            if (element != null)
            {
                element.preferredWidth = -1;
                element.flexibleWidth = 1;
            }
            var image = button.GetComponent<Image>();
            if (image != null) image.color = color;
            var label = button.GetComponentInChildren<Text>();
            if (label != null)
            {
                label.supportRichText = true;
                label.color = textColor;
                label.text = text;
            }
            button.onClick.RemoveAllListeners();
            button.onClick.AddListener(() => onClick());
        }

        private RectTransform Child(string name)
        {
            var child = new GameObject(name, typeof(RectTransform)).GetComponent<RectTransform>();
            child.SetParent(_panel, false);
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

        private void Log(string message)
        {
            _page ??= FindAnyObjectByType<ShowroomPage>();
            if (_page != null) _page.Log(message);
            else Debug.LogWarning($"CharacterFormationBoardPanel: {message}", this);
        }
    }
}
