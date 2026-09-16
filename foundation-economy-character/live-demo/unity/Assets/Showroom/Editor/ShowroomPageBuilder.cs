// Builds a demo's page out of the components the package generated.
//
// A demo exists to show what GS2 Studio produces, so the page is assembled
// from exactly that: one section per generated handler, a row per generated
// label, a row per generated button action. Nothing here knows which package
// it is building for — it reads the assembly.
//
// The output is a scene. It is written once, from `ShowroomTemplate.unity`,
// and from then on it belongs to the demo: a developer opens it, rearranges
// it, writes better prose. Re-running with `-showroomRebuildPage` replaces the
// content again, which is what to do after the package's UI components change.
#nullable disable
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Gs2.Core.Exception;
using Gs2.Unity.Util;
using UnityEditor;
using UnityEditor.Events;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

namespace GS2Studio.Showroom.EditorTools
{
    public static class ShowroomPageBuilder
    {
        private const string ScenePath = "Assets/Scenes/Showroom.unity";
        private const string TemplateScenePath = "Assets/Showroom/ShowroomTemplate.unity";
        private const string SectionPrefabPath = "Assets/Showroom/ShowroomSection.prefab";
        private const string ValueRowPrefabPath = "Assets/Showroom/ShowroomValueRow.prefab";
        private const string ActionRowPrefabPath = "Assets/Showroom/ShowroomActionRow.prefab";
        private const string GaugeRowPrefabPath = "Assets/Showroom/ShowroomGaugeRow.prefab";
        private const string GeneratedPrefabDirectory = "Assets/Showroom/Generated";
        private const string GeneratedNamespacePrefix = "GS2Studio.Generated.";

        /// <summary>
        /// One row of a section, as the page declares it.
        ///
        /// A row names the component it draws and, where that component cannot
        /// stand alone, what completes it: a bar needs to say what its fill
        /// counts, and a `DateTime` has no reading until a behaviour turns it
        /// into time left. Both are facts about the page rather than about the
        /// component, which is why neither can be read off the assembly — from
        /// in here a template label and a plain value look exactly alike.
        /// </summary>
        private struct RowSpec
        {
            public string Component;
            /// <summary>Label drawn on a bar, or beside a button. Null otherwise.</summary>
            public string Caption;
            /// <summary>Behaviour that draws the time left until a `DateTime`. Null otherwise.</summary>
            public string Countdown;
        }

        /// <summary>
        /// One section of a page: the rows it carries, in the order it carries
        /// them, and which of its conditions govern which of them.
        ///
        /// Every section is built from one of these, whether the demo wrote it
        /// or {@link DeriveSection} worked it out from the assembly. That is
        /// the point of the type: for as long as the builder composed the page
        /// itself and a demo could only nudge the result, each question it
        /// could not answer became another channel in `page.json` — which
        /// reading sits on which bar, which axis a list mounts from, which
        /// rows a condition governs, what order they read in. The one that
        /// never arrived was leaving a component off, which is what a page
        /// with one use for a model that has two needs most: a dex and a
        /// roster show the same `Character` and want different rows.
        /// </summary>
        private class SectionSpec
        {
            /// <summary>
            /// Which of the collection's mount axes a keyed model's list reads
            /// through, named as a member of the generated `{Model}ListAxis`
            /// enum — a GS2 model and a side, e.g. `InventoryCharacterUser`.
            ///
            /// There is no default. A list whose collection offers more than
            /// one axis cannot be pointed at one of them by anything but the
            /// page: the generator's own pick is whichever loader it elected
            /// as primary, which is not an answer to what a page wants to
            /// show. A section that leaves this null fails the bake rather
            /// than taking a guess.
            /// </summary>
            public string Axis;
            public List<RowSpec> Rows = new List<RowSpec>();
            /// <summary>Condition component name to the rows it governs.</summary>
            public Dictionary<string, string[]> Toggles = new Dictionary<string, string[]>();
        }

        /// <summary>
        /// What the demo declared, by model name. A model absent from here is
        /// derived from the assembly instead, and what was derived is logged in
        /// the same shape `page.json` takes, so an author can paste it back and
        /// start cutting.
        /// </summary>
        private static Dictionary<string, SectionSpec> _declaredSections =
            new Dictionary<string, SectionSpec>();

        /// <summary>
        /// Entry point for `-executeMethod`. Reads `-showroomTitle`,
        /// `-showroomSubtitle`, `-showroomRebuildPage` and the path of the
        /// declaration `page.mjs` wrote out of `page.json`, and owns the exit
        /// code; the work itself is <see cref="BuildPage"/>, which an open
        /// Editor can call directly instead of paying for another launch.
        /// </summary>
        public static void Build()
        {
            try
            {
                BuildPage(
                    ReadArgument("-showroomTitle"),
                    ReadArgument("-showroomSubtitle"),
                    ReadArgument("-showroomRebuildPage") == "true",
                    ReadDeclaration(ReadArgument("-showroomDeclaration")),
                    writesAxis: true);
                EditorApplication.Exit(0);
            }
            catch (Exception exception)
            {
                Debug.LogError($"[showroom] page build threw: {exception}");
                EditorApplication.Exit(1);
            }
        }

