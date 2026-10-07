// Subscribe before initial reads so intervening updates are not missed; hand callbacks to Update before touching Unity objects.
#nullable enable

using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;

using UnityEngine;
using UnityEngine.UI;

using Gs2.Unity.Core;
using Gs2.Unity.Gs2Formation.Model;
using Gs2.Unity.Gs2Inventory.Model;
using Gs2.Unity.Util;

namespace GS2Studio.Showroom.Demo
{
    [AddComponentMenu("GS2 Studio/Showroom/Loadout Board")]
    public sealed class EquipmentLoadoutBoardPanel : MonoBehaviour
    {
        private const string CharacterNamespace = "Character";
        private const string CharacterInventory = "Character";

        private const string EquipmentNamespace = "Equipment";
        private const string EquipmentInventory = "Equipment";

        private const int EquipmentColumns = 3;

        private static readonly Color TabColor = new Color(0.22f, 0.2f, 0.3f, 1f);
        private static readonly Color AccentColor = new Color(0.643f, 0.549f, 1f, 1f);
        private static readonly Color EmptyCardColor = new Color(0.16f, 0.15f, 0.22f, 1f);
        private static readonly Color FilledCardColor = new Color(0.3f, 0.28f, 0.4f, 1f);
        private static readonly Color DarkText = new Color(0.07f, 0.06f, 0.1f, 1f);
        private static readonly Color LightText = new Color(0.922f, 0.91f, 0.949f, 1f);
        private static readonly Color MutedText = new Color(0.643f, 0.616f, 0.729f, 1f);

        [SerializeField] private RectTransform? _panel;
        [SerializeField] private Button? _buttonTemplate;
        [SerializeField] private Font? _font;

        private RectTransform? _tabs;
        private Text? _tabsHint;
        private RectTransform? _slots;
        private RectTransform? _takeOff;
        private RectTransform? _equipment;
        private Text? _equipmentHint;

        private Gs2Domain? _gs2;
        private IGameSession? _session;
        private readonly List<Action> _unsubscribes = new List<Action>();

        private readonly Dictionary<string, Action> _loadoutSubscriptions = new Dictionary<string, Action>();

        private readonly Dictionary<string, Dictionary<string, string>> _loadouts =
            new Dictionary<string, Dictionary<string, string>>();

        /// <summary>Track reads and subscription updates per character so an older loadout cannot overwrite newer state.</summary>
        private readonly Dictionary<string, int> _loadoutReads = new Dictionary<string, int>();

        private IReadOnlyList<string>? _slotNames;
        private EzItemSet[] _characters = Array.Empty<EzItemSet>();
        private EzItemSet[] _pieces = Array.Empty<EzItemSet>();

        private string? _character;

        private string? _slot;

        private int _charactersRead;
        private int _piecesRead;

        private readonly ShowroomInbox _inbox = new ShowroomInbox();
        private Coroutine? _waiting;

        private void OnEnable()
        {
            if (_panel == null || _buttonTemplate == null || _font == null)
            {
                ShowroomLog.Say("The loadout board was baked without its region, button or font.");
                return;
            }
            if (_tabs == null) Build();
            _waiting = StartCoroutine(WaitForSignIn());
        }

        private void OnDisable()
        {
            if (_waiting != null) StopCoroutine(_waiting);
            _waiting = null;
            foreach (var unsubscribe in _loadoutSubscriptions.Values) unsubscribe();
            _loadoutSubscriptions.Clear();
            foreach (var unsubscribe in _unsubscribes) unsubscribe();
            _unsubscribes.Clear();
            _inbox.Clear();
            _gs2 = null;
            _session = null;
        }

        private void Update()
        {
            _inbox.Drain();
        }

        /// <summary>The board can enable before sign-in finishes, so its first reads must wait for a session.</summary>
        private IEnumerator WaitForSignIn()
        {
            Gs2Domain? gs2;
            IGameSession? session;
            while (!ShowroomRuntime.TryGet(out gs2, out session))
            {
                yield return new WaitForSeconds(0.25f);
            }
            _waiting = null;
            _gs2 = gs2;
            _session = session;
            Begin(gs2, session);
        }

