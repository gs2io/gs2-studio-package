// Builds a demo's page out of the components the package generated.
//
// A demo exists to show what GS2 Studio produces, so the page is assembled
// from exactly that: one section per generated handler, a row per generated
// label, a row per generated button action. Nothing here knows which package
// it is building for — it reads the component manifests the generator wrote
// beside its handlers, and the assembly only to turn a name into a `Type`.
//
// The output is a scene. It is written once, from `ShowroomTemplate.unity`,
// and from then on it belongs to the demo: a developer opens it, rearranges
// it, writes better prose. Re-running with `-showroomRebuildPage` replaces the
// content again, which is what to do after the package's UI components change.
#nullable disable
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
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
        /// Where the generator writes one manifest per model, beside the
        /// handlers it describes: `Handlers/{Model}.showroom.json` under the
        /// managed generated tree.
        /// </summary>
        private const string ManifestDirectory = "Assets/GS2Studio/Generated/Handlers";
        private const string ManifestSuffix = ".showroom.json";
        /// <summary>The manifest schema this builder reads; the generator writes `schemaVersion`.</summary>
        private const int ManifestSchemaVersion = 2;

        // The component manifest, as `JsonUtility` reads it. Field names are
        // the JSON keys the generator writes (`componentManifestPlan.ts`);
        // arrays come back empty rather than null because the generator never
        // writes null.

        [Serializable]
        private sealed class ManifestParameter
        {
            public string name;
            public string fieldName;
            public string serializedType;
        }

        [Serializable]
        private sealed class ManifestListAxisMember
        {
            public string name;
            public int value;
        }

        [Serializable]
        private sealed class ManifestListAxis
        {
            public string memberName;
            public string mountMethodName;
        }

        [Serializable]
        private sealed class ManifestSerializedField
        {
            public string role;
            public string name;
        }

        [Serializable]
        private sealed class ManifestComponent
        {
            public string className;
            public string kind;
            public string valueType;
            public bool reportsFailure;
            public ManifestSerializedField[] serializedFields;
        }

        [Serializable]
        private sealed class ComponentManifest
        {
            public int schemaVersion;
            public string model;
            public string @namespace;
            public string componentNamespace;
            public string handler;
            public string listHandler;
            public string listItemHandler;
            public bool keyed;
            public ManifestParameter[] identityKeys;
            public ManifestParameter[] scopeParameters;
            public string itemPrefabField;
            public string contentParentField;
            public string listAxisEnumTypeName;
            public string listAxisField;
            public ManifestListAxisMember[] listAxisMembers;
            public ManifestListAxis[] listAxes;
            public ManifestComponent[] components;
        }

        /// <summary>
        /// The shapes of row this page knows how to draw. <see cref="None"/>
        /// is a component that is real but not a row — a condition, an image,
        /// a value whose payload no row takes.
        /// </summary>
        private enum RowKind
        {
            None,
            Label,
            Clock,
            Button,
            Gauge,
        }

        /// <summary>
        /// A component a row may name, whichever half wrote it: a generated one
        /// is read off the manifest, a demo-written one off its shape. Once
        /// here the two are drawn exactly alike.
        /// </summary>
        private sealed class RowComponent
        {
            public string Name;
            public Type Type;
            public RowKind Kind;
            /// <summary>What the class name carries after its reading — `Label`, `Button`, `Gauge`, `Value`.</summary>
            public string Suffix;
            /// <summary>Whether it exposes `ErrorEvent OnFailed`; asked of buttons only.</summary>
            public bool ReportsFailure;
            /// <summary>The field a gauge's fill or a button's `Button` goes into. Null for the rest.</summary>
            public string TargetField;
        }

        /// <summary>A generated condition and the arm this page writes rows into.</summary>
        private sealed class ToggleComponent
        {
            public string Name;
            public Type Type;
            /// <summary>True for an active toggle, which hides objects; false for an interactable, which greys selectables.</summary>
            public bool Hides;
            /// <summary>The arm that means "the condition is good news": `_activeWhenFalse` or `_interactableWhenTrue`.</summary>
            public string ArmField;
        }

        /// <summary>
        /// One row of a section, as the page declares it.
        ///
        /// A row names the component it draws and, where that component cannot
        /// stand alone, what completes it: a bar needs to say what its fill
        /// counts. That is a fact about the page rather than about the
        /// component, which is why it cannot be read off the manifest — from in
        /// here a template label and a plain value look exactly alike.
        ///
        /// A `DateTime` row completes itself: the showroom's own
        /// <see cref="ShowroomCountdown"/> turns it into time left, and any
        /// behaviour the demo wrote taking `SetDeadline(DateTime)` hears the
        /// same deadline beside it (<see cref="CountdownBehaviours"/>).
        /// </summary>
        private struct RowSpec
        {
            public string Component;
            /// <summary>Label drawn on a bar, or beside a button. Null otherwise.</summary>
            public string Caption;
        }

        /// <summary>
        /// One section of a page: the rows it carries, in the order it carries
        /// them, and which of its conditions govern which of them.
        ///
        /// Every section is built from one of these, whether the demo wrote it
        /// or {@link DeriveSection} worked it out from the manifest. That is
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
            /// <summary>
            /// The one row this section shows, as the keys that name it —
            /// `SetKeys`' parameters to the values the page pins them to.
            ///
            /// A keyed model is a set of rows and is drawn as a list, but a
            /// list is read by describing, and describing never brings a row
            /// into being. GS2 creates a user-data row on the read that names
            /// it, so a row that does not exist yet can only be shown by
            /// naming its keys: a wallet the player has never deposited into
            /// is absent from every enumeration and arrives with zeroes the
            /// moment its slot is read.
            ///
            /// Empty means the section is a list.
            /// </summary>
            public Dictionary<string, string> Key = new Dictionary<string, string>();
            /// <summary>
            /// What a list needs before it will load anything — the collection's
            /// own keys, to the values this page reads through.
            ///
            /// A collection can be a subset rather than everything of its kind:
            /// a shop's products are the products of one storefront, and which
            /// storefront is the page's to say. A list left without it reads
            /// nothing and draws an empty section, which is the same thing a
            /// page with nothing to show looks like.
            ///
            /// Distinct from <see cref="Key"/>: that names one row and takes
            /// the section off the list, this names which rows the list has.
            /// </summary>
            public Dictionary<string, string> Scope = new Dictionary<string, string>();
        }

        /// <summary>
        /// What one generated handler contributes to the page, worked out
        /// before there is a scene to put any of it in.
        ///
        /// Everything here is read from the manifest and the declaration, and
        /// nothing in it touches an asset, which is what lets the whole page be
        /// settled — and refused — before <see cref="OpenOrCreateScene"/> runs.
        /// </summary>
        private class SectionPlan
        {
            public ComponentManifest Manifest;
            public string Model;
            public Type Handler;
            /// <summary>Every component the manifest lists, drawable or not, so a declared name resolves to what it is.</summary>
            public IReadOnlyList<RowComponent> Components;
            public IReadOnlyList<RowComponent> Labels;
            public IReadOnlyList<RowComponent> Buttons;
            public IReadOnlyList<RowComponent> Gauges;
            public IReadOnlyList<RowComponent> Clocks;
            public IReadOnlyList<ToggleComponent> Toggles;
            /// <summary>
            /// What the demo declared for this model, or null when `page.json`
            /// has no section for it. Carried on the plan rather than looked up
            /// again, so every question about the declaration is asked of the
            /// same answer.
            /// </summary>
            public SectionSpec Declaration;
            /// <summary>
            /// The section this model is drawn as, or null when it has nothing
            /// to draw. A handler with no section is still mounted — another
            /// section's reading may be composed from it — it just gets no
            /// heading of its own.
            /// </summary>
            public SectionSpec Section;
            /// <summary>
            /// The behaviours the demo wrote that hear this section's
            /// `DateTime` rows beside the showroom's own countdown — see
            /// <see cref="CountdownBehaviours"/>. Empty when the demo wrote
            /// none, which is the common case.
            /// </summary>
            public IReadOnlyList<Type> Countdowns = new List<Type>();
            /// <summary>The list a keyed model's rows are spawned by. Null otherwise.</summary>
            public Type ListHandler;
            /// <summary>What one of those rows carries. Null otherwise.</summary>
            public Type ItemHandler;
            /// <summary>
            /// What to write into the list's axis field, or null when there is
            /// nothing to write: the collection offers a single axis and the
            /// generator emitted no field.
            /// </summary>
            public int? Axis;
        }

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
                    ReadArgument("-showroomDeclaration"));
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
        /// more than keeping it pretty.
        ///
        ///   section  MODEL  AXIS
        ///   row      MODEL  COMPONENT  CAPTION
        ///   toggle   MODEL  CONDITION  ROW|ROW
        ///   key      MODEL  NAME  VALUE
        ///   scope    MODEL  NAME  VALUE
        ///
        /// A `section` line is what declares the model: a model with no line
        /// at all is refused with the section the manifest suggests, which is
        /// not the same as a model that declared no rows and means it.
        /// </summary>
        private static Dictionary<string, SectionSpec> ReadDeclaration(string path)
        {
            if (string.IsNullOrEmpty(path) || !File.Exists(path))
            {
                // A page is what its demo says it is, and the saying is the
                // declaration: without one there is nothing to build from, and
                // a guess drawn in its place would be published as if someone
                // had chosen it.
                throw new InvalidOperationException(
                    "[showroom] no page declaration to build from" +
                    (string.IsNullOrEmpty(path) ? "" : $" at {path}") +
                    "; `page.mjs` writes one out of the demo's `page.json`");
            }
            var declared = new Dictionary<string, SectionSpec>();
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
                    });
                }
                else if (parts[0] == "toggle" && parts.Length > 3)
                {
                    section.Toggles[parts[2]] = parts[3].Split('|');
                }
                else if (parts[0] == "key" && parts.Length > 3)
                {
                    section.Key[parts[2]] = parts[3];
                }
                else if (parts[0] == "scope" && parts.Length > 3)
                {
                    section.Scope[parts[2]] = parts[3];
                }
            }
            return declared;
        }

        /// <summary>
        /// Writes the demo's page from the declaration `page.mjs` wrote out of
        /// its `page.json`. Returns the number of sections, or -1 when the
        /// scene already existed and was left alone.
        ///
        /// The same entry whether a batch run or an open Editor calls it: a
        /// page is built from what its demo declared, never derived, so an
        /// Editor iterating on `page.json` runs the same build the pipeline
        /// publishes, and refuses what the pipeline would refuse.
        /// </summary>
        public static int BuildPage(
            string title, string subtitle, bool rebuild, string declarationPath)
        {
            return BuildPage(title, subtitle, rebuild, ReadDeclaration(declarationPath));
        }

        /// <summary>
        /// The whole build, once the declaration has been read. Private
        /// because <see cref="SectionSpec"/> is: the declaration never crosses
        /// the type's own boundary.
        /// </summary>
        private static int BuildPage(
            string title, string subtitle, bool rebuild,
            Dictionary<string, SectionSpec> declaredSections)
        {
            var existed = File.Exists(ScenePath);
            if (existed && !rebuild)
            {
                Debug.Log($"[showroom] {ScenePath} already exists; left alone");
                return -1;
            }

            // Before the scene, and deliberately. OpenOrCreateScene copies the
            // template onto disk the moment it runs, so anything that throws
            // after it leaves a page behind that was never built — and the next
            // bake, which the pipeline runs without `-showroomRebuildPage`,
            // finds a scene at that path, leaves it alone and reports success.
            // A demo's first failed bake would set as an empty page that never
            // fails again. So the page is settled here, where refusing it costs
            // nothing but the run.
            var plans = PlanSections(declaredSections);

            int sections;
            IReadOnlyCollection<string> itemPrefabs;
            try
            {
                var scene = OpenOrCreateScene(existed);
                var page = UnityEngine.Object.FindAnyObjectByType<ShowroomPage>();
                if (page == null)
                    throw new InvalidOperationException("no ShowroomPage in the scene");

                ApplyHeader(page, title, subtitle);
                var content = ContentMount(page);
                ClearChildren(content);
                (sections, itemPrefabs) = BuildSections(content, page, plans);

                EditorSceneManager.MarkSceneDirty(scene);
                EditorSceneManager.SaveScene(scene, ScenePath);
            }
            catch
            {
                // Insurance, not the guard. What keeps a failed bake from
                // leaving an empty page behind is that PlanSections runs first;
                // this covers only what can still throw once OpenOrCreateScene
                // has run — a refresh or an open that fails on the copy, a
                // prefab the template no longer carries, a save that fails —
                // and it covers nothing at all if the process is killed here,
                // which is exactly why it cannot be the answer on its own.
                //
                // Asked of the disk rather than of how far the run got: the
                // copy either happened or it did not, and only the file knows.
                // OpenOrCreateScene also throws when CopyAsset itself refused,
                // and nothing is left behind to remove in that case.
                if (!existed && File.Exists(ScenePath)) DiscardCopiedScene();
                throw;
            }
            // After the scene is saved, because the two have to agree: what the
            // page carries is what stays on disk beside it.
            RemoveOrphanedListItemPrefabs(itemPrefabs);
            Debug.Log($"[showroom] wrote {ScenePath} with {sections} section(s)");
            return sections;
        }

        /// <summary>
        /// Removes the scene this run copied from the template, so a bake that
        /// failed after the copy leaves nothing for the next one to find and
        /// leave alone. A failure to remove it is logged and swallowed: the
        /// exception on its way out is the one worth reading.
        /// </summary>
        private static void DiscardCopiedScene()
        {
            try
            {
                // Out of the scene first: what is being deleted is the asset the
                // Editor currently has open.
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                if (AssetDatabase.DeleteAsset(ScenePath)) return;
                Debug.LogError(
                    $"[showroom] {ScenePath} was copied for a bake that failed and could not " +
                    "be removed; delete it before baking again, or the next bake will leave " +
                    "it alone and report success");
            }
            catch (Exception exception)
            {
                Debug.LogError(
                    $"[showroom] {ScenePath} was copied for a bake that failed and could not " +
                    $"be removed: {exception}");
            }
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
        /// The manifests the generator wrote, one per model, in the order the
        /// page draws them: by handler class name, ordinal. That is the order
        /// every page so far was baked in, and a page's section order is part
        /// of what it published.
        ///
        /// No manifests at all is the one drift this builder can still meet:
        /// generated code that predates the manifest, or a project that was
        /// never generated into. Either way there is nothing to build from,
        /// and the refusal names where the files were expected.
        /// </summary>
        private static IReadOnlyList<ComponentManifest> ReadManifests()
        {
            var paths = Directory.Exists(ManifestDirectory)
                ? Directory.GetFiles(ManifestDirectory, "*" + ManifestSuffix)
                    .Select(path => path.Replace('\\', '/'))
                    .OrderBy(path => path, StringComparer.Ordinal)
                    .ToList()
                : new List<string>();
            if (paths.Count == 0)
            {
                throw new InvalidOperationException(
                    $"[showroom] no component manifests under {ManifestDirectory} " +
                    $"(`{{Model}}{ManifestSuffix}`). The generator writes one per model beside " +
                    "its handlers; regenerate the demo's Unity artifacts " +
                    "(`npm run showroom:generate <packageId>`) before baking.");
            }
            var manifests = new List<ComponentManifest>();
            foreach (var path in paths)
            {
                var manifest = JsonUtility.FromJson<ComponentManifest>(File.ReadAllText(path));
                if (manifest == null || manifest.schemaVersion != ManifestSchemaVersion ||
                    string.IsNullOrEmpty(manifest.model) || string.IsNullOrEmpty(manifest.handler))
                {
                    throw new InvalidOperationException(
                        $"[showroom] {path} is not a component manifest this builder reads " +
                        $"(schemaVersion {ManifestSchemaVersion}); the generator and this " +
                        "builder disagree, so update whichever is older.");
                }
                manifests.Add(WithoutNulls(manifest));
            }
            return manifests.OrderBy(manifest => manifest.handler, StringComparer.Ordinal).ToList();
        }

        /// <summary>
        /// The generator writes an empty string or array where another format
        /// would write null, and `JsonUtility` reads them back as such; this
        /// only insures the reading against a key it did not find.
        /// </summary>
        private static ComponentManifest WithoutNulls(ComponentManifest manifest)
        {
            manifest.@namespace = manifest.@namespace ?? "";
            manifest.componentNamespace = manifest.componentNamespace ?? "";
            manifest.listHandler = manifest.listHandler ?? "";
            manifest.listItemHandler = manifest.listItemHandler ?? "";
            manifest.itemPrefabField = manifest.itemPrefabField ?? "";
            manifest.contentParentField = manifest.contentParentField ?? "";
            manifest.listAxisEnumTypeName = manifest.listAxisEnumTypeName ?? "";
            manifest.listAxisField = manifest.listAxisField ?? "";
            manifest.identityKeys = manifest.identityKeys ?? new ManifestParameter[0];
            manifest.scopeParameters = manifest.scopeParameters ?? new ManifestParameter[0];
            manifest.listAxisMembers = manifest.listAxisMembers ?? new ManifestListAxisMember[0];
            manifest.listAxes = manifest.listAxes ?? new ManifestListAxis[0];
            manifest.components = manifest.components ?? new ManifestComponent[0];
            foreach (var component in manifest.components)
            {
                component.kind = component.kind ?? "";
                component.valueType = component.valueType ?? "";
                component.serializedFields = component.serializedFields ?? new ManifestSerializedField[0];
            }
            return manifest;
        }

        /// <summary>
        /// The type a manifest names, from whatever assembly compiled it.
        ///
        /// A name the project has not compiled is the manifest and the code
        /// disagreeing — the code was regenerated without the manifest, or the
        /// other way round — and the only honest answer is to say which file
        /// and stop, because every fact about that model would be a guess.
        /// </summary>
        private static Type ResolveType(ComponentManifest manifest, string fullName)
        {
            var type = AppDomain.CurrentDomain.GetAssemblies()
                .Select(assembly => assembly.GetType(fullName, false))
                .FirstOrDefault(found => found != null);
            if (type != null) return type;
            throw new InvalidOperationException(
                $"[showroom] {manifest.model}: {ManifestDirectory}/{manifest.model}{ManifestSuffix} " +
                $"names {fullName}, which this project has not compiled. The manifest and the " +
                "generated code have drifted; regenerate the demo's Unity artifacts.");
        }

        private static IEnumerable<Type> SafeTypes(Assembly assembly)
        {
            try { return assembly.GetTypes(); }
            catch (ReflectionTypeLoadException error) { return error.Types.Where(t => t != null); }
        }

        /// <summary>
        /// What a generated component is to this page, by the kind the
        /// generator gave it. A `value` is a label when it publishes a string
        /// and a clock when it publishes a `DateTime`; any other payload has no
        /// row here and is left undrawn rather than cast into a page-wide
        /// failure. Conditions and images are components a row cannot name.
        /// </summary>
        private static RowKind RowKindOf(ManifestComponent component)
        {
            switch (component.kind)
            {
                case "label":
                case "templateLabel":
                    return RowKind.Label;
                case "value":
                    if (component.valueType == "string") return RowKind.Label;
                    if (component.valueType == "DateTime") return RowKind.Clock;
                    return RowKind.None;
                case "buttonAction":
                    return RowKind.Button;
                case "gauge":
                    return RowKind.Gauge;
                default:
                    return RowKind.None;
            }
        }

        /// <summary>
        /// What a generated class name carries after its reading, by kind.
        /// `WalletFreeBalanceLabel` is a label, `CharacterIdValue` a value:
        /// the kind says which word is the component's and not the reading's.
        /// </summary>
        private static string SuffixOf(ManifestComponent component)
        {
            switch (component.kind)
            {
                case "label":
                case "templateLabel":
                    return "Label";
                case "value":
                    return "Value";
                case "buttonAction":
                    return "Button";
                case "gauge":
                    return "Gauge";
                case "image":
                    return "Image";
                case "activeToggle":
                    return "Toggle";
                case "interactable":
                    return "Interactable";
                default:
                    return "";
            }
        }

        private static string SerializedFieldNamed(
            ComponentManifest manifest, ManifestComponent component, string role)
        {
            var field = (component.serializedFields ?? new ManifestSerializedField[0])
                .FirstOrDefault(candidate => candidate.role == role);
            if (field != null) return field.name;
            throw new InvalidOperationException(
                $"[showroom] {manifest.model}: the manifest lists {component.className} as a " +
                $"{component.kind} with no '{role}' field; the generator and this builder " +
                "disagree, so update whichever is older.");
        }

        private static RowComponent GeneratedRowComponent(
            ComponentManifest manifest, ManifestComponent component)
        {
            var kind = RowKindOf(component);
            return new RowComponent
            {
                Name = component.className,
                Type = ResolveType(manifest, manifest.componentNamespace + "." + component.className),
                Kind = kind,
                Suffix = SuffixOf(component),
                ReportsFailure = component.reportsFailure,
                TargetField =
                    kind == RowKind.Gauge ? SerializedFieldNamed(manifest, component, "target") :
                    kind == RowKind.Button ? SerializedFieldNamed(manifest, component, "button") :
                    null,
            };
        }

        /// <summary>
        /// The conditions a manifest lists. An active toggle hides objects
        /// while its condition does not hold, an interactable greys selectables
        /// out; each is written into the arm that means the condition is good
        /// news, and the manifest says what that arm is called.
        /// </summary>
        private static IReadOnlyList<ToggleComponent> TogglesOf(ComponentManifest manifest)
        {
            return manifest.components
                .Where(component => component.kind == "activeToggle" || component.kind == "interactable")
                .Select(component =>
                {
                    var hides = component.kind == "activeToggle";
                    return new ToggleComponent
                    {
                        Name = component.className,
                        Type = ResolveType(manifest, manifest.componentNamespace + "." + component.className),
                        Hides = hides,
                        ArmField = SerializedFieldNamed(
                            manifest, component, hides ? "activeWhenFalse" : "interactableWhenTrue"),
                    };
                })
                .OrderBy(toggle => toggle.Name, StringComparer.Ordinal)
                .ToList();
        }

        /// <summary>
        /// The whole page, worked out from the manifests and the declaration
        /// and settled before a scene exists.
        ///
        /// This is where a bake refuses a demo. Nothing in here writes an
        /// asset, so a page that cannot be built costs only the run — see
        /// <see cref="BuildPage"/> for what a refusal after the scene is
        /// created would cost instead.
        /// </summary>
        private static IReadOnlyList<SectionPlan> PlanSections(
            IReadOnlyDictionary<string, SectionSpec> declaredSections)
        {
            var plans = new List<SectionPlan>();
            foreach (var manifest in ReadManifests())
            {
                var model = manifest.model;
                var components = manifest.components
                    .Select(component => GeneratedRowComponent(manifest, component))
                    .OrderBy(component => component.Name, StringComparer.Ordinal)
                    .ToList();
                var plan = new SectionPlan
                {
                    Manifest = manifest,
                    Model = model,
                    Handler = ResolveType(manifest, manifest.@namespace + "." + manifest.handler),
                    Components = components,
                    Labels = components.Where(component => component.Kind == RowKind.Label).ToList(),
                    Buttons = components.Where(component => component.Kind == RowKind.Button).ToList(),
                    Gauges = components.Where(component => component.Kind == RowKind.Gauge).ToList(),
                    Clocks = components.Where(component => component.Kind == RowKind.Clock).ToList(),
                    Toggles = TogglesOf(manifest),
                    Declaration = declaredSections.TryGetValue(model, out var declared) ? declared : null,
                };
                // A handler whose `SetKeys` takes arguments cannot stand on its
                // own: it would sit in the page with an empty id, bind nothing
                // and render a row of blanks. A keyed model is a set of rows,
                // so its list handler shows them and each row carries its own
                // copy of the components.
                //
                // Asked here rather than where the list is built, because the
                // declaration a model needs written depends on it: only a list
                // with an axis field has an axis to name.
                if (manifest.keyed && !DeclaresKey(plan) &&
                    manifest.listHandler.Length > 0 && manifest.listItemHandler.Length > 0)
                {
                    plan.ListHandler = ResolveType(manifest, manifest.@namespace + "." + manifest.listHandler);
                    plan.ItemHandler = ResolveType(manifest, manifest.@namespace + "." + manifest.listItemHandler);
                }
                plans.Add(plan);
            }

            // What the demo wrote to hear a deadline, by convention rather than
            // by declaration: a behaviour that acts on one is a fact about the
            // demo, not about a row, so it is found here once for the whole
            // page and wired into every clock row beside the showroom's own
            // countdown.
            var countdowns = CountdownBehaviours();

            // Asked of the manifests alone, and before a single line of the
            // declaration has been acted on: what a demo wrote down is checked
            // against what it generated while nothing has yet been built out
            // of either, so a page that cannot be built is refused rather than
            // half-drawn.
            RefuseWhatThePageCannotBuild(plans, declaredSections);

            foreach (var plan in plans)
            {
                // Two ways a model ends up with nothing to draw: a package gave
                // it no component of its own, or the demo declared a section
                // for it and left the rows empty. The second is asked here,
                // before the section prefab exists, rather than where the rest
                // of the declaration is read — the principle is the one the
                // first case already states, that an empty heading over an
                // empty body says nothing a visitor wants, and it holds the
                // same whether the emptiness was found in the manifest or
                // written down by the demo.
                if (!HasDrawables(plan) || DeclaresNoRows(plan)) continue;
                plan.Section = SectionFor(plan);
                if (DrawsClock(plan, plan.Section)) plan.Countdowns = countdowns;

                // No list, so no axis to write: the model is not keyed, or it is
                // and the package generated it no list handler. The second is a
                // warning rather than a refusal, and it is raised where the
                // empty section it leaves behind is built, so the two read as
                // one thing.
                if (plan.ListHandler == null || plan.ItemHandler == null) continue;
                plan.Axis = PlannedAxis(plan);
            }
            return plans;
        }

        /// <summary>
        /// Whether this model has anything of its own to draw. A package that
        /// generated no component for it gives the page no section: an empty
        /// heading over an empty body says nothing a visitor wants, and there
        /// is nothing for a declaration to name either.
        /// </summary>
        private static bool HasDrawables(SectionPlan plan)
        {
            return plan.Labels.Count > 0 || plan.Buttons.Count > 0 ||
                plan.Gauges.Count > 0 || plan.Clocks.Count > 0;
        }

        /// <summary>
        /// Everything that stops this page being built, collected and thrown
        /// once.
        ///
        /// Once, because a bake is a round trip through the Editor: answering
        /// one problem at a time costs an author a launch apiece, and a demo
        /// starting from nothing has one problem per model. And thrown from
        /// here, before <see cref="OpenOrCreateScene"/>, so a refusal costs
        /// only the run.
        /// </summary>
        private static void RefuseWhatThePageCannotBuild(
            IReadOnlyList<SectionPlan> plans,
            IReadOnlyDictionary<string, SectionSpec> declaredSections)
        {
            var problems = new List<string>();
            CollectUnresolvedDeclarations(plans, declaredSections, problems);
            CollectUndeclaredSections(plans, problems);
            if (problems.Count == 0) return;
            throw new InvalidOperationException(string.Join("\n", problems));
        }

        /// <summary>
        /// Refuses a model the demo generated a page's worth of components for
        /// and never said what to do with, and writes the declaration it would
        /// take.
        ///
        /// <see cref="DeriveSection"/> can always produce something, and for a
        /// long time it did: a model with no declaration was drawn from the
        /// guess and the guess was logged. What that cost is that a page could
        /// be published without anyone having said what was on it — a section
        /// appears because a package generated a component, in an order nobody
        /// chose, and the run reports success. The rows a page wants are a
        /// fact about the page: a dex and a roster show the same `Character`
        /// and want different ones, and neither is the guess.
        ///
        /// So the guess stays and stops being an answer. It is what a demo
        /// starts from — one line, in `page.json`'s own shape, ready to paste
        /// under "sections" and cut down — and the bake that offers it refuses
        /// to draw it.
        /// </summary>
        private static void CollectUndeclaredSections(
            IReadOnlyList<SectionPlan> plans, List<string> problems)
        {
            foreach (var plan in plans)
            {
                if (!HasDrawables(plan) || plan.Declaration != null) continue;
                problems.Add(
                    $"[showroom] {plan.Model}: `page.json` declares no section for it, and a " +
                    "page is what its demo says it is rather than what its package happens to " +
                    "generate. Here is the guess, to paste under \"sections\" and cut down: " +
                    DerivedDeclarationJson(plan) + ConditionsOnOffer(plan));
            }
        }

        /// <summary>
        /// The conditions this model generated, named rather than declared.
        ///
        /// They are left out of the guess on purpose: a condition is declared
        /// with the rows it governs, and which rows those are is the page's to
        /// say — <see cref="DeriveSection"/> can only produce the name and an
        /// empty list, which <see cref="CollectToggleProblems"/> then refuses.
        /// A guess that has to be edited before it can be pasted is not a
        /// starting point.
        ///
        /// But dropping them silently would hide that the demo has any, and an
        /// author reading the guess would never learn there was something to
        /// wire. So they are said in prose, on the same line, and the page
        /// takes them when it wants them.
        /// </summary>
        private static string ConditionsOnOffer(SectionPlan plan)
        {
            if (plan.Toggles.Count == 0) return "";
            return
                $" It also generated the conditions {Listed(plan.Toggles.Select(toggle => toggle.Name))}" +
                ", which the guess leaves out because which rows a condition governs is the " +
                "page's to say; add one to \"toggles\" with the rows it governs to wire it.";
        }

        /// <summary>
        /// One derived section, written the way `page.json` writes one, on the
        /// one line <see cref="CollectUndeclaredSections"/> offers it on.
        ///
        /// One line because `page.mjs` filters the Editor's log line by line,
        /// so a second line of a section is a line an author never sees.
        ///
        /// Pasted unedited, this builds. The one thing it cannot answer is left
        /// as a hole: which of several mount axes a list reads through, which
        /// nothing but the page can pick — a guess there is the bug the axis
        /// field exists to stop — so it comes back as the choice rather than
        /// one of its arms, and fails the next bake in
        /// <see cref="ListAxisValue"/> until someone makes it.
        ///
        /// Conditions are not a hole. Leaving one off the page is an omission
        /// a page is free to make, so the guess omits them all and
        /// <see cref="ConditionsOnOffer"/> says what there was.
        /// </summary>
        private static string DerivedDeclarationJson(SectionPlan plan)
        {
            var derived = DeriveSection(
                plan.Labels, plan.Buttons, plan.Gauges, plan.Clocks, plan.Toggles);
            var parts = new List<string>();
            var axis = DerivedAxisJson(plan);
            if (axis != null) parts.Add(axis);
            parts.Add($"\"rows\": [{string.Join(", ", derived.Rows.Select(RowAsJson))}]");
            return $"\"{plan.Model}\": {{{string.Join(", ", parts)}}}";
        }

        /// <summary>
        /// The axis hole a derived section carries, or null when the model has
        /// no axis to name: it is not a list, or its collection offers a single
        /// axis and the generator emitted no field to point at one.
        ///
        /// A hole rather than a value. The generator's own pick is whichever
        /// loader it elected as primary, which is not an answer to what a page
        /// wants to show, so what is offered is the choice rather than one of
        /// its arms — and pasting it unfilled fails the next bake in
        /// <see cref="ListAxisValue"/> rather than mounting the wrong one.
        /// </summary>
        private static string DerivedAxisJson(SectionPlan plan)
        {
            if (plan.ListHandler == null || plan.Manifest.listAxisEnumTypeName.Length == 0) return null;
            var names = plan.Manifest.listAxisMembers.Select(member => member.name);
            return $"\"axis\": \"<one of: {string.Join(", ", names)}>\"";
        }

        /// <summary>
        /// Refuses a declaration that names something the demo did not
        /// generate, and says what it did.
        ///
        /// Every name in `page.json` is a generated identifier, so a name that
        /// resolves to nothing is a typo rather than an intention — and a typo
        /// must not be allowed to read as a page. Left to the build, each of
        /// them fails quietly in its own way: a misspelled row is a warning and
        /// a missing line, a misspelled condition is nothing at all, because
        /// <see cref="WireToggles"/> walks the components the package generated
        /// and asks the declaration about each, so a key only the declaration
        /// holds is never looked at.
        ///
        /// The reverse is not a failure. Leaving a generated component off is
        /// what declaring a page is for — a dex and a roster show the same
        /// model and want different rows — so a component with no line, whether
        /// a row or a condition, is an omission and stays one. Leaving a whole
        /// model out is not an omission, and
        /// <see cref="CollectUndeclaredSections"/> is where that is answered.
        ///
        /// Each problem takes one line, so that `page.mjs`, which filters the
        /// Editor log line by line, carries all of them through;
        /// <see cref="RefuseWhatThePageCannotBuild"/> throws them together.
        /// </summary>
        private static void CollectUnresolvedDeclarations(
            IReadOnlyList<SectionPlan> plans,
            IReadOnlyDictionary<string, SectionSpec> declaredSections, List<string> problems)
        {
            var byModel = new Dictionary<string, SectionPlan>(StringComparer.Ordinal);
            foreach (var plan in plans) byModel[plan.Model] = plan;

            foreach (var entry in declaredSections.OrderBy(item => item.Key, StringComparer.Ordinal))
            {
                if (!byModel.TryGetValue(entry.Key, out var plan))
                {
                    problems.Add(
                        $"[showroom] `page.json` declares a section for '{entry.Key}', which " +
                        "this demo generated no handler for. It generated " +
                        $"{Listed(byModel.Keys)}.");
                    continue;
                }
                CollectRowProblems(plan, entry.Value, problems);
                CollectToggleProblems(plan, entry.Value, problems);
                CollectKeyProblems(plan, entry.Value, problems);
            }
        }

        /// <summary>
        /// Whether any of this section's rows draws a `DateTime`, and so is
        /// where the demo's deadline behaviours are wired in.
        /// </summary>
        private static bool DrawsClock(SectionPlan plan, SectionSpec section)
        {
            var clocks = plan.Clocks.Select(clock => clock.Name).ToList();
            return section.Rows.Any(row => clocks.Contains(row.Component, StringComparer.Ordinal));
        }

        /// <summary>
        /// What a section's declared key names that the model cannot answer.
        ///
        /// A key holds the section to one row instead of listing it, so it has
        /// to name that row exactly: every key the model is identified by, and
        /// no name it does not have. A partial key would leave the rest at
        /// whatever a freshly added component starts holding, which is the
        /// silent mis-binding the list exists to avoid.
        /// </summary>
        private static void CollectKeyProblems(
            SectionPlan plan, SectionSpec declared, List<string> problems)
        {
            CollectScopeProblems(plan, declared, problems);
            if (declared.Key.Count == 0) return;
            var identity = IdentityKeyNames(plan);
            if (identity.Count == 0)
            {
                problems.Add(
                    $"[showroom] {plan.Model}: `page.json` names a key for it, and it is not " +
                    "identified by one — it is a single row already, so there is nothing to pin.");
                return;
            }
            foreach (var name in declared.Key.Keys.OrderBy(name => name, StringComparer.Ordinal))
            {
                if (!identity.Contains(name))
                {
                    problems.Add(
                        $"[showroom] {plan.Model}: `page.json` pins '{name}', which is not one of " +
                        $"the keys this model is identified by. It is identified by " +
                        $"{Listed(identity)}.");
                }
            }
            foreach (var name in identity)
            {
                if (!declared.Key.ContainsKey(name))
                {
                    problems.Add(
                        $"[showroom] {plan.Model}: `page.json` pins it to one row without naming " +
                        $"'{name}', and a row is named by {Listed(identity)}. Name every one of " +
                        "them, or drop the key and let the page list the model.");
                }
            }
        }

        /// <summary>
        /// What a section's declared scope names that its list cannot answer,
        /// and what its list needs that the section did not name.
        ///
        /// A list that reads nothing draws an empty section, and an empty
        /// section is what a page with nothing to show looks like — so the one
        /// that could have shown something is refused here instead.
        /// </summary>
        private static void CollectScopeProblems(
            SectionPlan plan, SectionSpec declared, List<string> problems)
        {
            if (plan.ListHandler == null)
            {
                if (declared.Scope.Count > 0)
                {
                    problems.Add(
                        $"[showroom] {plan.Model}: `page.json` scopes it, and this page draws no " +
                        "list for it — a scope says which rows a list has.");
                }
                return;
            }
            var scope = CollectionScopeNames(plan);
            foreach (var name in declared.Scope.Keys.OrderBy(name => name, StringComparer.Ordinal))
            {
                if (!scope.Contains(name))
                {
                    problems.Add(
                        $"[showroom] {plan.Model}: `page.json` scopes its list by '{name}', which " +
                        $"is not one of the keys its collection is made with. It is made with " +
                        $"{Listed(scope)}.");
                }
            }
            foreach (var name in scope)
            {
                if (declared.Scope.ContainsKey(name)) continue;
                // A warning rather than a refusal: whether a collection key is
                // needed depends on the axis the list reads through. A master
                // axis that enumerates a whole namespace needs none of them,
                // and the dex's list is exactly that — so a page that names
                // nothing is often right, and only the handler's own readiness
                // check knows when it is not.
                Debug.LogWarning(
                    $"[showroom] {plan.Model}: its list is made with '{name}' and the page does " +
                    "not say which. If its axis reads through that key, the list will read " +
                    "nothing and the section will draw empty.");
            }
        }

        /// <summary>
        /// The keys a model is identified by, as `SetKeys` names them.
        /// </summary>
        private static IReadOnlyList<string> IdentityKeyNames(SectionPlan plan)
        {
            return plan.Manifest.identityKeys.Select(parameter => parameter.name).ToList();
        }

        /// <summary>
        /// What a section's declared rows name that the demo cannot answer: a
        /// component it never generated, one that is no kind of row this page
        /// draws, or a reading that is not there.
        /// </summary>
        private static void CollectRowProblems(
            SectionPlan plan, SectionSpec declared, List<string> problems)
        {
            foreach (var row in declared.Rows)
            {
                var component = UiComponentNamed(plan, row.Component);
                if (component == null)
                {
                    problems.Add(
                        $"[showroom] {plan.Model}: `page.json` asks for a row of " +
                        $"'{row.Component}', which this demo neither generated nor wrote. It " +
                        $"generated {Listed(DrawableNames(plan))}" +
                        $"{WrittenSuffix()}.");
                }
                else if (component.Kind == RowKind.Button && !component.ReportsFailure)
                {
                    problems.Add(
                        $"[showroom] {plan.Model}: '{row.Component}' acts but cannot say when it " +
                        "failed. A browser hides the console, so a failure a visitor cannot see " +
                        "reads as nothing having happened — carry an `ErrorEvent OnFailed` the " +
                        "way a generated button does.");
                }
                else if (component.Kind == RowKind.None)
                {
                    problems.Add(
                        $"[showroom] {plan.Model}: '{row.Component}' is not a kind of row this " +
                        $"page knows how to draw. It draws {Listed(DrawableNames(plan))}.");
                }
                if (row.Caption != null && UiComponentNamed(plan, row.Caption) == null)
                {
                    problems.Add(
                        $"[showroom] {plan.Model}: '{row.Component}' names '{row.Caption}' as " +
                        "its reading, which this demo neither generated nor wrote. It " +
                        $"generated {Listed(plan.Labels.Select(label => label.Name))}" +
                        $"{WrittenSuffix()}.");
                }
            }
        }

        /// <summary>
        /// What a section's declared conditions name that the demo cannot
        /// answer: a condition component it never generated, or a row that is
        /// not one of this section's.
        ///
        /// This is the direction <see cref="WireToggles"/> cannot look. It
        /// starts from the generated conditions, so a key that matches none of
        /// them is read by nobody, and a condition whose rows are all
        /// misspelled is the same warning as one whose rows are simply not
        /// drawn — which is why the empty list is refused here too rather than
        /// being left to mean "leave this off", a thing dropping the key
        /// already says.
        /// </summary>
        private static void CollectToggleProblems(
            SectionPlan plan, SectionSpec declared, List<string> problems)
        {
            var conditions = plan.Toggles.Select(toggle => toggle.Name).ToList();
            var rows = declared.Rows.Select(row => row.Component).ToList();
            foreach (var entry in declared.Toggles.OrderBy(item => item.Key, StringComparer.Ordinal))
            {
                if (!conditions.Contains(entry.Key, StringComparer.Ordinal))
                {
                    problems.Add(
                        $"[showroom] {plan.Model}: `page.json` gives rows to the condition " +
                        $"'{entry.Key}', which this demo generated no component named. It " +
                        $"generated {Listed(conditions)}.");
                }
                var governed = entry.Value
                    .Select(name => name.Trim())
                    .Where(name => name.Length > 0)
                    .ToList();
                if (governed.Count == 0)
                {
                    problems.Add(
                        $"[showroom] {plan.Model}: '{entry.Key}' is declared governing no rows. " +
                        "A condition is declared with the rows it governs; to leave it off the " +
                        "page, drop the key.");
                    continue;
                }
                foreach (var name in governed)
                {
                    if (rows.Contains(name, StringComparer.Ordinal)) continue;
                    problems.Add(
                        $"[showroom] {plan.Model}: '{entry.Key}' governs '{name}', which is not " +
                        $"a row of this section. Its rows are {Listed(rows)}.");
                }
            }
        }

        /// <summary>Every component this model has a row to draw it in.</summary>
        private static IEnumerable<string> DrawableNames(SectionPlan plan)
        {
            return plan.Labels
                .Concat(plan.Buttons)
                .Concat(plan.Gauges)
                .Concat(plan.Clocks)
                .Select(component => component.Name);
        }

        /// <summary>
        /// The behaviours the demo wrote to hear a deadline: MonoBehaviours
        /// outside the generated namespace taking `SetDeadline(DateTime)`.
        ///
        /// Drawing a deadline as time left is the showroom's job, done by
        /// <see cref="ShowroomCountdown"/> on every clock row. What a demo may
        /// add is a reaction to the deadline — the energy demo credits a
        /// recovery when one arrives — and that is a fact about the demo, not
        /// about a row, so it is found here once and wired into every clock
        /// row beside the showroom's own countdown. None is the common case,
        /// and nothing has to be declared.
        ///
        /// Generated components are not among them. What a package generates
        /// hands the page the native `DateTime` precisely so the page can
        /// decide how it reads, so what reacts has to come from outside the
        /// generated namespace.
        ///
        /// Ordered, so the scene is written the same on every run.
        /// </summary>
        private static IReadOnlyList<Type> CountdownBehaviours()
        {
            return AppDomain.CurrentDomain.GetAssemblies()
                .SelectMany(SafeTypes)
                .Where(IsCountdownBehaviour)
                .OrderBy(type => type.Name, StringComparer.Ordinal)
                .ToList();
        }

        private static bool IsCountdownBehaviour(Type type)
        {
            return type.IsClass && !type.IsAbstract &&
                typeof(MonoBehaviour).IsAssignableFrom(type) &&
                // The showroom's own reader answers this shape as well. It is
                // the reading the row already has rather than a reaction a demo
                // wrote, so taking it here put a second copy of it on every
                // countdown row, the second one with no label to draw into.
                type != typeof(ShowroomCountdown) &&
                !(type.Namespace ?? "").StartsWith(GeneratedNamespacePrefix) &&
                type.GetMethod("SetDeadline", new[] { typeof(DateTime) }) != null;
        }

        /// <summary>
        /// What the demo wrote itself, for a refusal that has to account for
        /// both halves of what a row may name.
        /// </summary>
        private static string WrittenSuffix()
        {
            var written = DemoWrittenRowBehaviours().Select(component => component.Name).ToList();
            return written.Count == 0 ? "" : $", and wrote {Listed(written)}";
        }

        /// <summary>
        /// What was on offer, for a message that has to say so in one line and
        /// in the same order every run.
        /// </summary>
        private static string Listed(IEnumerable<string> names)
        {
            var ordered = names.Distinct(StringComparer.Ordinal)
                .OrderBy(name => name, StringComparer.Ordinal)
                .ToList();
            return ordered.Count == 0 ? "none" : string.Join(", ", ordered);
        }

        /// <summary>
        /// What this model's list reads through, as the value its axis field
        /// holds, or null when the generator emitted no such field because the
        /// collection offers a single axis.
        /// </summary>
        private static int? PlannedAxis(SectionPlan plan)
        {
            var manifest = plan.Manifest;
            var section = plan.Section;
            if (manifest.listAxisEnumTypeName.Length > 0) return ListAxisValue(plan);
            if (string.IsNullOrEmpty(section.Axis)) return null;
            // A declaration with no field to put it in. The manifest says this
            // list reads through a single axis and offers nothing to choose,
            // and the one thing that may not happen is carrying on: a
            // declaration nobody consumes, dropped without a word, is the
            // failure this whole channel exists to stop being possible.
            var only = manifest.listAxes.Length == 1 ? manifest.listAxes[0].memberName : null;
            throw new InvalidOperationException(
                $"[showroom] {plan.Model}: `page.json` names the mount axis '{section.Axis}', " +
                $"but its list reads through a single axis" +
                (only == null ? "" : $" ({only})") +
                " and has nothing to choose between; drop \"axis\" from its section.");
        }

        /// <summary>
        /// Builds the page's sections, and reports the list-item prefabs it
        /// wrote along the way so <see cref="RemoveOrphanedListItemPrefabs"/>
        /// can tell this bake's output from what an earlier one left behind.
        /// The paths are collected rather than worked out a second time from
        /// the plans: a plan can carry a keyed model whose list handler is
        /// missing, which builds no prefab, and a second answer would be free
        /// to disagree about that.
        /// </summary>
        private static (int Sections, IReadOnlyCollection<string> ItemPrefabs) BuildSections(
            Transform content, ShowroomPage page, IReadOnlyList<SectionPlan> plans)
        {
            var sectionPrefab = AssetDatabase.LoadAssetAtPath<GameObject>(SectionPrefabPath);
            ClearGeneratedComponents(content);
            // Nothing here reloads a handler after an action. A binder keeps
            // itself current — it subscribes to what it is bound to and the
            // value arrives on its own. Calling `Reload` throws that cache away
            // to fetch an answer the page was already going to get, and
            // overlapping reloads leave duplicate rows behind.
            var sectionCount = 0;
            var itemPrefabs = new List<string>();

            foreach (var plan in plans)
            {
                if (plan.Section == null)
                {
                    // Nothing to draw, but something to read: a configuration
                    // model a package never gave a component of its own — or
                    // one this page has no use for while another does — is
                    // still what another section's reading is composed from.
                    // So it is mounted without a section of its own.
                    if (!plan.Manifest.keyed || DeclaresKey(plan))
                        PlaceHandler(content.gameObject, plan);
                    continue;
                }

                var section = (GameObject)PrefabUtility.InstantiatePrefab(sectionPrefab, content);
                section.name = plan.Model;
                SetText(section.transform.Find("Heading"), Humanize(plan.Model));
                var explainer = section.transform.Find("Explainer");
                // Nothing here knows what to say about the model; a demo author
                // writes it, and an empty line of placeholder prose is worse
                // than none.
                if (explainer != null) explainer.gameObject.SetActive(false);
                sectionCount++;

                if (plan.Manifest.keyed && !DeclaresKey(plan))
                {
                    var itemPrefab = AddList(section, plan, page);
                    if (itemPrefab != null) itemPrefabs.Add(itemPrefab);
                    continue;
                }

                // A handler the page does not draw as a list serves the whole
                // page rather than one section: a component resolves its
                // handler by walking up the parent chain, so mounting it on the
                // page root puts it above every section at once. Its own rows still reach it — they
                // climb `label -> Items -> Section -> content` — and a gauge in
                // another section's list row can now read it too, which is what
                // a reading composed from two models needs.
                PlaceHandler(content.gameObject, plan);
                var body = ItemsOf(section.transform);
                RealizeRows(plan, body, plan.Section, page, plan.Countdowns);
                WireToggles(plan.Model, section, plan.Toggles, body, plan.Section);
            }

            return (sectionCount, itemPrefabs);
        }

        /// <summary>
        /// Shows a keyed model as the list it is: the generated list handler
        /// spawns one item per row, and the item prefab carries the components
        /// that bind to it. A button inside an item resolves its handler
        /// through the parent chain, which is the item handler, so an action
        /// acts on the row it sits in.
        ///
        /// Returns the item prefab it wrote, or null when there was no list to
        /// build one for.
        /// </summary>
        private static string AddList(GameObject section, SectionPlan plan, ShowroomPage page)
        {
            if (plan.ListHandler == null || plan.ItemHandler == null)
            {
                Debug.LogWarning(
                    $"[showroom] {plan.Model} needs identity keys and has no list handler; " +
                    "its section is left empty for a demo author to wire");
                return null;
            }

            var manifest = plan.Manifest;
            var itemPrefab = BuildListItemPrefab(plan, page);
            var list = section.AddComponent(plan.ListHandler);
            var serialized = new SerializedObject(list);
            serialized.FindProperty(manifest.itemPrefabField).objectReferenceValue =
                itemPrefab.GetComponent(plan.ItemHandler);
            serialized.FindProperty(manifest.contentParentField).objectReferenceValue =
                ItemsOf(section.transform);
            // Which of the collection's mount axes this list reads through,
            // decided in PlanSections and null when there is nothing to write.
            //
            // intValue, not enumValueIndex: the axis values are derived from
            // member names rather than positions, so they are not a dense
            // 0..n-1 range and an index into the member list is not the value.
            // intValue is the serialized representation itself.
            if (plan.Axis.HasValue) serialized.FindProperty(manifest.listAxisField).intValue = plan.Axis.Value;
            foreach (var scope in plan.Declaration.Scope)
            {
                // Resolved by name: CollectScopeProblems refused any name the
                // collection is not made with before the scene existed.
                var parameter = manifest.scopeParameters.First(candidate => candidate.name == scope.Key);
                WriteScalar(serialized.FindProperty(parameter.fieldName), parameter, scope.Value);
            }
            serialized.ApplyModifiedPropertiesWithoutUndo();
            return ListItemPrefabPath(plan.Model);
        }

        /// <summary>
        /// Writes a declared value into the field that backs a key or a scope,
        /// in the scalar the manifest says the field serializes as. The value
        /// arrives as text — the declaration is a wire format — and the field's
        /// own type is what decides how it is read.
        /// </summary>
        private static void WriteScalar(SerializedProperty property, ManifestParameter parameter, string value)
        {
            switch (parameter.serializedType)
            {
                case "int":
                    property.intValue = int.Parse(value, CultureInfo.InvariantCulture);
                    break;
                case "long":
                    property.longValue = long.Parse(value, CultureInfo.InvariantCulture);
                    break;
                case "bool":
                    property.boolValue = bool.Parse(value);
                    break;
                case "string":
                    property.stringValue = value;
                    break;
                default:
                    throw new InvalidOperationException(
                        $"[showroom] '{parameter.name}' serializes as '{parameter.serializedType}', " +
                        "which this builder has no way to write; the generator and this builder " +
                        "disagree, so update whichever is older.");
            }
        }

        /// <summary>
        /// The value of the mount axis this model's list reads through, taken
        /// from the `{Model}ListAxis` members the manifest lists rather than
        /// assumed, so a member added or renamed there cannot silently point a
        /// demo at a different GS2 model.
        ///
        /// Every failure throws, and the throw reaches <see cref="Build"/>,
        /// which exits non-zero. Nothing here falls back to an axis of its own
        /// choosing: the bake reports only its exit code, so a warning and a
        /// default would put a page in front of a model nobody asked for and
        /// leave the run looking clean.
        /// </summary>
        private static int ListAxisValue(SectionPlan plan)
        {
            var manifest = plan.Manifest;
            var section = plan.Section;
            // The manifest lists the selectable members only; the zero member
            // is what an unwritten field reads as, not an axis anything can be
            // pointed at.
            var names = manifest.listAxisMembers.Select(member => member.name).ToArray();
            var offered = string.Join(", ", names);
            if (string.IsNullOrEmpty(section.Axis))
            {
                throw new InvalidOperationException(
                    $"[showroom] {plan.Model} reads through one of several mount axes and " +
                    "`page.json` does not say which. Add \"axis\" to its section; " +
                    $"the generator offers {offered}.");
            }
            // Ordinal, and exact: an axis name is a generated identifier, so a
            // near miss is a mistake worth naming rather than one to absorb.
            var member = manifest.listAxisMembers.FirstOrDefault(
                candidate => string.Equals(candidate.name, section.Axis, StringComparison.Ordinal));
            if (member == null)
            {
                throw new InvalidOperationException(
                    $"[showroom] {plan.Model}: `page.json` names the mount axis '{section.Axis}', " +
                    $"which {manifest.listAxisEnumTypeName} does not declare. The generator offers {offered}.");
            }
            return member.value;
        }

        private static GameObject BuildListItemPrefab(SectionPlan plan, ShowroomPage page)
        {
            var model = plan.Model;
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
            item.AddComponent(plan.ItemHandler);
            var body = ItemsOf(item.transform);
            RealizeRows(plan, body, plan.Section, page, plan.Countdowns);
            WireToggles(model, item, plan.Toggles, body, plan.Section);

            Directory.CreateDirectory(GeneratedPrefabDirectory);
            var saved = PrefabUtility.SaveAsPrefabAsset(item, ListItemPrefabPath(model));
            UnityEngine.Object.DestroyImmediate(item);
            return saved;
        }

        /// <summary>Where a model's list-item prefab is written.</summary>
        private static string ListItemPrefabPath(string model)
        {
            return $"{GeneratedPrefabDirectory}/{model}ListItem.prefab";
        }

        /// <summary>
        /// Removes the list-item prefabs in the generated directory that this
        /// bake did not write.
        ///
        /// A section that leaves the page takes its list with it, and the
        /// prefab its rows were spawned from stays behind: nothing in a later
        /// bake reaches that file again, so it sits in the demo's repository as
        /// part of a page that is no longer there.
        ///
        /// What decides is this run, not the model's name. A model can be a
        /// list in one demo and a section with no list in another —
        /// `CharacterRecruit` is both, a roster's list of recruitable
        /// characters and a dex's single recruit button — so deleting by name
        /// would take a prefab a sibling demo is still built on. The question
        /// asked of each file is only whether this bake wrote it.
        ///
        /// Called on a bake that built the page, and on no other: the run that
        /// finds a scene already there and leaves it alone wrote nothing, so
        /// every prefab would look orphaned to it.
        /// </summary>
        private static void RemoveOrphanedListItemPrefabs(IReadOnlyCollection<string> written)
        {
            if (!Directory.Exists(GeneratedPrefabDirectory)) return;
            var found = Directory.GetFiles(GeneratedPrefabDirectory, "*ListItem.prefab")
                .Select(file => file.Replace('\\', '/'))
                .OrderBy(path => path, StringComparer.Ordinal);
            foreach (var path in found)
            {
                if (written.Contains(path, StringComparer.Ordinal)) continue;
                if (AssetDatabase.DeleteAsset(path))
                {
                    Debug.Log($"[showroom] removed {path}; this page carries no list for it");
                    continue;
                }
                Debug.LogWarning(
                    $"[showroom] {path} is left over from a list this page no longer carries " +
                    "and could not be removed; delete it by hand");
            }
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
        /// A row names a component and this draws it in the shape that
        /// component asks for. The order rows appear in is the order they were
        /// declared in — there is no second pass that rearranges a finished
        /// section, because nothing composes a section that the page did not
        /// ask for.
        ///
        /// The warnings below are insurance rather than the guard. A declared
        /// name that resolves to nothing has already failed the bake in
        /// <see cref="RefuseWhatThePageCannotBuild"/>, before there was a scene
        /// to leave a row off.
        /// </summary>
        private static void RealizeRows(
            SectionPlan plan, Transform body, SectionSpec section, ShowroomPage page,
            IReadOnlyList<Type> countdowns)
        {
            var model = plan.Model;
            foreach (var row in section.Rows)
            {
                var component = UiComponentNamed(plan, row.Component);
                if (component == null)
                {
                    Debug.LogWarning(
                        $"[showroom] {model}: no generated component named '{row.Component}'; " +
                        "that row is left off the page");
                    continue;
                }
                var caption = row.Caption == null ? null : UiComponentNamed(plan, row.Caption);
                if (row.Caption != null && caption == null)
                {
                    Debug.LogWarning(
                        $"[showroom] {model}: '{row.Component}' names '{row.Caption}' as its " +
                        "reading, but no such component was generated");
                }

                switch (component.Kind)
                {
                    case RowKind.Gauge:
                        AddGaugeRow(body, model, component, caption);
                        break;
                    case RowKind.Clock:
                        AddCountdownRow(body, model, component, countdowns);
                        break;
                    case RowKind.Button:
                        AddActionRow(body, model, component, page, caption);
                        break;
                    case RowKind.Label:
                        AddValueRow(body, model, component);
                        break;
                    default:
                        Debug.LogWarning(
                            $"[showroom] {model}: '{row.Component}' is not a kind of row this page " +
                            "knows how to draw");
                        break;
                }
            }
        }

        /// <summary>
        /// What a section looks like when the demo has not said.
        ///
        /// A starting point, not a second way to build a page: the result is a
        /// declaration in exactly the shape `page.json` takes, and
        /// <see cref="CollectUndeclaredSections"/> hands it to an author to
        /// paste back and cut down to the rows their page is actually for.
        /// Everything it decides here, it decides because nobody told it —
        /// which reading belongs on a bar is a guess that only holds when there
        /// is one bar and one label, and the order is only the order things
        /// read in when a section has one purpose. Which is why a bake that
        /// reads a declaration offers this rather than drawing it.
        /// </summary>
        private static SectionSpec DeriveSection(
            IReadOnlyList<RowComponent> labels, IReadOnlyList<RowComponent> buttons,
            IReadOnlyList<RowComponent> gauges, IReadOnlyList<RowComponent> clocks,
            IReadOnlyList<ToggleComponent> toggles)
        {
            var section = new SectionSpec();
            var readings = new Dictionary<RowComponent, RowComponent>();
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
        /// The keys a collection is made with, as its factory names them — the
        /// parameters past the runtime context every collection takes.
        /// </summary>
        private static IReadOnlyList<string> CollectionScopeNames(SectionPlan plan)
        {
            return plan.Manifest.scopeParameters.Select(parameter => parameter.name).ToList();
        }

        /// <summary>
        /// Whether the page pins this model to one row rather than listing it.
        /// </summary>
        private static bool DeclaresKey(SectionPlan plan)
        {
            return plan.Declaration != null && plan.Declaration.Key.Count > 0;
        }

        /// <summary>
        /// Mount the handler, holding it to the row the page named.
        ///
        /// The keys go in as serialized fields rather than through `SetKeys`,
        /// because this runs with no scene playing: the handler reads them for
        /// itself when it starts, which is the same thing the Inspector does.
        /// </summary>
        private static void PlaceHandler(GameObject host, SectionPlan plan)
        {
            var component = host.AddComponent(plan.Handler);
            if (!DeclaresKey(plan)) return;
            var serialized = new SerializedObject(component);
            foreach (var key in plan.Declaration.Key)
            {
                // Resolved by name: CollectKeyProblems refused any name the
                // model is not identified by before the scene existed.
                var parameter = plan.Manifest.identityKeys.First(candidate => candidate.name == key.Key);
                WriteScalar(serialized.FindProperty(parameter.fieldName), parameter, key.Value);
            }
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        /// <summary>
        /// Whether the demo declared this model's section and gave it no rows.
        ///
        /// A model with no `section` line at all is refused instead. Leaving a
        /// model out of `page.json` is not a way to take its section off the
        /// page; declaring it with no rows is.
        /// </summary>
        private static bool DeclaresNoRows(SectionPlan plan)
        {
            return plan.Declaration != null && plan.Declaration.Rows.Count == 0;
        }

        /// <summary>
        /// The section a model is built from: what the demo declared. A model
        /// with drawables and no declaration was refused in
        /// <see cref="CollectUndeclaredSections"/> before anything was built,
        /// so reaching here without one is a bug in this builder, not a page
        /// to guess at.
        /// </summary>
        private static SectionSpec SectionFor(SectionPlan plan)
        {
            if (plan.Declaration != null) return plan.Declaration;
            throw new InvalidOperationException(
                $"[showroom] {plan.Model}: reached the build with no declaration; " +
                "CollectUndeclaredSections should have refused it");
        }

        /// <summary>One derived row, written the way `page.json` writes one.</summary>
        private static string RowAsJson(RowSpec row)
        {
            if (row.Caption == null) return $"\"{row.Component}\"";
            return $"{{\"component\": \"{row.Component}\", \"caption\": \"{row.Caption}\"}}";
        }

        /// <summary>
        /// The component a row names: one the package generated for this
        /// model, or one the demo wrote itself.
        ///
        /// A generated button knows the action it calls and nothing about the
        /// call's surroundings — which wallet a purchase deposits into, which
        /// receipt it verifies against. Those are the demo's, the same way the
        /// countdown behaviour is, so a row may name a behaviour the demo
        /// wrote. It is drawn exactly like a generated one: this page tells the
        /// kinds of row apart by shape, so a demo's behaviour is a button when
        /// it carries a button's shape.
        ///
        /// Generated first, so what a package emits cannot be shadowed by a
        /// name a demo happens to reuse.
        /// </summary>
        private static RowComponent UiComponentNamed(SectionPlan plan, string name)
        {
            var generated = plan.Components.FirstOrDefault(
                component => string.Equals(component.Name, name, StringComparison.Ordinal));
            if (generated != null) return generated;
            var written = DemoWrittenRowBehaviours()
                .Where(component => component.Name == name)
                .ToList();
            if (written.Count > 1)
            {
                throw new InvalidOperationException(
                    $"[showroom] `page.json` asks for a row of '{name}' and this demo wrote " +
                    $"{written.Count} behaviours by that name ({Listed(written.Select(component => FullName(component.Type)))}). " +
                    "A row names one behaviour, so rename all but one.");
            }
            return written.FirstOrDefault();
        }

        /// <summary>
        /// The behaviours the demo wrote that a page can draw as a row, read
        /// off their shape: this is the one place the assembly is still asked
        /// what something is, because a demo's own behaviour has no manifest
        /// and the DSL cannot yet put a generated button on a dependency's
        /// delegated action.
        ///
        /// Generated components are not among them — a package's own emission
        /// is found through its manifest, and a generator that one day emits
        /// the same name must not be able to make a demo's behaviour ambiguous.
        /// </summary>
        private static IEnumerable<RowComponent> DemoWrittenRowBehaviours()
        {
            return AppDomain.CurrentDomain.GetAssemblies()
                .SelectMany(SafeTypes)
                .Where(type =>
                    type.IsClass && !type.IsAbstract &&
                    typeof(MonoBehaviour).IsAssignableFrom(type) &&
                    !(type.Namespace ?? "").StartsWith(GeneratedNamespacePrefix))
                .Select(WrittenRowComponent)
                .Where(component => component != null);
        }

        /// <summary>
        /// A demo-written behaviour as the row it draws, or null when it has no
        /// row's shape. Asked in the order the rows are drawn, so a behaviour
        /// that answers to two shapes is the same row here as there.
        /// </summary>
        private static RowComponent WrittenRowComponent(Type type)
        {
            if (IsGauge(type))
                return new RowComponent { Name = type.Name, Type = type, Kind = RowKind.Gauge, Suffix = "Gauge", TargetField = "_target" };
            if (IsClock(type))
                return new RowComponent { Name = type.Name, Type = type, Kind = RowKind.Clock, Suffix = "Value" };
            if (IsButton(type))
                return new RowComponent
                {
                    Name = type.Name, Type = type, Kind = RowKind.Button, Suffix = "Button",
                    ReportsFailure = ReportsFailure(type), TargetField = "_button",
                };
            if (IsLabel(type))
                return new RowComponent { Name = type.Name, Type = type, Kind = RowKind.Label, Suffix = "Label" };
            return null;
        }

        private static string FullName(Type type)
        {
            return type.Namespace == null ? type.Name : $"{type.Namespace}.{type.Name}";
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

        /// <summary>
        /// Whether a button can hand a failure to the page, which is the other
        /// half of the shape a row's action carries.
        /// </summary>
        private static bool ReportsFailure(Type component)
        {
            return component.GetProperty("OnFailed")?.PropertyType == typeof(ErrorEvent);
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
        private static void AddGaugeRow(
            Transform section, string model, RowComponent gauge, RowComponent reading)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(GaugeRowPrefabPath);
            var row = (GameObject)PrefabUtility.InstantiatePrefab(prefab, section);
            row.name = gauge.Name;

            var component = row.AddComponent(gauge.Type);
            var serialized = new SerializedObject(component);
            serialized.FindProperty(gauge.TargetField).objectReferenceValue =
                row.transform.Find("Fill").GetComponent<Image>();
            serialized.ApplyModifiedPropertiesWithoutUndo();

            SetText(
                row.transform.Find("Caption"),
                Humanize(TrimModelPrefix(reading ?? gauge, model)));

            var value = row.transform.Find("Value");
            if (reading == null) value.gameObject.SetActive(false);
            else BindLabel(row, reading.Type, value.GetComponent<Text>());
        }

        /// <summary>
        /// Draws a `DateTime` reading as time left through the showroom's own
        /// <see cref="ShowroomCountdown"/>, and hands the same deadline to every
        /// behaviour the demo wrote to react to one. A generated `value`
        /// component hands over the native type precisely so the page can
        /// decide how it reads; the reading is the showroom's, the reaction is
        /// the demo's.
        /// </summary>
        private static void AddCountdownRow(
            Transform section, string model, RowComponent clock, IReadOnlyList<Type> reactions)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(ValueRowPrefabPath);
            var row = (GameObject)PrefabUtility.InstantiatePrefab(prefab, section);
            row.name = clock.Name;
            SetText(row.transform.Find("Caption"), Humanize(TrimModelPrefix(clock, model)));

            var component = row.AddComponent(clock.Type);
            var onUpdate = (UnityEvent<DateTime>)clock.Type.GetProperty("OnUpdate").GetValue(component);

            var countdown = row.AddComponent<ShowroomCountdown>();
            var serialized = new SerializedObject(countdown);
            serialized.FindProperty("_label").objectReferenceValue =
                row.transform.Find("Value").GetComponent<Text>();
            serialized.ApplyModifiedPropertiesWithoutUndo();
            UnityEventTools.AddPersistentListener(
                onUpdate, (UnityAction<DateTime>)countdown.SetDeadline);
            EditorUtility.SetDirty(countdown);

            foreach (var reactionType in reactions)
            {
                var reaction = row.AddComponent(reactionType);
                UnityEventTools.AddPersistentListener(
                    onUpdate,
                    (UnityAction<DateTime>)Delegate.CreateDelegate(
                        typeof(UnityAction<DateTime>), reaction, "SetDeadline"));
                EditorUtility.SetDirty(reaction);
            }
            EditorUtility.SetDirty(component);
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
            string model, GameObject root, IReadOnlyList<ToggleComponent> toggles, Transform body,
            SectionSpec section)
        {
            foreach (var toggle in toggles)
            {
                if (!section.Toggles.TryGetValue(toggle.Name, out var declared) ||
                    declared.Length == 0)
                {
                    Debug.LogWarning(
                        $"[showroom] {model}: '{toggle.Name}' governs no rows in this " +
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
                        $"on this section, so '{toggle.Name}' is left off the page");
                    continue;
                }

                var targets = toggle.Hides
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
                        $"'{string.Join("|", declared)}' for '{toggle.Name}'");
                    continue;
                }

                var component = root.AddComponent(toggle.Type);
                var serialized = new SerializedObject(component);
                // The true branch enables, the false branch hides: each kind
                // names the arm that means "the condition is good news", and
                // the manifest says what that arm is called.
                var arm = serialized.FindProperty(toggle.ArmField);
                arm.arraySize = targets.Count;
                for (var i = 0; i < targets.Count; i++)
                {
                    arm.GetArrayElementAtIndex(i).objectReferenceValue = targets[i];
                }
                serialized.ApplyModifiedPropertiesWithoutUndo();
                EditorUtility.SetDirty(component);
            }
        }

        private static void AddValueRow(Transform section, string model, RowComponent label)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(ValueRowPrefabPath);
            var row = (GameObject)PrefabUtility.InstantiatePrefab(prefab, section);
            row.name = label.Name;
            SetText(row.transform.Find("Caption"), Humanize(TrimModelPrefix(label, model)));
            BindLabel(row, label.Type, row.transform.Find("Value").GetComponent<Text>());
        }

        private static void AddActionRow(
            Transform section, string model, RowComponent button, ShowroomPage page,
            RowComponent caption)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(ActionRowPrefabPath);
            var row = (GameObject)PrefabUtility.InstantiatePrefab(prefab, section);
            row.name = button.Name;
            var buttonTransform = row.transform.Find("Button");
            SetText(buttonTransform.Find("Label"), Humanize(TrimModelPrefix(button, model)));

            var captionTransform = row.transform.Find("Caption");
            if (caption == null)
            {
                // Nothing to say beside the button; the button's own name is
                // the whole row.
                captionTransform.gameObject.SetActive(false);
            }
            else
            {
                BindLabel(row, caption.Type, captionTransform.GetComponent<Text>());
            }

            var action = row.AddComponent(button.Type);
            var serialized = new SerializedObject(action);
            serialized.FindProperty(button.TargetField).objectReferenceValue =
                buttonTransform.GetComponent<Button>();
            serialized.ApplyModifiedPropertiesWithoutUndo();

            // The browser hides the console, so a failure a visitor cannot see
            // is a failure that looks like nothing happening.
            var failed = (ErrorEvent)button.Type.GetProperty("OnFailed").GetValue(action);
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

        /// <summary>
        /// `WalletFreeBalanceLabel` -> `FreeBalance`, `CharacterExperienceGauge`
        /// -> `Experience`. What kind of component it is is already said by the
        /// row it is drawn in, so only what it reads is left. The suffix that
        /// goes is the one the component's kind gives it — a label's `Label`, a
        /// value's `Value` — and the rest of the name is the reading, whatever
        /// it happens to end in.
        ///
        /// The model is the section's: a generated component carries it in its
        /// namespace too, but a demo-written one lives wherever the demo put
        /// it, and its name is prefixed the same way.
        /// </summary>
        private static string TrimModelPrefix(RowComponent component, string model)
        {
            var name = component.Name;
            if (name.StartsWith(model)) name = name.Substring(model.Length);
            var suffix = component.Suffix ?? "";
            if (suffix.Length > 0 && name.EndsWith(suffix) && name.Length > suffix.Length)
            {
                name = name.Substring(0, name.Length - suffix.Length);
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