        /// <summary>
        /// Read the declaration `page.mjs` wrote out of `page.json`.
        ///
        /// Tab-separated lines rather than JSON: the authored surface is
        /// `page.json`, and the half that reads it is Node, where JSON is
        /// native. What crosses into the Editor is a wire format between two
        /// halves of one tool, and keeping it parseable by `Split` is worth
        /// more than keeping it pretty — the Editor has no JSON reader it can
        /// rely on without taking a package dependency for one.
        ///
        ///   section  MODEL  AXIS
        ///   row      MODEL  COMPONENT  CAPTION  COUNTDOWN
        ///   toggle   MODEL  CONDITION  ROW|ROW
        ///
        /// A `section` line is what declares the model: a model with no line
        /// at all is derived from the assembly instead, which is not the same
        /// as a model that declared no rows and means it.
        /// </summary>
        private static Dictionary<string, SectionSpec> ReadDeclaration(string path)
        {
            var declared = new Dictionary<string, SectionSpec>();
            if (string.IsNullOrEmpty(path) || !File.Exists(path)) return declared;
            foreach (var line in File.ReadAllLines(path))
            {
                var parts = line.Split('\t');
                if (parts.Length < 2 || parts[1].Length == 0) continue;
                if (!declared.TryGetValue(parts[1], out var section))
                {
                    section = new SectionSpec();
                    declared[parts[1]] = section;
                }
                if (parts[0] == "section" && parts.Length > 2 && parts[2].Length > 0)
                {
                    section.Axis = parts[2];
                }
                else if (parts[0] == "row" && parts.Length > 2)
                {
                    section.Rows.Add(new RowSpec
                    {
                        Component = parts[2],
                        Caption = parts.Length > 3 && parts[3].Length > 0 ? parts[3] : null,
                        Countdown = parts.Length > 4 && parts[4].Length > 0 ? parts[4] : null,
                    });
                }
                else if (parts[0] == "toggle" && parts.Length > 3)
                {
                    section.Toggles[parts[2]] = parts[3].Split('|');
                }
            }
            return declared;
        }

        /// <summary>
        /// Writes the demo's page. Returns the number of sections, or -1 when
        /// the scene already existed and was left alone.
        /// </summary>
        public static int BuildPage(string title, string subtitle, bool rebuild)
        {
            return BuildPage(
                title, subtitle, rebuild, new Dictionary<string, SectionSpec>(), writesAxis: false);
        }

        /// <summary>
        /// The whole build, once the declaration has been read. Private
        /// because <see cref="SectionSpec"/> is: an open Editor calls the
        /// three-argument overload, and a batch run comes through
        /// <see cref="Build"/>, so the declaration never crosses the type's
        /// own boundary.
        /// </summary>
        private static int BuildPage(
            string title, string subtitle, bool rebuild,
            Dictionary<string, SectionSpec> declaredSections, bool writesAxis)
        {
            _declaredSections = declaredSections ?? new Dictionary<string, SectionSpec>();
            var existed = File.Exists(ScenePath);
            if (existed && !rebuild)
            {
                Debug.Log($"[showroom] {ScenePath} already exists; left alone");
                return -1;
            }

            var scene = OpenOrCreateScene(existed);
            var page = UnityEngine.Object.FindAnyObjectByType<ShowroomPage>();
            if (page == null) throw new InvalidOperationException("no ShowroomPage in the scene");

            ApplyHeader(page, title, subtitle);
            var content = ContentMount(page);
            ClearChildren(content);
            var sections = BuildSections(content, page, writesAxis);

            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene, ScenePath);
            Debug.Log($"[showroom] wrote {ScenePath} with {sections} section(s)");
            return sections;
        }

        private static UnityEngine.SceneManagement.Scene OpenOrCreateScene(bool existed)
        {
            if (existed) return EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
            // Copied rather than described a second time, so the shell a demo
            // starts from is the one the shared host is known to run.
            Directory.CreateDirectory(Path.GetDirectoryName(ScenePath) ?? "Assets/Scenes");
            if (!AssetDatabase.CopyAsset(TemplateScenePath, ScenePath))
                throw new InvalidOperationException($"could not copy {TemplateScenePath}");
            AssetDatabase.Refresh();
            return EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
        }

        private static void ApplyHeader(ShowroomPage page, string title, string subtitle)
        {
            var header = page.transform.Find("Canvas/Background/Root/Header");
            if (header == null) return;
            SetText(header.Find("Title"), title);
            SetText(header.Find("Subtitle"), subtitle);
        }

        private static void SetText(Transform target, string value)
        {
            if (target == null || string.IsNullOrEmpty(value)) return;
            var text = target.GetComponent<Text>();
            if (text == null) return;
            text.text = value;
            EditorUtility.SetDirty(text);
        }

        private static Transform ContentMount(ShowroomPage page)
        {
            var mount = page.transform.Find("Canvas/Background/Root/Content/Viewport/Content");
            if (mount == null) throw new InvalidOperationException("no content mount in the chrome");
            return mount;
        }

        private static void ClearChildren(Transform parent)
        {
            var doomed = new List<GameObject>();
            for (var i = 0; i < parent.childCount; i++) doomed.Add(parent.GetChild(i).gameObject);
            foreach (var child in doomed) UnityEngine.Object.DestroyImmediate(child);
        }

        /// <summary>
        /// Strips the generated components a previous build left on the mount
        /// itself. <see cref="ClearChildren"/> destroys children and nothing
        /// else, so page-root handlers would otherwise stack up one copy per
        /// rebuild — each one binding and reloading alongside the others.
        /// Only the generated namespace is touched; anything a demo author
        /// added to the mount by hand is theirs to keep.
        /// </summary>
        private static void ClearGeneratedComponents(Transform mount)
        {
            var doomed = mount.GetComponents<MonoBehaviour>()
                .Where(component =>
                    component != null &&
                    (component.GetType().Namespace ?? "").StartsWith(GeneratedNamespacePrefix))
                .ToList();
            foreach (var component in doomed) UnityEngine.Object.DestroyImmediate(component);
        }