        private void Begin(Gs2Domain gs2, IGameSession session)
        {
            // Discard snapshots on re-enable because their subscriptions stopped while the board was disabled.
            _loadouts.Clear();
            _character = null;

            var characters = new Gs2Bind.Gs2Inventory.ItemSetArrayLoader(CharacterNamespace, CharacterInventory);
            _unsubscribes.Add(characters.Subscribe(gs2, session, (_, _, value) =>
            {
                _inbox.Post(() =>
                {
                    _charactersRead++;
                    OnCharacters(value);
                });
                return Task.CompletedTask;
            }, () => { }));
            ReadCharacters(characters);

            var pieces = new Gs2Bind.Gs2Inventory.ItemSetArrayLoader(EquipmentNamespace, EquipmentInventory);
            _unsubscribes.Add(pieces.Subscribe(gs2, session, (_, _, value) =>
            {
                _inbox.Post(() =>
                {
                    _piecesRead++;
                    OnPieces(value);
                });
                return Task.CompletedTask;
            }, () => { }));
            ReadPieces(pieces);

            ReadSlotNames();
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
                if (this != null) ShowroomLog.Failure("The characters could not be read", error);
            }
        }

        private async void ReadPieces(Gs2Bind.Gs2Inventory.ItemSetArrayLoader pieces)
        {
            var read = ++_piecesRead;
            try
            {
                var value = await pieces.Load(_gs2!, _session!);
                if (read == _piecesRead && this != null) OnPieces(value);
            }
            catch (Exception error)
            {
                if (this != null) ShowroomLog.Failure("The equipment could not be read", error);
            }
        }

        private async void ReadSlotNames()
        {
            try
            {
                var names = await LoadoutCommands.SlotNames(_gs2!, _session!);
                if (this == null) return;
                _slotNames = names;
                if (_slot == null && names.Count > 0) _slot = names[0];
                Draw();
            }
            catch (Exception error)
            {
                if (this != null) ShowroomLog.Failure("The loadout shape could not be read", error);
            }
        }

        private void OnCharacters(EzItemSet[]? characters)
        {
            _characters = characters ?? Array.Empty<EzItemSet>();
            FollowLoadouts();
            var present = false;
            foreach (var character in _characters)
            {
                if (character.ItemSetId == _character) present = true;
            }
            if (!present) _character = _characters.Length > 0 ? _characters[0].ItemSetId : null;
            Draw();
        }

        private void OnPieces(EzItemSet[]? pieces)
        {
            _pieces = pieces ?? Array.Empty<EzItemSet>();
            Draw();
        }

        /// <summary>Watch every owned character so equipment cards can name the wearer even when another character is selected.</summary>
        private void FollowLoadouts()
        {
            if (_gs2 == null || _session == null) return;
            var held = new HashSet<string>();
            foreach (var character in _characters)
            {
                var id = character.ItemSetId;
                if (string.IsNullOrEmpty(id)) continue;
                held.Add(id);
                if (_loadoutSubscriptions.ContainsKey(id)) continue;

                // Preserve the inventory's exact property id so the read and subscription share the same cache identity.
                var loadout = new Gs2Bind.Gs2Formation.PropertyFormLoader(
                    LoadoutCommands.Namespace, LoadoutCommands.FormModel, id);
                _loadoutSubscriptions[id] = loadout.Subscribe(_gs2, _session, (_, _, value) =>
                {
                    _inbox.Post(() =>
                    {
                        // Ignore queued callbacks for characters whose subscriptions were removed.
                        if (!_loadoutSubscriptions.ContainsKey(id)) return;
                        _loadoutReads[id] = _loadoutReads.TryGetValue(id, out var count) ? count + 1 : 1;
                        OnLoadout(id, value);
                    });
                    return Task.CompletedTask;
                }, () => { });
                ReadLoadout(loadout, id);
            }

            var dropped = new List<string>();
            foreach (var id in _loadoutSubscriptions.Keys)
            {
                if (!held.Contains(id)) dropped.Add(id);
            }
            foreach (var id in dropped)
            {
                _loadoutSubscriptions[id]();
                _loadoutSubscriptions.Remove(id);
                _loadouts.Remove(id);
                _loadoutReads.Remove(id);
            }
        }