        /// <summary>
        /// The generated handlers that own a binder of their own, in a stable
        /// order. List and list-item handlers are excluded: they are driven by
        /// a parent rather than standing on their own in a page.
        /// </summary>
        private static IReadOnlyList<Type> GeneratedHandlers()
        {
            return AppDomain.CurrentDomain.GetAssemblies()
                .SelectMany(SafeTypes)
                .Where(type =>
                    type.IsClass && !type.IsAbstract &&
                    typeof(MonoBehaviour).IsAssignableFrom(type) &&
                    (type.Namespace ?? "").StartsWith(GeneratedNamespacePrefix) &&
                    type.Name.EndsWith("Handler") &&
                    !type.Name.EndsWith("ListHandler") &&
                    !type.Name.EndsWith("ListItemHandler") &&
                    type.GetMethod("Reload", Type.EmptyTypes) != null)
                .OrderBy(type => type.Name, StringComparer.Ordinal)
                .ToList();
        }

        private static IEnumerable<Type> SafeTypes(Assembly assembly)
        {
            try { return assembly.GetTypes(); }
            catch (ReflectionTypeLoadException error) { return error.Types.Where(t => t != null); }
        }

        /// <summary>
        /// The gauges a package generated for this handler. A gauge has no
        /// event to find it by — it writes an Image's fill directly — so it is
        /// recognised by the target it is given.
        /// </summary>
        private static IReadOnlyList<Type> GaugesFor(Type handler)
        {
            var uiNamespace = handler.Namespace + ".UI";
            return SafeTypes(handler.Assembly)
                .Where(type =>
                    type.IsClass && !type.IsAbstract && type.Namespace == uiNamespace &&
                    type.GetField("_target", BindingFlags.Instance | BindingFlags.NonPublic)
                        ?.FieldType == typeof(Image))
                .OrderBy(type => type.Name, StringComparer.Ordinal)
                .ToList();
        }

        /// <summary>
        /// UI components the same package generated for this handler, narrowed
        /// to those whose event carries the payload the caller knows how to
        /// wire.
        ///
        /// The event name alone is not enough to tell them apart: a `value`
        /// component publishes its property's native type, so a timestamp
        /// reading also answers to `OnUpdate`, but as
        /// `UnityEvent&lt;DateTime&gt;`. The showroom only knows how to put a
        /// string into a `Text`, so anything else is left undrawn rather than
        /// cast into a page-wide failure.
        /// </summary>
        private static IReadOnlyList<Type> UiComponentsFor(
            Type handler, string eventPropertyName, Type eventType)
        {
            var uiNamespace = handler.Namespace + ".UI";
            return SafeTypes(handler.Assembly)
                .Where(type =>
                    type.IsClass && !type.IsAbstract && type.Namespace == uiNamespace &&
                    type.GetProperty(eventPropertyName)?.PropertyType == eventType)
                .OrderBy(type => type.Name, StringComparer.Ordinal)
                .ToList();
        }

        /// <summary>
        /// The active toggles a package generated for this handler. A toggle
        /// has no event to find it by — it switches GameObjects on and off —
        /// so it is recognised by the pair of target arrays it is given.
        /// </summary>
        private static IReadOnlyList<Type> TogglesFor(Type handler)
        {
            var uiNamespace = handler.Namespace + ".UI";
            return SafeTypes(handler.Assembly)
                .Where(type =>
                    type.IsClass && !type.IsAbstract && type.Namespace == uiNamespace &&
                    (TargetArrayField(type, "_activeWhenTrue") != null ||
                     TargetArrayField(type, "_interactableWhenTrue") != null))
                .OrderBy(type => type.Name, StringComparer.Ordinal)
                .ToList();
        }

        /// <summary>
        /// The serialized target array a condition component exposes under this
        /// name, or null when it has none. The two kinds hold different things
        /// — an active toggle switches `GameObject`s off, an interactable greys
        /// `Selectable`s out — so which name is present is what tells them
        /// apart, and the element type is left to the component.
        /// </summary>
        private static FieldInfo TargetArrayField(Type type, string name)
        {
            var field = type.GetField(name, BindingFlags.Instance | BindingFlags.NonPublic);
            return field != null && field.FieldType.IsArray ? field : null;
        }

        private static int BuildSections(Transform content, ShowroomPage page, bool writesAxis)
        {
            var sectionPrefab = AssetDatabase.LoadAssetAtPath<GameObject>(SectionPrefabPath);
            var handlers = GeneratedHandlers();
            ClearGeneratedComponents(content);
            // Every handler answers a completed action, because an action can
            // change anything the page is showing and a handler has no other
            // way to hear about it.
            var placed = new List<Component>();
            var sections = new List<(Type Handler, Transform Body)>();

            foreach (var handler in handlers)
            {
                var labels = UiComponentsFor(handler, "OnUpdate", typeof(UnityEvent<string>));
                var buttons = UiComponentsFor(handler, "OnCompleted", typeof(UnityEvent));
                var gauges = GaugesFor(handler);
                var clocks = UiComponentsFor(handler, "OnUpdate", typeof(UnityEvent<DateTime>));
                var toggles = TogglesFor(handler);
                if (labels.Count == 0 && buttons.Count == 0 && gauges.Count == 0 &&
                    clocks.Count == 0)
                {
                    // Nothing to draw, but something to read: a configuration
                    // model a package never gave a component of its own is
                    // still what another section's reading is composed from.
                    // So it is mounted without a section — an empty heading
                    // over an empty body says nothing a visitor wants — and
                    // stays out of `placed`, because a handler that draws
                    // nothing has nothing to redraw, and reloading it after
                    // every action would throw away a cache for no one.
                    if (!NeedsIdentityKeys(handler)) content.gameObject.AddComponent(handler);
                    continue;
                }

                var section = (GameObject)PrefabUtility.InstantiatePrefab(sectionPrefab, content);
                section.name = ModelNameOf(handler);
                SetText(section.transform.Find("Heading"), Humanize(ModelNameOf(handler)));
                var explainer = section.transform.Find("Explainer");
                // Nothing here knows what to say about the model; a demo author
                // writes it, and an empty line of placeholder prose is worse
                // than none.
                if (explainer != null) explainer.gameObject.SetActive(false);
                sections.Add((handler, section.transform));
                var spec = SectionFor(
                    ModelNameOf(handler), handler, labels, buttons, gauges, clocks, toggles);

                // A handler whose `SetKeys` takes arguments cannot stand on its
                // own: it would sit in the page with an empty id, bind nothing
                // and render a row of blanks. A keyed model is a set of rows,
                // so its list handler shows them and each row carries its own
                // copy of the components.
                if (NeedsIdentityKeys(handler))
                {
                    AddList(
                        section, handler, labels, buttons, gauges, clocks, toggles, page, spec,
                        writesAxis);
                    continue;
                }

                // A single-entry handler serves the whole page rather than one
                // section: a component resolves its handler by walking up the
                // parent chain, so mounting it on the page root puts it above
                // every section at once. Its own rows still reach it — they
                // climb `label -> Items -> Section -> content` — and a gauge in
                // another section's list row can now read it too, which is what
                // a reading composed from two models needs.
                placed.Add(content.gameObject.AddComponent(handler));
                var body = ItemsOf(section.transform);
                RealizeRows(ModelNameOf(handler), body, handler, spec, page);
                WireToggles(ModelNameOf(handler), section, toggles, body, spec);
            }

            foreach (var (_, body) in sections)
            {
                foreach (var button in body.GetComponentsInChildren<MonoBehaviour>(true))
                {
                    var completed = button.GetType().GetProperty("OnCompleted");
                    if (completed?.PropertyType != typeof(UnityEvent)) continue;
                    var unityEvent = (UnityEvent)completed.GetValue(button);
                    foreach (var handlerComponent in placed)
                        UnityEventTools.AddVoidPersistentListener(
                            unityEvent,
                            (UnityAction)Delegate.CreateDelegate(
                                typeof(UnityAction), handlerComponent, "Reload"));
                    EditorUtility.SetDirty(button);
                }
            }
            return sections.Count;
        }

        /// <summary>
        /// Whether the handler needs identity keys set before it binds. A
        /// single-entry model's `SetKeys()` takes none.
        /// </summary>
        private static bool NeedsIdentityKeys(Type handler)
        {
            var setKeys = handler.GetMethods()
                .Where(method => method.Name == "SetKeys")
                .OrderBy(method => method.GetParameters().Length)
                .FirstOrDefault();
            return setKeys != null && setKeys.GetParameters().Length > 0;
        }

        private static Type SiblingType(Type handler, string name)
        {
            return SafeTypes(handler.Assembly).FirstOrDefault(
                type => type.Namespace == handler.Namespace && type.Name == name);
        }