        private async void ReadLoadout(Gs2Bind.Gs2Formation.PropertyFormLoader loadout, string character)
        {
            var read = _loadoutReads[character] = _loadoutReads.TryGetValue(character, out var count) ? count + 1 : 1;
            try
            {
                var value = await loadout.LoadOrNull(_gs2!, _session!);
                if (this == null) return;
                if (_loadoutReads.TryGetValue(character, out var latest) && latest == read) OnLoadout(character, value);
            }
            catch (Exception error)
            {
                if (this != null) ShowroomLog.Failure("A loadout could not be read", error);
            }
        }

        private void OnLoadout(string character, EzPropertyForm? form)
        {
            if (!_loadoutSubscriptions.ContainsKey(character)) return;
            var slots = new Dictionary<string, string>();
            if (form?.Slots != null)
            {
                foreach (var slot in form.Slots)
                {
                    if (string.IsNullOrEmpty(slot.Name) || string.IsNullOrEmpty(slot.PropertyId)) continue;
                    slots[slot.Name] = slot.PropertyId;
                }
            }
            _loadouts[character] = slots;
            Draw();
        }

        private void Press(Func<Gs2Domain, IGameSession, Task<string>> write)
        {
            ShowroomPress.Run(new ShowroomPressOptions
            {
                Name = "saving the loadout",
                Owner = this,
                Explain = error => $"The loadout could not be saved: {ShowroomErrors.Describe(error)}",
            }, write);
        }

        private void Choose(string character)
        {
            if (character == _character) return;
            _character = character;
            Draw();
        }

        private void ChooseSlot(string slot)
        {
            if (slot == _slot) return;
            _slot = slot;
            Draw();
        }

        private void Put(string piece)
        {
            if (_character == null)
            {
                ShowroomLog.Say("Recruit a character above first.");
                return;
            }
            if (_slot == null)
            {
                ShowroomLog.Say("The slots are still loading.");
                return;
            }
            var character = _character;
            var slot = _slot;
            Press((gs2, session) => LoadoutCommands.Equip(gs2, session, character, slot, piece));
        }

        private void TakeOff()
        {
            if (_character == null || _slot == null) return;
            var character = _character;
            var slot = _slot;
            Press((gs2, session) => LoadoutCommands.Unequip(gs2, session, character, slot));
        }

        private Dictionary<string, string> LoadoutOf(string? character)
        {
            return character != null && _loadouts.TryGetValue(character, out var slots)
                ? slots
                : new Dictionary<string, string>();
        }


        private void Build()
        {
            Caption("Character");
            _tabs = Horizontal("Tabs", 52);
            _tabsHint = Caption("Recruit a character above to start.");
            Caption("Slots  (tap to choose where equipment goes)");
            _slots = Horizontal("Slots", 96);
            _takeOff = Horizontal("TakeOff", 44);
            Caption("Equipment  (tap to put it in the chosen slot)");
            _equipment = Grid("Equipment");
            _equipmentHint = Caption("Take a piece of equipment above to start.");
            // Hide empty rows because their layout elements otherwise reserve space without cards.
            _tabs.gameObject.SetActive(false);
            _takeOff.gameObject.SetActive(false);
        }

        private void Draw()
        {
            DrawTabs();
            DrawSlots();
            DrawEquipment();
        }