        /// <summary>
        /// Shows a keyed model as the list it is: the generated list handler
        /// spawns one item per row, and the item prefab carries the components
        /// that bind to it. A button inside an item resolves its handler
        /// through the parent chain, which is the item handler, so an action
        /// acts on the row it sits in.
        /// </summary>
        private static void AddList(
            GameObject section, Type handler, IReadOnlyList<Type> labels,
            IReadOnlyList<Type> buttons, IReadOnlyList<Type> gauges,
            IReadOnlyList<Type> clocks, IReadOnlyList<Type> toggles, ShowroomPage page,
            SectionSpec spec, bool writesAxis)
        {
            var model = ModelNameOf(handler);
            var listHandler = SiblingType(handler, model + "ListHandler");
            var itemHandler = SiblingType(handler, model + "ListItemHandler");
            if (listHandler == null || itemHandler == null)
            {
                Debug.LogWarning(
                    $"[showroom] {model} needs identity keys and has no list handler; " +
                    "its section is left empty for a demo author to wire");
                return;
            }

            var itemPrefab = BuildListItemPrefab(
                model, itemHandler, labels, buttons, gauges, clocks, toggles, page, spec);
            var list = section.AddComponent(listHandler);
            var serialized = new SerializedObject(list);
            serialized.FindProperty("_itemPrefab").objectReferenceValue =
                itemPrefab.GetComponent(itemHandler);
            serialized.FindProperty("_contentParent").objectReferenceValue = ItemsOf(section.transform);
            // Which of the collection's mount axes this list reads through.
            // The field is absent when the collection offers only one.
            //
            // `writesAxis` is false on the three-argument BuildPage overload,
            // which an open Editor calls with no declaration to read: under
            // the rule that a missing axis fails the bake, that path could
            // never build a page carrying a list with more than one axis. It
            // does not need to. There is a person there, and the axis is a
            // dropdown in the Inspector — so the field is left holding
            // whatever it already held, including the zero a freshly added
            // component starts at, which the generated handler names in the
            // console until someone picks an axis.
            if (writesAxis)
            {
                var axis = serialized.FindProperty("_axis");
                if (axis != null)
                {
                    // intValue, not enumValueIndex: the axis values are derived
                    // from member names rather than positions, so they are not
                    // a dense 0..n-1 range and an index into the member list is
                    // not the value. intValue is the serialized representation
                    // itself.
                    axis.intValue = ListAxisValue(listHandler, model, spec);
                }
                else if (!string.IsNullOrEmpty(spec.Axis))
                {
                    // The other half of the drift ListAxisValue names. There,
                    // a field with no enum beside it; here, a declaration with
                    // no field to put it in. Both mean the demo's generated
                    // code and what is asking about it disagree, and the one
                    // thing neither may do is carry on: a declaration nobody
                    // consumes, dropped without a word, is the failure this
                    // whole channel exists to stop being possible.
                    //
                    // A list with no declaration and no field is not drift. It
                    // reads through the single axis its collection offers, and
                    // mounts it directly.
                    throw new InvalidOperationException(
                        $"[showroom] {model}: `page.json` names the mount axis '{spec.Axis}', " +
                        $"but {model}ListHandler has no '_axis' field to put it in. Either the " +
                        "demo's generated code predates the axis enum — regenerate it before " +
                        "baking — or this list reads through a single axis and the declaration " +
                        "should go.");
                }
            }
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        /// <summary>
        /// The value of the mount axis this model's list reads through, taken
        /// from the `{Model}ListAxis` enum the generator emitted rather than
        /// assumed, so a member added or renamed there cannot silently point a
        /// demo at a different GS2 model.
        ///
        /// Every failure throws, and the throw reaches <see cref="Build"/>,
        /// which exits non-zero. Nothing here falls back to an axis of its own
        /// choosing: the bake reports only its exit code, so a warning and a
        /// default would put a page in front of a model nobody asked for and
        /// leave the run looking clean.
        /// </summary>
        private static int ListAxisValue(Type listHandler, string model, SectionSpec section)
        {
            var axisEnum = SiblingType(listHandler, model + "ListAxis");
            if (axisEnum == null)
            {
                throw new InvalidOperationException(
                    $"[showroom] {model}ListHandler carries an '_axis' field but no " +
                    $"{model}ListAxis enum sits beside it. The generated code and this " +
                    "builder have drifted; regenerate the demo's Unity artifacts.");
            }
            // The zero member is what an unwritten field reads as, not an axis
            // anything can be pointed at, so it is neither offered nor
            // accepted. Found by value rather than by name so the generator
            // stays free to spell it however it likes.
            var names = Enum.GetNames(axisEnum)
                .Where(name => Convert.ToInt32(Enum.Parse(axisEnum, name)) != 0)
                .ToArray();
            var offered = string.Join(", ", names);
            if (string.IsNullOrEmpty(section.Axis))
            {
                throw new InvalidOperationException(
                    $"[showroom] {model} reads through one of several mount axes and " +
                    "`page.json` does not say which. Add \"axis\" to its section; " +
                    $"the generator offers {offered}.");
            }
            // Ordinal, and exact: an axis name is a generated identifier, so a
            // near miss is a mistake worth naming rather than one to absorb.
            if (Array.IndexOf(names, section.Axis) < 0)
            {
                throw new InvalidOperationException(
                    $"[showroom] {model}: `page.json` names the mount axis '{section.Axis}', " +
                    $"which {model}ListAxis does not declare. The generator offers {offered}.");
            }
            return Convert.ToInt32(Enum.Parse(axisEnum, section.Axis));
        }

        private static GameObject BuildListItemPrefab(
            string model, Type itemHandler, IReadOnlyList<Type> labels,
            IReadOnlyList<Type> buttons, IReadOnlyList<Type> gauges,
            IReadOnlyList<Type> clocks, IReadOnlyList<Type> toggles, ShowroomPage page,
            SectionSpec spec)
        {
            var sectionPrefab = AssetDatabase.LoadAssetAtPath<GameObject>(SectionPrefabPath);
            var item = (GameObject)PrefabUtility.InstantiatePrefab(sectionPrefab);
            PrefabUtility.UnpackPrefabInstance(
                item, PrefabUnpackMode.Completely, InteractionMode.AutomatedAction);
            item.name = model + "ListItem";
            // An item is one row of the list, so it carries no heading of its own.
            foreach (var label in new[] { "Heading", "Explainer" })
            {
                var child = item.transform.Find(label);
                if (child != null) child.gameObject.SetActive(false);
            }
            item.AddComponent(itemHandler);
            var body = ItemsOf(item.transform);
            RealizeRows(model, body, itemHandler, spec, page);
            WireToggles(model, item, toggles, body, spec);

            Directory.CreateDirectory(GeneratedPrefabDirectory);
            var path = $"{GeneratedPrefabDirectory}/{model}ListItem.prefab";
            var saved = PrefabUtility.SaveAsPrefabAsset(item, path);
            UnityEngine.Object.DestroyImmediate(item);
            return saved;
        }

        /// <summary>
        /// Where a section's rows go.
        ///
        /// Never the section root: a generated list handler owns the sibling
        /// order of what it is pointed at and calls `SetSiblingIndex(i)` per
        /// row, so rows take indices 0..n-1 and push the heading below their
        /// own content.
        /// </summary>
        private static Transform ItemsOf(Transform section)
        {
            var items = section.Find("Items");
            if (items == null)
                throw new InvalidOperationException(
                    $"{section.name} has no Items container; the section prefab is out of date");
            return items;
        }

        /// <summary>
        /// Lays out one section's rows from the declaration it was given.
        ///
        /// One path, whether the demo wrote the declaration or
        /// <see cref="DeriveSection"/> worked it out: a row names a component
        /// and this draws it in the shape that component asks for. The order
        /// rows appear in is the order they were declared in — there is no
        /// second pass that rearranges a finished section, because nothing
        /// composes a section that the page did not ask for.
        /// </summary>
        private static void RealizeRows(
            string model, Transform body, Type handler, SectionSpec section, ShowroomPage page)
        {
            foreach (var row in section.Rows)
            {
                var component = UiComponentNamed(handler, row.Component);
                if (component == null)
                {
                    Debug.LogWarning(
                        $"[showroom] {model}: no generated component named '{row.Component}'; " +
                        "that row is left off the page");
                    continue;
                }
                var caption = row.Caption == null ? null : UiComponentNamed(handler, row.Caption);
                if (row.Caption != null && caption == null)
                {
                    Debug.LogWarning(
                        $"[showroom] {model}: '{row.Component}' names '{row.Caption}' as its " +
                        "reading, but no such component was generated");
                }

                if (IsGauge(component)) AddGaugeRow(body, component, caption);
                else if (IsClock(component)) AddCountdownRow(body, component, row.Countdown);
                else if (IsButton(component)) AddActionRow(body, component, page, caption);
                else if (IsLabel(component)) AddValueRow(body, component);
                else
                {
                    Debug.LogWarning(
                        $"[showroom] {model}: '{row.Component}' is not a kind of row this page " +
                        "knows how to draw");
                }
            }
        }

        /// <summary>
        /// What a section looks like when the demo has not said.
        ///
        /// A starting point, not a second way to build a page: the result is a
        /// declaration in exactly the shape `page.json` takes, and it is logged
        /// so an author can paste it back and cut it down to the rows their
        /// page is actually for. Everything it decides here, it decides because
        /// nobody told it — which reading belongs on a bar is a guess that only
        /// holds when there is one bar and one label, and the order is only the
        /// order things read in when a section has one purpose.
        /// </summary>
        private static SectionSpec DeriveSection(
            IReadOnlyList<Type> labels, IReadOnlyList<Type> buttons,
            IReadOnlyList<Type> gauges, IReadOnlyList<Type> clocks,
            IReadOnlyList<Type> toggles)
        {
            var section = new SectionSpec();
            var readings = new Dictionary<Type, Type>();
            if (gauges.Count == 1 && labels.Count == 1) readings[gauges[0]] = labels[0];

            // Clocks lead: what a visitor is waiting for belongs above what
            // they are waiting on.
            foreach (var clock in clocks)
            {
                section.Rows.Add(new RowSpec { Component = clock.Name });
            }
            if (clocks.Count == 0 && gauges.Count == 0 && labels.Count == 1 && buttons.Count == 1)
            {
                // One value and one action is one thing a visitor does, so it
                // reads as one line.
                section.Rows.Add(
                    new RowSpec { Component = buttons[0].Name, Caption = labels[0].Name });
                return section;
            }

            // Values first, then the bars they summarise, then what a visitor
            // can press: read the state, then act on it.
            foreach (var label in labels)
            {
                if (!readings.ContainsValue(label))
                    section.Rows.Add(new RowSpec { Component = label.Name });
            }
            foreach (var gauge in gauges)
            {
                section.Rows.Add(new RowSpec
                {
                    Component = gauge.Name,
                    Caption = readings.TryGetValue(gauge, out var reading) ? reading.Name : null,
                });
            }
            foreach (var button in buttons)
            {
                section.Rows.Add(new RowSpec { Component = button.Name });
            }
            foreach (var toggle in toggles) section.Toggles[toggle.Name] = new string[0];
            return section;
        }

        /// <summary>
        /// The section a model is built from: what the demo declared, or what
        /// the assembly suggests when it declared nothing. A derived section is
        /// logged in `page.json`'s own shape, because the fastest way to write
        /// a declaration is to start from the one that was guessed.
        /// </summary>
        private static SectionSpec SectionFor(
            string model, Type handler, IReadOnlyList<Type> labels, IReadOnlyList<Type> buttons,
            IReadOnlyList<Type> gauges, IReadOnlyList<Type> clocks, IReadOnlyList<Type> toggles)
        {
            if (_declaredSections.TryGetValue(model, out var declared)) return declared;
            var derived = DeriveSection(labels, buttons, gauges, clocks, toggles);
            Debug.Log(
                $"[showroom] {model}: no section declared in page.json; derived " +
                $"\"rows\": [{string.Join(", ", derived.Rows.Select(RowAsJson))}]");
            return derived;
        }

        /// <summary>One derived row, written the way `page.json` writes one.</summary>
        private static string RowAsJson(RowSpec row)
        {
            if (row.Caption == null && row.Countdown == null) return $"\"{row.Component}\"";
            var extra = row.Caption != null
                ? $", \"caption\": \"{row.Caption}\""
                : $", \"countdown\": \"{row.Countdown}\"";
            return $"{{\"component\": \"{row.Component}\"{extra}}}";
        }

        private static Type UiComponentNamed(Type handler, string name)
        {
            var uiNamespace = handler.Namespace + ".UI";
            return SafeTypes(handler.Assembly).FirstOrDefault(
                type => type.Namespace == uiNamespace && type.Name == name);
        }

        private static bool IsGauge(Type component)
        {
            return component.GetField("_target", BindingFlags.Instance | BindingFlags.NonPublic)
                ?.FieldType == typeof(Image);
        }

        private static bool IsClock(Type component)
        {
            return component.GetProperty("OnUpdate")?.PropertyType == typeof(UnityEvent<DateTime>);
        }

        private static bool IsButton(Type component)
        {
            return component.GetProperty("OnCompleted")?.PropertyType == typeof(UnityEvent);
        }

        private static bool IsLabel(Type component)
        {
            return component.GetProperty("OnUpdate")?.PropertyType == typeof(UnityEvent<string>);
        }

        /// <summary>
        /// Draws one bar: what it measures on the left, the reading on it.
        ///
        /// A fill on its own is a shape a visitor has to guess at, so the row
        /// is named the same way every other row is — from the component, not
        /// from prose written here. The reading names it when there is one,
        /// because the reading is what the number says: a character's bar
        /// fills with experience and is captioned `Level`, which is what its
        /// `2/10` counts. With no reading the fill is all there is, so the
        /// gauge names it.
        /// </summary>
        private static void AddGaugeRow(Transform section, Type gaugeType, Type readingLabelType)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(GaugeRowPrefabPath);
            var row = (GameObject)PrefabUtility.InstantiatePrefab(prefab, section);
            row.name = gaugeType.Name;

            var gauge = row.AddComponent(gaugeType);
            var serialized = new SerializedObject(gauge);
            serialized.FindProperty("_target").objectReferenceValue =
                row.transform.Find("Fill").GetComponent<Image>();
            serialized.ApplyModifiedPropertiesWithoutUndo();

            SetText(
                row.transform.Find("Caption"),
                Humanize(TrimModelPrefix(readingLabelType ?? gaugeType)));

            var value = row.transform.Find("Value");
            if (readingLabelType == null) value.gameObject.SetActive(false);
            else BindLabel(row, readingLabelType, value.GetComponent<Text>());
        }

        /// <summary>
        /// Draws a `DateTime` reading through the demo's own countdown
        /// behaviour. A generated `value` component hands over the native type
        /// precisely so the page can decide how it reads, and only the demo
        /// knows what its deadline is a deadline for.
        /// </summary>
        private static void AddCountdownRow(
            Transform section, Type clockType, string behaviourName)
        {
            if (string.IsNullOrEmpty(behaviourName))
            {
                Debug.LogWarning(
                    $"[showroom] {clockType.Name}: a `DateTime` has no reading until a " +
                    "behaviour turns it into time left, and this row named none; " +
                    "its row is left off the page");
                return;
            }
            var behaviourType = TypeNamed(behaviourName);
            if (behaviourType == null)
            {
                Debug.LogWarning(
                    $"[showroom] {clockType.Name}: no MonoBehaviour named '{behaviourName}' " +
                    "in this project; its row is left off the page");
                return;
            }

            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(ValueRowPrefabPath);
            var row = (GameObject)PrefabUtility.InstantiatePrefab(prefab, section);
            row.name = clockType.Name;
            SetText(row.transform.Find("Caption"), Humanize(TrimModelPrefix(clockType)));

            var clock = row.AddComponent(clockType);
            var countdown = row.AddComponent(behaviourType);
            var serialized = new SerializedObject(countdown);
            serialized.FindProperty("_label").objectReferenceValue =
                row.transform.Find("Value").GetComponent<Text>();
            serialized.ApplyModifiedPropertiesWithoutUndo();

            var onUpdate = (UnityEvent<DateTime>)clockType.GetProperty("OnUpdate").GetValue(clock);
            UnityEventTools.AddPersistentListener(
                onUpdate,
                (UnityAction<DateTime>)Delegate.CreateDelegate(
                    typeof(UnityAction<DateTime>), countdown, "SetDeadline"));
            EditorUtility.SetDirty(clock);
            EditorUtility.SetDirty(countdown);
        }