        private void DrawTabs()
        {
            if (_tabs == null || _tabsHint == null) return;
            Clear(_tabs);
            _tabsHint.gameObject.SetActive(_characters.Length == 0);
            // Hide the row with its last card so an empty layout does not leave a gap.
            _tabs.gameObject.SetActive(_characters.Length > 0);
            var names = Distinguished(_characters);
            for (var index = 0; index < _characters.Length; index++)
            {
                var id = _characters[index].ItemSetId;
                if (string.IsNullOrEmpty(id)) continue;
                var selected = id == _character;
                Card(_tabs, names[index], selected ? AccentColor : TabColor,
                    selected ? DarkText : LightText, () => Choose(id));
            }
        }

        private void DrawSlots()
        {
            if (_slots == null || _takeOff == null) return;
            Clear(_slots);
            Clear(_takeOff);
            if (_slotNames == null) return;
            var worn = LoadoutOf(_character);
            foreach (var slot in _slotNames)
            {
                var chosen = slot == _slot;
                var filled = worn.TryGetValue(slot, out var piece);
                var text = filled
                    ? $"{LoadoutCommands.ItemName(piece)}\n<size=13>{slot}</size>"
                    : $"Empty\n<size=13>{slot}</size>";
                var color = chosen ? AccentColor : filled ? FilledCardColor : EmptyCardColor;
                var textColor = chosen ? DarkText : filled ? LightText : MutedText;
                Card(_slots, text, color, textColor, () => ChooseSlot(slot));
            }

            var wearing = _slot != null && worn.ContainsKey(_slot);
            _takeOff.gameObject.SetActive(wearing);
            if (wearing)
            {
                Card(_takeOff, $"Take off {LoadoutCommands.ItemName(worn[_slot!])} from {_slot}",
                    FilledCardColor, LightText, TakeOff);
            }
        }

        private void DrawEquipment()
        {
            if (_equipment == null || _equipmentHint == null) return;
            Clear(_equipment);
            _equipmentHint.gameObject.SetActive(_pieces.Length == 0);
            var names = Distinguished(_pieces);
            var characterNames = Distinguished(_characters);
            var mine = LoadoutOf(_character);
            for (var index = 0; index < _pieces.Length; index++)
            {
                var id = _pieces[index].ItemSetId;
                if (string.IsNullOrEmpty(id)) continue;
                var wornHere = mine.ContainsValue(id);
                var wearers = Wearers(id, characterNames);
                var text = wearers.Length == 0 ? names[index] : $"{names[index]}\n<size=13>{wearers}</size>";
                Card(_equipment, text, wornHere ? AccentColor : FilledCardColor,
                    wornHere ? DarkText : LightText, () => Put(id));
            }
        }

        private string Wearers(string piece, IReadOnlyList<string> characterNames)
        {
            var text = new StringBuilder();
            for (var index = 0; index < _characters.Length; index++)
            {
                var character = _characters[index].ItemSetId;
                if (character == null || !_loadouts.TryGetValue(character, out var slots)) continue;
                foreach (var slot in slots)
                {
                    if (slot.Value != piece) continue;
                    text.Append(text.Length == 0 ? "Worn by " : ", ");
                    text.Append($"{characterNames[index]} ({slot.Key})");
                }
            }
            return text.ToString();
        }

        /// <summary>Distinguish multiple item sets of the same item so separate recruits are not shown with identical names.</summary>
        private static IReadOnlyList<string> Distinguished(EzItemSet[] itemSets)
        {
            var seen = new Dictionary<string, int>();
            var names = new List<string>();
            foreach (var itemSet in itemSets)
            {
                var name = itemSet.ItemName ?? "";
                seen[name] = seen.TryGetValue(name, out var count) ? count + 1 : 1;
                names.Add(seen[name] == 1 ? name : $"{name} #{seen[name]}");
            }
            return names;
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
            layout.constraintCount = EquipmentColumns;
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
            // Release the row template's fixed width so the board layout can size this card.
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
                // Deactivate before deferred destruction so the layout stops reserving space for the old card.
                var child = parent.GetChild(index).gameObject;
                child.SetActive(false);
                Destroy(child);
            }
        }
    }
}