        /// <summary>A MonoBehaviour the demo wrote, by its unqualified name.</summary>
        private static Type TypeNamed(string name)
        {
            return AppDomain.CurrentDomain.GetAssemblies()
                .SelectMany(SafeTypes)
                .FirstOrDefault(type =>
                    type.Name == name && typeof(MonoBehaviour).IsAssignableFrom(type));
        }

        /// <summary>
        /// Mounts each condition-driven component on the section root and
        /// points it at the rows the section declared for it.
        ///
        /// An active toggle takes the rows it hides while its condition does
        /// not hold; an interactable takes the buttons it leaves usable while
        /// its condition does hold. Both read the same declaration, because
        /// both answer "which rows does this govern" — what the condition then
        /// does with them is the component's own business.
        ///
        /// The root is never itself a target: switching off the object a
        /// toggle lives on would unsubscribe it and leave the page stuck in
        /// whichever state it last applied.
        /// </summary>
        private static void WireToggles(
            string model, GameObject root, IReadOnlyList<Type> toggles, Transform body,
            SectionSpec section)
        {
            foreach (var toggleType in toggles)
            {
                if (!section.Toggles.TryGetValue(toggleType.Name, out var declared) ||
                    declared.Length == 0)
                {
                    Debug.LogWarning(
                        $"[showroom] {model}: '{toggleType.Name}' governs no rows in this " +
                        "section's declaration, so it is left off the page");
                    continue;
                }
                var rows = declared
                    .Select(name => body.Find(name.Trim()))
                    .Where(found => found != null)
                    .ToList();
                if (rows.Count == 0)
                {
                    Debug.LogWarning(
                        $"[showroom] {model}: none of '{string.Join("|", declared)}' is a row " +
                        $"on this section, so '{toggleType.Name}' is left off the page");
                    continue;
                }

                var hides = TargetArrayField(toggleType, "_activeWhenTrue") != null;
                var targets = hides
                    ? rows.Select(row => (UnityEngine.Object)row.gameObject).ToList()
                    : rows
                        .Select(row =>
                            (UnityEngine.Object)row.GetComponentInChildren<Selectable>(true))
                        .Where(found => found != null)
                        .ToList();
                if (targets.Count == 0)
                {
                    Debug.LogWarning(
                        $"[showroom] {model}: no Selectable under " +
                        $"'{string.Join("|", declared)}' for '{toggleType.Name}'");
                    continue;
                }

                var toggle = root.AddComponent(toggleType);
                var serialized = new SerializedObject(toggle);
                // The true branch enables, the false branch hides: each kind
                // names the arm that means "the condition is good news".
                var arm = serialized.FindProperty(
                    hides ? "_activeWhenFalse" : "_interactableWhenTrue");
                arm.arraySize = targets.Count;
                for (var i = 0; i < targets.Count; i++)
                {
                    arm.GetArrayElementAtIndex(i).objectReferenceValue = targets[i];
                }
                serialized.ApplyModifiedPropertiesWithoutUndo();
                EditorUtility.SetDirty(toggle);
            }
        }

        private static void AddValueRow(Transform section, Type labelType)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(ValueRowPrefabPath);
            var row = (GameObject)PrefabUtility.InstantiatePrefab(prefab, section);
            row.name = labelType.Name;
            SetText(row.transform.Find("Caption"), Humanize(TrimModelPrefix(labelType)));
            BindLabel(row, labelType, row.transform.Find("Value").GetComponent<Text>());
        }

        private static void AddActionRow(
            Transform section, Type buttonType, ShowroomPage page, Type captionLabelType)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(ActionRowPrefabPath);
            var row = (GameObject)PrefabUtility.InstantiatePrefab(prefab, section);
            row.name = buttonType.Name;
            var button = row.transform.Find("Button");
            SetText(button.Find("Label"), Humanize(TrimModelPrefix(buttonType)));

            var caption = row.transform.Find("Caption");
            if (captionLabelType == null)
            {
                // Nothing to say beside the button; the button's own name is
                // the whole row.
                caption.gameObject.SetActive(false);
            }
            else
            {
                BindLabel(row, captionLabelType, caption.GetComponent<Text>());
            }

            var action = row.AddComponent(buttonType);
            var serialized = new SerializedObject(action);
            serialized.FindProperty("_button").objectReferenceValue = button.GetComponent<Button>();
            serialized.ApplyModifiedPropertiesWithoutUndo();

            // The browser hides the console, so a failure a visitor cannot see
            // is a failure that looks like nothing happening.
            var failed = (ErrorEvent)buttonType.GetProperty("OnFailed").GetValue(action);
            UnityEventTools.AddPersistentListener(
                failed,
                (UnityAction<Gs2Exception, Func<IEnumerator>>)Delegate.CreateDelegate(
                    typeof(UnityAction<Gs2Exception, Func<IEnumerator>>), page, "LogError"));
            EditorUtility.SetDirty(action);
        }

        /// <summary>Adds a generated label and points its update at a Text.</summary>
        private static void BindLabel(GameObject host, Type labelType, Text target)
        {
            var label = host.AddComponent(labelType);
            var onUpdate = (UnityEvent<string>)labelType.GetProperty("OnUpdate").GetValue(label);
            UnityEventTools.AddPersistentListener(
                onUpdate,
                (UnityAction<string>)Delegate.CreateDelegate(
                    typeof(UnityAction<string>), target, "set_text"));
            EditorUtility.SetDirty(label);
        }

        /// <summary>`GS2Studio.Generated.Wallet` -> `Wallet`.</summary>
        private static string ModelNameOf(Type handler)
        {
            var ns = handler.Namespace ?? "";
            return ns.Substring(GeneratedNamespacePrefix.Length);
        }

        /// <summary>
        /// `WalletFreeBalanceLabel` -> `FreeBalance`, `CharacterExperienceGauge`
        /// -> `Experience`. What kind of component it is is already said by the
        /// row it is drawn in, so only what it reads is left. One suffix goes:
        /// the rest of the name is the reading, whatever it happens to end in.
        /// </summary>
        private static string TrimModelPrefix(Type uiComponent)
        {
            var model = (uiComponent.Namespace ?? "")
                .Replace(GeneratedNamespacePrefix, "").Replace(".UI", "");
            var name = uiComponent.Name;
            if (name.StartsWith(model)) name = name.Substring(model.Length);
            foreach (var suffix in new[] { "Label", "Button", "Gauge", "Value", "Toggle" })
            {
                if (!name.EndsWith(suffix) || name.Length <= suffix.Length) continue;
                name = name.Substring(0, name.Length - suffix.Length);
                break;
            }
            return name;
        }

        /// <summary>`FreeBalance` -> `Free balance`, for a caption a visitor reads.</summary>
        private static string Humanize(string pascalCase)
        {
            if (string.IsNullOrEmpty(pascalCase)) return pascalCase;
            var spaced = System.Text.RegularExpressions.Regex.Replace(
                pascalCase, "(?<=[a-z0-9])(?=[A-Z])", " ");
            return char.ToUpperInvariant(spaced[0]) + spaced.Substring(1).ToLowerInvariant();
        }

        private static string ReadArgument(string name)
        {
            var arguments = Environment.GetCommandLineArgs();
            for (var i = 0; i < arguments.Length - 1; i++)
                if (arguments[i] == name) return arguments[i + 1];
            return null;
        }
    }
}
