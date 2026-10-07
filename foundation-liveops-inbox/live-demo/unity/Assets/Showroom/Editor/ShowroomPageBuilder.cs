// Rebuild replaces content-mount children; hand-authored scene content must live outside that mount.
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

        private const string PanelField = "_panel";

        private const string PanelButtonTemplateField = "_buttonTemplate";
        private const string PanelFontField = "_font";
        private const string GeneratedPrefabDirectory = "Assets/Showroom/Generated";
        private const string GeneratedNamespacePrefix = "GS2Studio.Generated.";

        private const string ManifestDirectory = "Assets/GS2Studio/Generated/Handlers";
        private const string ManifestSuffix = ".showroom.json";
        private const int ManifestSchemaVersion = 2;

        // JsonUtility binds fields by name; keep these names aligned with the generated manifest.

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

        private enum RowKind
        {
            None,
            Label,
            Clock,
            Button,
            Gauge,
            Panel,
        }

        private sealed class RowComponent
        {
            public string Name;
            public Type Type;
            public RowKind Kind;
            public string Suffix;
            public bool ReportsFailure;
            public string TargetField;
        }

        private sealed class ToggleComponent
        {
            public string Name;
            public Type Type;
            public bool Hides;
            public string ArmField;
        }

        // Captions describe the page's use of a component and cannot be inferred from its manifest.
        private struct RowSpec
        {
            public string Component;
            public string Caption;
        }

        // One model can appear in multiple sections with different rows; layout identity is the section.
        private class SectionSpec
        {
            // The generator's primary loader cannot determine which mount axis this page intends to show.
            public string Axis;
            public List<RowSpec> Rows = new List<RowSpec>();
            public Dictionary<string, string[]> Toggles = new Dictionary<string, string[]>();
            // Enumeration can omit a not-yet-created row; pinned keys let its handler read that row directly.
            public Dictionary<string, string> Key = new Dictionary<string, string>();
            // Row identity does not choose a collection subset; the page must supply its scope separately.
            public Dictionary<string, string> Scope = new Dictionary<string, string>();
            public KeyFromSpec KeyFrom;
            // Only lists have a loaded-and-empty state distinct from their loading state.
            public string Empty;
        }

        private sealed class KeyFromSpec
        {
            public string Section;
            public Dictionary<string, string> Keys = new Dictionary<string, string>();
            public string While;
        }

        private sealed class DeclaredSection
        {
            public string Id;
            public string Model;
            public string Heading;
            public SectionSpec Spec = new SectionSpec();
        }

        // Plan without touching assets so an invalid declaration cannot leave a partially baked scene.
        private class SectionPlan
        {
            public ComponentManifest Manifest;
            public string Model;
            // Use the declaration key in errors: the page may draw the same model in several sections.
            public string SectionId;
            public string Heading;
            // Headings are prose; asset names strip punctuation and must be checked for collisions.
            public string Name;
            public Type Handler;
            // Retain non-drawable components so invalid declared rows can be diagnosed by their actual kind.
            public IReadOnlyList<RowComponent> Components;
            public IReadOnlyList<RowComponent> Labels;
            public IReadOnlyList<RowComponent> Buttons;
            public IReadOnlyList<RowComponent> Gauges;
            public IReadOnlyList<RowComponent> Clocks;
            public IReadOnlyList<ToggleComponent> Toggles;
            public SectionSpec Declaration;
            // Other sections may depend on a handler even when it has no visible section of its own.
            public SectionSpec Section;
            public IReadOnlyList<Type> Countdowns = new List<Type>();
            public Type ListHandler;
            public Type ItemHandler;
            public int? Axis;
            public Component Mounted;
            public GameObject SectionObject;
        }

        // Keep process exit ownership here so an open Editor can call BuildPage without exiting.
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

        // The Node authoring side validates JSON; a tab-separated bridge avoids a second JSON model here.
        // Preserve first-seen declaration order because that is the page's section order.
        private static IReadOnlyList<DeclaredSection> ReadDeclaration(string path)
        {
            if (string.IsNullOrEmpty(path) || !File.Exists(path))
            {
                // Guessing a layout without a declaration would publish choices the demo never made.
                throw new InvalidOperationException(
                    "[showroom] no page declaration to build from" +
                    (string.IsNullOrEmpty(path) ? "" : $" at {path}") +
                    "; `page.mjs` writes one out of the demo's `page.json`");
            }
            var declared = new List<DeclaredSection>();
            var byKey = new Dictionary<string, DeclaredSection>(StringComparer.Ordinal);
            foreach (var line in File.ReadAllLines(path))
            {
                var parts = line.Split('\t');
                if (parts.Length < 2 || parts[1].Length == 0) continue;
                if (!byKey.TryGetValue(parts[1], out var entry))
                {
                    entry = DeclaredSectionKeyed(parts[1]);
                    byKey[parts[1]] = entry;
                    declared.Add(entry);
                }
                var section = entry.Spec;
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
                else if (parts[0] == "keyfrom" && parts.Length > 2)
                {
                    section.KeyFrom = section.KeyFrom ?? new KeyFromSpec();
                    section.KeyFrom.Section = parts[2].Length > 0 ? parts[2] : null;
                    section.KeyFrom.While = parts.Length > 3 && parts[3].Length > 0 ? parts[3] : null;
                }
                else if (parts[0] == "keyof" && parts.Length > 3)
                {
                    section.KeyFrom = section.KeyFrom ?? new KeyFromSpec();
                    section.KeyFrom.Keys[parts[2]] = parts[3];
                }
                else if (parts[0] == "empty" && parts.Length > 2 && parts[2].Length > 0)
                {
                    section.Empty = parts[2];
                }
            }
            return declared;
        }

        private static DeclaredSection DeclaredSectionKeyed(string id)
        {
            var divider = id.IndexOf('#');
            if (divider < 0) return new DeclaredSection { Id = id, Model = id, Heading = null };
            var model = id.Substring(0, divider);
            var heading = id.Substring(divider + 1);
            if (model.Length == 0 || heading.Trim().Length == 0)
            {
                throw new InvalidOperationException(
                    $"[showroom] '{id}' names " +
                    (model.Length == 0 ? "no model to draw" : "no heading to carry") +
                    "; a section key is a model, or a model and a heading divided by '#'");
            }
            return new DeclaredSection { Id = id, Model = model, Heading = heading };
        }

        private static string SectionName(DeclaredSection declared)
        {
            if (declared.Heading == null) return declared.Model;
            var name = new System.Text.StringBuilder(declared.Model);
            foreach (var character in declared.Heading)
            {
                if (char.IsLetterOrDigit(character)) name.Append(character);
            }
            return name.ToString();
        }

        // Editor and batch builds must validate the same declaration rather than derive different layouts.
        public static int BuildPage(
            string title, string subtitle, bool rebuild, string declarationPath)
        {
            return BuildPage(title, subtitle, rebuild, ReadDeclaration(declarationPath));
        }

        private static int BuildPage(
            string title, string subtitle, bool rebuild,
            IReadOnlyList<DeclaredSection> declaredSections)
        {
            var existed = File.Exists(ScenePath);
            if (existed && !rebuild)
            {
                Debug.Log($"[showroom] {ScenePath} already exists; left alone");
                return -1;
            }

            // Plan before copying: a failed first bake must not leave a scene that later runs skip as complete.
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
                // Delete only a scene this attempt created; a failed rebuild must not delete the existing scene.
                // Planning first remains necessary because process termination can bypass this cleanup.
                if (!existed && File.Exists(ScenePath)) DiscardCopiedScene();
                throw;
            }
            // Delete old item prefabs only after saving the scene that no longer references them.
            RemoveOrphanedListItemPrefabs(itemPrefabs);
            Debug.Log($"[showroom] wrote {ScenePath} with {sections} section(s)");
            return sections;
        }

        // Cleanup failures must not replace the original bake exception.
        private static void DiscardCopiedScene()
        {
            try
            {
                // Leave the scene before deleting the asset currently open in the Editor.
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
            // Copy the shared host scene so initial wiring cannot drift from the template.
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

        // Clearing children leaves components on the mount; remove generated handlers to avoid duplicate subscriptions.
        private static void ClearGeneratedComponents(Transform mount)
        {
            var doomed = mount.GetComponents<MonoBehaviour>()
                .Where(component =>
                    component != null &&
                    (component.GetType().Namespace ?? "").StartsWith(GeneratedNamespacePrefix))
                .ToList();
            foreach (var component in doomed) UnityEngine.Object.DestroyImmediate(component);
        }

        // Ordinal ordering makes dependency mounts deterministic without changing declared section order.
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

        // JsonUtility leaves missing fields null; downstream readers expect empty strings and arrays.
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

        // A missing compiled type indicates manifest drift; guessing would miswire generated components.
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

        // Unsupported value payloads must stay undrawn rather than be cast into incompatible row events.
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

        private static IReadOnlyList<SectionPlan> PlanSections(
            IReadOnlyList<DeclaredSection> declaredSections)
        {
            // Share each model's metadata so every section resolves the same generated surface.
            var offered = new Dictionary<string, SectionPlan>(StringComparer.Ordinal);
            var generated = new List<string>();
            foreach (var manifest in ReadManifests())
            {
                var components = manifest.components
                    .Select(component => GeneratedRowComponent(manifest, component))
                    .OrderBy(component => component.Name, StringComparer.Ordinal)
                    .ToList();
                offered[manifest.model] = new SectionPlan
                {
                    Manifest = manifest,
                    Model = manifest.model,
                    Handler = ResolveType(manifest, manifest.@namespace + "." + manifest.handler),
                    Components = components,
                    Labels = components.Where(component => component.Kind == RowKind.Label).ToList(),
                    Buttons = components.Where(component => component.Kind == RowKind.Button).ToList(),
                    Gauges = components.Where(component => component.Kind == RowKind.Gauge).ToList(),
                    Clocks = components.Where(component => component.Kind == RowKind.Clock).ToList(),
                    Toggles = TogglesOf(manifest),
                };
                generated.Add(manifest.model);
            }

            var plans = new List<SectionPlan>();
            var declaredModels = new HashSet<string>(StringComparer.Ordinal);
            foreach (var declared in declaredSections)
            {
                // Defer unknown models to aggregated diagnostics so they are reported together.
                if (!offered.TryGetValue(declared.Model, out var offer)) continue;
                declaredModels.Add(declared.Model);
                plans.Add(SectionOf(offer, declared));
            }
            foreach (var model in generated)
            {
                if (declaredModels.Contains(model)) continue;
                plans.Add(SectionOf(offered[model], null));
            }

            foreach (var plan in plans)
            {
                // A keyed handler without keys binds nothing; use its list unless the section pins one row.
                // Resolve this before validation because list sections may need an explicit mount axis.
                var manifest = plan.Manifest;
                if (manifest.keyed && !PinsOneRow(plan) &&
                    manifest.listHandler.Length > 0 && manifest.listItemHandler.Length > 0)
                {
                    plan.ListHandler = ResolveType(manifest, manifest.@namespace + "." + manifest.listHandler);
                    plan.ItemHandler = ResolveType(manifest, manifest.@namespace + "." + manifest.listItemHandler);
                }
            }

            var countdowns = CountdownBehaviours();

            RefuseWhatThePageCannotBuild(plans, declaredSections);

            foreach (var plan in plans)
            {
                if (DrawsNothing(plan)) continue;
                plan.Section = SectionFor(plan);
                if (DrawsClock(plan, plan.Section)) plan.Countdowns = countdowns;

                if (plan.ListHandler == null || plan.ItemHandler == null) continue;
                plan.Axis = PlannedAxis(plan);
            }
            return plans;
        }

        private static SectionPlan SectionOf(SectionPlan offered, DeclaredSection declared)
        {
            return new SectionPlan
            {
                Manifest = offered.Manifest,
                Model = offered.Model,
                Handler = offered.Handler,
                Components = offered.Components,
                Labels = offered.Labels,
                Buttons = offered.Buttons,
                Gauges = offered.Gauges,
                Clocks = offered.Clocks,
                Toggles = offered.Toggles,
                SectionId = declared == null ? offered.Model : declared.Id,
                Heading = declared == null || declared.Heading == null
                    ? Humanize(offered.Model)
                    : declared.Heading,
                Name = declared == null ? offered.Model : SectionName(declared),
                Declaration = declared == null ? null : declared.Spec,
            };
        }

        // Demo-written rows can make a section drawable even when its manifest offers no drawable components.
        private static bool HasDrawables(SectionPlan plan)
        {
            if (plan.Labels.Count > 0 || plan.Buttons.Count > 0 ||
                plan.Gauges.Count > 0 || plan.Clocks.Count > 0)
            {
                return true;
            }
            if (plan.Declaration == null) return false;
            foreach (var row in plan.Declaration.Rows)
            {
                var component = UiComponentNamed(plan, row.Component);
                if (component != null && component.Kind != RowKind.None) return true;
            }
            return false;
        }

        // Validation runs before Section is assigned; share this predicate so validation and drawing agree.
        private static bool DrawsNothing(SectionPlan plan)
        {
            return !HasDrawables(plan) || DeclaresNoRows(plan);
        }

        // Report all problems in one Editor run instead of requiring a launch for each correction.
        private static void RefuseWhatThePageCannotBuild(
            IReadOnlyList<SectionPlan> plans,
            IReadOnlyList<DeclaredSection> declaredSections)
        {
            var problems = new List<string>();
            CollectUnresolvedDeclarations(plans, declaredSections, problems);
            CollectUndeclaredSections(plans, problems);
            CollectUndrawnDeclarations(plans, problems);
            CollectCollidingSections(plans, problems);
            CollectSectionsAtOdds(plans, problems);
            if (problems.Count == 0) return;
            throw new InvalidOperationException(string.Join("\n", problems));
        }

        // Reject authored rows that would silently disappear from an otherwise successful bake.
        private static void CollectUndrawnDeclarations(
            IReadOnlyList<SectionPlan> plans, List<string> problems)
        {
            foreach (var plan in plans.Where(plan => plan.Declaration != null)
                .OrderBy(plan => plan.SectionId, StringComparer.Ordinal))
            {
                if (plan.Declaration.Rows.Count == 0) continue;
                if (HasDrawables(plan)) continue;
                problems.Add(
                    $"[showroom] {plan.SectionId}: `page.json` gives it " +
                    $"{Listed(plan.Declaration.Rows.Select(row => row.Component))}, and none of " +
                    "them is a kind of row this page draws, so the section would be left off " +
                    $"without saying so. It generated {Listed(DrawableNames(plan))}" +
                    $"{WrittenSuffix()}.");
            }
        }

        private static void CollectSectionsAtOdds(
            IReadOnlyList<SectionPlan> plans, List<string> problems)
        {
            foreach (var group in plans
                .Where(plan => plan.Declaration != null)
                .GroupBy(plan => plan.Model, StringComparer.Ordinal)
                .OrderBy(group => group.Key, StringComparer.Ordinal))
            {
                var blank = group.Where(DrawsNothing).Select(plan => plan.SectionId).ToList();
                if (group.Count() < 2 || blank.Count == 0) continue;
                problems.Add(
                    $"[showroom] {group.Key}: `page.json` declares it as " +
                    $"{Listed(group.Select(plan => plan.SectionId))}, and {Listed(blank)} " +
                    "draws no rows. Declaring no rows is how a page leaves a model off, so a " +
                    "page that also draws it elsewhere has said both. To leave it off, declare " +
                    "it once; to draw it more than once, give every section of it the rows it " +
                    "draws.");
            }
        }

        // Sanitized headings can share prefab names and overwrite another section's item prefab.
        private static void CollectCollidingSections(
            IReadOnlyList<SectionPlan> plans, List<string> problems)
        {
            foreach (var group in plans
                .GroupBy(plan => plan.Name, StringComparer.Ordinal)
                .OrderBy(group => group.Key, StringComparer.Ordinal))
            {
                if (group.Count() < 2) continue;
                problems.Add(
                    $"[showroom] {Listed(group.Select(plan => plan.SectionId))} are all written " +
                    $"as '{group.Key}', which is what a section is called in the scene and what " +
                    "the prefab its list spawns rows from is named after. Two sections cannot " +
                    "share it; head them with something that tells them apart.");
            }
        }

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

        // Do not invent toggle targets; listing conditions separately keeps the suggested JSON usable.
        private static string ConditionsOnOffer(SectionPlan plan)
        {
            if (plan.Toggles.Count == 0) return "";
            return
                $" It also generated the conditions {Listed(plan.Toggles.Select(toggle => toggle.Name))}" +
                ", which the guess leaves out because which rows a condition governs is the " +
                "page's to say; add one to \"toggles\" with the rows it governs to wire it " +
                "(an active toggle shows its rows only while its condition is false, an " +
                "interactable leaves its buttons usable only while its condition is true).";
        }

        // page.mjs filters Editor output by line, so multiline suggestions would be truncated.
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

        // Offer an invalid placeholder instead of guessing a primary axis; the page must choose its intended view.
        private static string DerivedAxisJson(SectionPlan plan)
        {
            if (plan.ListHandler == null || plan.Manifest.listAxisEnumTypeName.Length == 0) return null;
            var names = plan.Manifest.listAxisMembers.Select(member => member.name);
            return $"\"axis\": \"<one of: {string.Join(", ", names)}>\"";
        }

        private static void CollectUnresolvedDeclarations(
            IReadOnlyList<SectionPlan> plans,
            IReadOnlyList<DeclaredSection> declaredSections, List<string> problems)
        {
            var models = plans.Select(plan => plan.Model).ToList();
            var byKey = new Dictionary<string, SectionPlan>(StringComparer.Ordinal);
            foreach (var plan in plans)
            {
                if (plan.Declaration != null) byKey[plan.SectionId] = plan;
            }

            foreach (var declared in declaredSections.OrderBy(item => item.Id, StringComparer.Ordinal))
            {
                if (!byKey.TryGetValue(declared.Id, out var plan))
                {
                    problems.Add(
                        $"[showroom] `page.json` declares a section for '{declared.Id}', which " +
                        "this demo generated no handler for. It generated " +
                        $"{Listed(models)}.");
                    continue;
                }
                CollectRowProblems(plan, problems);
                CollectToggleProblems(plan, problems);
                CollectKeyProblems(plan, problems);
                CollectKeyFromProblems(plan, byKey, problems);
                CollectEmptyProblems(plan, problems);
            }
        }

        private static bool DrawsClock(SectionPlan plan, SectionSpec section)
        {
            var clocks = plan.Clocks.Select(clock => clock.Name).ToList();
            return section.Rows.Any(row => clocks.Contains(row.Component, StringComparer.Ordinal));
        }

        // An empty-state message on a non-list would be accepted but never shown.
        private static void CollectEmptyProblems(SectionPlan plan, List<string> problems)
        {
            if (plan.Declaration?.Empty == null || DrawsList(plan)) return;
            problems.Add(
                $"[showroom] {plan.SectionId}: `page.json` gives it an \"empty\" line, and this page " +
                "draws no list for it — the line is what a list says once it has loaded no rows.");
        }

        private static bool DrawsList(SectionPlan plan)
        {
            return !DrawsNothing(plan) && plan.Manifest.keyed && !PinsOneRow(plan) &&
                plan.ListHandler != null && plan.ItemHandler != null;
        }

        // Partial keys leave default component values behind and can silently bind a different row.
        private static void CollectKeyProblems(SectionPlan plan, List<string> problems)
        {
            var declared = plan.Declaration;
            CollectScopeProblems(plan, problems);
            // CollectKeyFromProblems owns the mutually exclusive key/keyFrom error.
            if (declared.Key.Count == 0 || DeclaresKeyFrom(plan)) return;
            var identity = IdentityKeyNames(plan);
            if (identity.Count == 0)
            {
                problems.Add(
                    $"[showroom] {plan.SectionId}: `page.json` names a key for it, and it is not " +
                    "identified by one — it is a single row already, so there is nothing to pin.");
                return;
            }
            foreach (var name in declared.Key.Keys.OrderBy(name => name, StringComparer.Ordinal))
            {
                if (!identity.Contains(name))
                {
                    problems.Add(
                        $"[showroom] {plan.SectionId}: `page.json` pins '{name}', which is not one of " +
                        $"the keys this model is identified by. It is identified by " +
                        $"{Listed(identity)}.");
                }
            }
            foreach (var name in identity)
            {
                if (!declared.Key.ContainsKey(name))
                {
                    problems.Add(
                        $"[showroom] {plan.SectionId}: `page.json` pins it to one row without naming " +
                        $"'{name}', and a row is named by {Listed(identity)}. Name every one of " +
                        "them, or drop the key and let the page list the model.");
                }
            }
        }

        // Validate reflection wiring before baking; a missing member would hide the section as if no row existed.
        // Reject relay chains so one missing source cannot silently disable several downstream sections.
        private static void CollectKeyFromProblems(
            SectionPlan plan, IReadOnlyDictionary<string, SectionPlan> declaredSections,
            List<string> problems)
        {
            if (!DeclaresKeyFrom(plan)) return;
            var declared = plan.Declaration;
            var keyFrom = declared.KeyFrom;
            var prefix = $"[showroom] {plan.SectionId}: `page.json` takes its keys from another section";

            var alongside = new List<string>();
            if (declared.Key.Count > 0) alongside.Add("\"key\"");
            if (declared.Scope.Count > 0) alongside.Add("\"scope\"");
            if (!string.IsNullOrEmpty(declared.Axis)) alongside.Add("\"axis\"");
            if (alongside.Count > 0)
            {
                problems.Add(
                    $"{prefix} and also declares {string.Join(" and ", alongside)}. A section taking " +
                    "its keys from another shows one row whose keys arrive at run time, so it pins " +
                    "none of its own and has no list to scope or read through an axis; drop them.");
            }

            var identity = IdentityKeyNames(plan);
            if (!plan.Manifest.keyed || identity.Count == 0)
            {
                problems.Add(
                    $"{prefix}, and it is not identified by any — it is a single row already, so " +
                    "there is nothing to hand it. Drop \"keyFrom\".");
            }
            else
            {
                foreach (var name in keyFrom.Keys.Keys.OrderBy(name => name, StringComparer.Ordinal))
                {
                    if (identity.Contains(name)) continue;
                    problems.Add(
                        $"{prefix} and hands it '{name}', which is not one of the keys this model " +
                        $"is identified by. It is identified by {Listed(identity)}.");
                }
                foreach (var name in identity)
                {
                    if (keyFrom.Keys.ContainsKey(name)) continue;
                    problems.Add(
                        $"{prefix} without naming where '{name}' comes from, and a row is named " +
                        $"by {Listed(identity)}. Name every one of them.");
                }
                var nonText = plan.Manifest.identityKeys
                    .Where(parameter => parameter.serializedType != "string")
                    .Select(parameter => $"'{parameter.name}' ({parameter.serializedType})")
                    .ToList();
                if (nonText.Count > 0)
                {
                    problems.Add(
                        $"{prefix}, and those keys arrive as text, which {string.Join(", ", nonText)} " +
                        "is not. Only a model identified by text keys can take them from another row.");
                }
                else if (keyFrom.Keys.Keys.All(identity.Contains) && identity.All(keyFrom.Keys.ContainsKey))
                {
                    var setKeys = ShowroomKeyRelay.SetKeysOf(plan.Handler, identity.Count);
                    var parameters = setKeys == null
                        ? new List<string>()
                        : setKeys.GetParameters().Select(parameter => parameter.Name).ToList();
                    if (setKeys == null || !parameters.OrderBy(name => name, StringComparer.Ordinal)
                            .SequenceEqual(identity.OrderBy(name => name, StringComparer.Ordinal), StringComparer.Ordinal))
                    {
                        problems.Add(
                            $"{prefix}, and {plan.Handler.Name} has no `SetKeys` taking exactly " +
                            $"{Listed(identity)} as strings; the generator and this builder " +
                            "disagree, so update whichever is older.");
                    }
                }
                if (plan.Handler.GetEvent("Updated") == null || ShowroomKeyRelay.ModelTypeOf(plan.Handler) == null)
                {
                    problems.Add(
                        $"{prefix}, and {plan.Handler.Name} raises no `Updated` or has no `Model` to " +
                        "show it by; the generator and this builder disagree, so update whichever is older.");
                }
            }

            if (DrawsNothing(plan))
            {
                problems.Add(
                    $"{prefix} and draws nothing, so there is no row for those keys to show. Give it " +
                    "the rows it draws.");
            }

            if (keyFrom.Section == null ||
                !declaredSections.TryGetValue(keyFrom.Section, out var source) ||
                ReferenceEquals(source, plan))
            {
                problems.Add(
                    $"{prefix}, '{keyFrom.Section ?? ""}', which is not another section of this page. " +
                    $"It declares {Listed(declaredSections.Keys.Where(key => key != plan.SectionId))}.");
                return;
            }
            if (DeclaresKeyFrom(source))
            {
                problems.Add(
                    $"{prefix}, '{source.SectionId}', which takes its own keys from another. Take " +
                    "them from a section that shows one row of its own.");
                return;
            }
            if (source.Manifest.keyed && !DeclaresKey(source))
            {
                problems.Add(
                    $"{prefix}, '{source.SectionId}', which is a list and has no one row to read " +
                    "them from. Pin it with \"key\", or take them from a section that shows one row.");
                return;
            }
            var sourceModel = ShowroomKeyRelay.ModelTypeOf(source.Handler);
            if (sourceModel == null || source.Handler.GetEvent("Updated") == null)
            {
                problems.Add(
                    $"{prefix}, '{source.SectionId}', whose {source.Handler.Name} raises no `Updated` " +
                    "or has no `Model` to read; the generator and this builder disagree, so update " +
                    "whichever is older.");
                return;
            }
            var offered = ShowroomKeyRelay.ModelProperties(sourceModel);
            // Reuse runtime predicates so the bake cannot accept keys that the relay cannot read.
            var keyable = offered.Where(ShowroomKeyRelay.IsKeyProperty).Select(property => property.Name);
            foreach (var entry in keyFrom.Keys.OrderBy(item => item.Key, StringComparer.Ordinal))
            {
                var property = ShowroomKeyRelay.ModelProperty(sourceModel, entry.Value);
                if (property != null && ShowroomKeyRelay.IsKeyProperty(property)) continue;
                problems.Add(
                    $"{prefix} and reads '{entry.Key}' off '{entry.Value}', which {source.Model} " +
                    (property == null
                        ? "does not have"
                        : $"has as {property.PropertyType.Name}, and a key is text or a generated id") +
                    $". Its keys can be read off {Listed(keyable)}.");
            }
            if (keyFrom.While != null)
            {
                var condition = ShowroomKeyRelay.ModelProperty(sourceModel, keyFrom.While);
                if (condition == null || !ShowroomKeyRelay.IsConditionProperty(condition))
                {
                    problems.Add(
                        $"{prefix} while '{keyFrom.While}' holds, which {source.Model} has no bool " +
                        "property named. Its bool properties are " +
                        $"{Listed(offered.Where(ShowroomKeyRelay.IsConditionProperty).Select(property => property.Name))}.");
                }
            }
        }

        private static void CollectScopeProblems(SectionPlan plan, List<string> problems)
        {
            var declared = plan.Declaration;
            // CollectKeyFromProblems can explain this conflict; avoid a second no-list error for it.
            if (DeclaresKeyFrom(plan)) return;
            if (plan.ListHandler == null)
            {
                if (declared.Scope.Count > 0)
                {
                    problems.Add(
                        $"[showroom] {plan.SectionId}: `page.json` scopes it, and this page draws no " +
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
                        $"[showroom] {plan.SectionId}: `page.json` scopes its list by '{name}', which " +
                        $"is not one of the keys its collection is made with. It is made with " +
                        $"{Listed(scope)}.");
                }
            }
            // Hidden sections have no list that could load empty, so missing scope needs no warning.
            // Invalid authored scope above still needs rejection because it would otherwise be ignored.
            if (DrawsNothing(plan)) return;
            foreach (var name in scope)
            {
                if (declared.Scope.ContainsKey(name)) continue;
                // Some axes need no collection keys; only runtime readiness can decide, so warn without rejecting.
                Debug.LogWarning(
                    $"[showroom] {plan.SectionId}: its list is made with '{name}' and the page does " +
                    "not say which. If its axis reads through that key, the list will read " +
                    "nothing and the section will draw empty.");
            }
        }

        private static IReadOnlyList<string> IdentityKeyNames(SectionPlan plan)
        {
            return plan.Manifest.identityKeys.Select(parameter => parameter.name).ToList();
        }

        private static void CollectRowProblems(SectionPlan plan, List<string> problems)
        {
            foreach (var row in plan.Declaration.Rows)
            {
                var component = UiComponentNamed(plan, row.Component);
                if (component == null)
                {
                    problems.Add(
                        $"[showroom] {plan.SectionId}: `page.json` asks for a row of " +
                        $"'{row.Component}', which this demo neither generated nor wrote. It " +
                        $"generated {Listed(DrawableNames(plan))}" +
                        $"{WrittenSuffix()}.");
                }
                else if (component.Kind == RowKind.Button && !component.ReportsFailure)
                {
                    problems.Add(
                        $"[showroom] {plan.SectionId}: '{row.Component}' acts but cannot say when it " +
                        "failed. A browser hides the console, so a failure a visitor cannot see " +
                        "reads as nothing having happened — carry an `ErrorEvent OnFailed` the " +
                        "way a generated button does.");
                }
                else if (component.Kind == RowKind.None)
                {
                    problems.Add(
                        $"[showroom] {plan.SectionId}: '{row.Component}' is not a kind of row this " +
                        $"page knows how to draw. It draws {Listed(DrawableNames(plan))}.");
                }
                if (component != null && component.Kind == RowKind.Panel)
                {
                    CollectPanelFieldProblems(plan, component, problems);
                }
                var reading = row.Caption == null ? null : UiComponentNamed(plan, row.Caption);
                if (row.Caption != null && component != null && component.Kind == RowKind.Panel)
                {
                    problems.Add(
                        $"[showroom] {plan.SectionId}: '{row.Component}' is a panel, which draws " +
                        $"its own region and has no line to put '{row.Caption}' beside. Give the " +
                        "reading its own row.");
                }
                else if (row.Caption != null && reading == null)
                {
                    problems.Add(
                        $"[showroom] {plan.SectionId}: '{row.Component}' names '{row.Caption}' as " +
                        "its reading, which this demo neither generated nor wrote. It " +
                        $"generated {Listed(plan.Labels.Select(label => label.Name))}" +
                        $"{WrittenSuffix()}.");
                }
                else if (reading != null && reading.Kind != RowKind.Label)
                {
                    problems.Add(
                        $"[showroom] {plan.SectionId}: '{row.Component}' names '{row.Caption}' as " +
                        $"its reading, and that is no label. It generated " +
                        $"{Listed(plan.Labels.Select(label => label.Name))}{WrittenSuffix()}.");
                }
            }
        }

        // Optional style fields must still have assignable types or the baked panel receives null on device.
        private static void CollectPanelFieldProblems(
            SectionPlan plan, RowComponent panel, List<string> problems)
        {
            foreach (var (field, expected) in new[]
                     {
                         (PanelButtonTemplateField, typeof(Button)),
                         (PanelFontField, typeof(Font)),
                     })
            {
                var declared = panel.Type.GetField(field, BindingFlags.Instance | BindingFlags.NonPublic)?.FieldType;
                if (declared == null || declared == expected) continue;
                problems.Add(
                    $"[showroom] {plan.SectionId}: {panel.Name}.{field} is a {declared.Name}, " +
                    $"and a panel's {field} takes a {expected.Name}.");
            }
        }

        // Validate the declared side: generated-side wiring cannot see misspelled condition names or targets.
        private static void CollectToggleProblems(SectionPlan plan, List<string> problems)
        {
            var declared = plan.Declaration;
            var conditions = plan.Toggles.Select(toggle => toggle.Name).ToList();
            var rows = declared.Rows.Select(row => row.Component).ToList();
            foreach (var entry in declared.Toggles.OrderBy(item => item.Key, StringComparer.Ordinal))
            {
                if (!conditions.Contains(entry.Key, StringComparer.Ordinal))
                {
                    problems.Add(
                        $"[showroom] {plan.SectionId}: `page.json` gives rows to the condition " +
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
                        $"[showroom] {plan.SectionId}: '{entry.Key}' is declared governing no rows. " +
                        "A condition is declared with the rows it governs; to leave it off the " +
                        "page, drop the key.");
                    continue;
                }
                foreach (var name in governed)
                {
                    if (rows.Contains(name, StringComparer.Ordinal)) continue;
                    problems.Add(
                        $"[showroom] {plan.SectionId}: '{entry.Key}' governs '{name}', which is not " +
                        $"a row of this section. Its rows are {Listed(rows)}.");
                }
            }
        }

        private static IEnumerable<string> DrawableNames(SectionPlan plan)
        {
            return plan.Labels
                .Concat(plan.Buttons)
                .Concat(plan.Gauges)
                .Concat(plan.Clocks)
                .Select(component => component.Name);
        }

        // Discover demo reactions once; sorting them makes scene wiring deterministic.
        // Generated DateTime components supply readings, while reactions belong to demo behaviours.
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
                // The row already has a countdown; discovering it again would add a second one without a label.
                type != typeof(ShowroomCountdown) &&
                !(type.Namespace ?? "").StartsWith(GeneratedNamespacePrefix) &&
                type.GetMethod("SetDeadline", new[] { typeof(DateTime) }) != null;
        }

        private static string WrittenSuffix()
        {
            var written = DemoWrittenRowBehaviours().Select(component => component.Name).ToList();
            return written.Count == 0 ? "" : $", and wrote {Listed(written)}";
        }

        private static string Listed(IEnumerable<string> names)
        {
            var ordered = names.Distinct(StringComparer.Ordinal)
                .OrderBy(name => name, StringComparer.Ordinal)
                .ToList();
            return ordered.Count == 0 ? "none" : string.Join(", ", ordered);
        }

        private static int? PlannedAxis(SectionPlan plan)
        {
            var manifest = plan.Manifest;
            var section = plan.Section;
            if (manifest.listAxisEnumTypeName.Length > 0) return ListAxisValue(plan);
            if (string.IsNullOrEmpty(section.Axis)) return null;
            // Without an axis field the declaration cannot be applied; do not silently discard it.
            var only = manifest.listAxes.Length == 1 ? manifest.listAxes[0].memberName : null;
            throw new InvalidOperationException(
                $"[showroom] {plan.SectionId}: `page.json` names the mount axis '{section.Axis}', " +
                $"but its list reads through a single axis" +
                (only == null ? "" : $" ({only})") +
                " and has nothing to choose between; drop \"axis\" from its section.");
        }

        // Track prefabs actually written: a keyed plan without list handlers creates no item prefab.
        private static (int Sections, IReadOnlyCollection<string> ItemPrefabs) BuildSections(
            Transform content, ShowroomPage page, IReadOnlyList<SectionPlan> plans)
        {
            var sectionPrefab = AssetDatabase.LoadAssetAtPath<GameObject>(SectionPrefabPath);
            ClearGeneratedComponents(content);
            // Binder subscriptions already deliver changes; action-triggered reloads duplicate work and can overlap.
            var sectionCount = 0;
            var itemPrefabs = new List<string>();
            // Two root handlers for one model would make ancestor-based resolution ambiguous.
            var mounted = new HashSet<string>(StringComparer.Ordinal);

            foreach (var plan in plans)
            {
                if (plan.Section == null)
                {
                    // Invisible models can still supply state used by another section's components.
                    if (!plan.Manifest.keyed || PinsOneRow(plan))
                    {
                        if (mounted.Contains(plan.Model))
                        {
                            throw new InvalidOperationException(
                                $"[showroom] {plan.SectionId}: a second handler for " +
                                $"{plan.Model} on the page root; CollectSectionsAtOdds should " +
                                "have refused it");
                        }
                        mounted.Add(plan.Model);
                        plan.Mounted = PlaceHandler(content.gameObject, plan);
                    }
                    continue;
                }

                var section = (GameObject)PrefabUtility.InstantiatePrefab(sectionPrefab, content);
                section.name = plan.Name;
                SetText(section.transform.Find("Heading"), plan.Heading);
                var explainer = section.transform.Find("Explainer");
                // No generated explanation is authoritative for this page; hide the unused placeholder.
                if (explainer != null) explainer.gameObject.SetActive(false);
                sectionCount++;

                plan.SectionObject = section;
                if (plan.Manifest.keyed && !PinsOneRow(plan))
                {
                    var itemPrefab = AddList(section, plan, page);
                    if (itemPrefab != null) itemPrefabs.Add(itemPrefab);
                    continue;
                }

                // The first fixed section mounts its handler at the page root for cross-section reads.
                // Later sections mount locally so their rows resolve their own keys first.
                // Declaration order therefore selects which fixed key other sections observe.
                // Relayed keys must stay local or their changing row would alter unrelated sections.
                GameObject host;
                if (DeclaresKeyFrom(plan))
                {
                    host = section;
                }
                else
                {
                    host = mounted.Contains(plan.Model) ? section : content.gameObject;
                    mounted.Add(plan.Model);
                }
                plan.Mounted = PlaceHandler(host, plan);
                var body = ItemsOf(section.transform);
                RealizeRows(plan, body, plan.Section, page, plan.Countdowns);
                WireToggles(plan.SectionId, section, plan.Toggles, body, plan.Section);
            }

            // A relay source may be declared later, so wire only after every handler has been placed.
            WireKeyRelays(plans);

            return (sectionCount, itemPrefabs);
        }

        // Keep the relay on its section so rebuild destroys both together. Bake it active
        // because an inactive object cannot run Awake to decide its own visibility.
        private static void WireKeyRelays(IReadOnlyList<SectionPlan> plans)
        {
            foreach (var plan in plans.Where(DeclaresKeyFrom))
            {
                var keyFrom = plan.Declaration.KeyFrom;
                var source = plans.FirstOrDefault(candidate =>
                    candidate.Declaration != null &&
                    string.Equals(candidate.SectionId, keyFrom.Section, StringComparison.Ordinal));
                if (plan.SectionObject == null || plan.Mounted == null ||
                    source == null || source.Mounted == null)
                {
                    throw new InvalidOperationException(
                        $"[showroom] {plan.SectionId}: reached the build with no handler to take " +
                        $"its keys from '{keyFrom.Section}', or none to give them to; " +
                        "CollectKeyFromProblems should have refused it");
                }
                // Reflection calls SetKeys positionally; declaration dictionary order cannot choose argument order.
                var parameters = ShowroomKeyRelay.SetKeysOf(plan.Handler, keyFrom.Keys.Count).GetParameters();
                var relay = plan.SectionObject.AddComponent<ShowroomKeyRelay>();
                var serialized = new SerializedObject(relay);
                serialized.FindProperty("_source").objectReferenceValue = source.Mounted;
                serialized.FindProperty("_target").objectReferenceValue = plan.Mounted;
                var properties = serialized.FindProperty("_keyProperties");
                properties.arraySize = parameters.Length;
                for (var i = 0; i < parameters.Length; i++)
                {
                    properties.GetArrayElementAtIndex(i).stringValue = keyFrom.Keys[parameters[i].Name];
                }
                serialized.FindProperty("_whileProperty").stringValue = keyFrom.While ?? "";
                serialized.ApplyModifiedPropertiesWithoutUndo();
                EditorUtility.SetDirty(relay);
            }
        }

        private static string AddList(GameObject section, SectionPlan plan, ShowroomPage page)
        {
            if (plan.ListHandler == null || plan.ItemHandler == null)
            {
                Debug.LogWarning(
                    $"[showroom] {plan.SectionId} needs identity keys and has no list handler; " +
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
            // Axis values are name-derived and sparse; enumValueIndex would serialize a position instead of the value.
            if (plan.Axis.HasValue) serialized.FindProperty(manifest.listAxisField).intValue = plan.Axis.Value;
            foreach (var scope in plan.Declaration.Scope)
            {
                var parameter = manifest.scopeParameters.First(candidate => candidate.name == scope.Key);
                WriteScalar(serialized.FindProperty(parameter.fieldName), parameter, scope.Value);
            }
            serialized.ApplyModifiedPropertiesWithoutUndo();
            if (plan.Declaration.Empty != null) AddEmptyState(section, list, plan.Declaration.Empty);
            return ListItemPrefabPath(plan.Name);
        }

        // Keep the empty message beside Items: the list owns and replaces Items children.
        // Bake it hidden so loading never briefly appears as an empty result.
        private static void AddEmptyState(GameObject section, Component list, string text)
        {
            var explainer = section.transform.Find("Explainer");
            if (explainer == null)
                throw new InvalidOperationException(
                    $"{section.name} has no Explainer line to style its empty line on; the section prefab is out of date");
            var items = ItemsOf(section.transform);
            var empty = UnityEngine.Object.Instantiate(explainer.gameObject, section.transform);
            empty.name = "Empty";
            empty.transform.SetSiblingIndex(items.GetSiblingIndex() + 1);
            var label = empty.GetComponent<Text>();
            if (label == null)
                throw new InvalidOperationException(
                    $"{section.name}'s Explainer carries no Text; the section prefab is out of date");
            label.text = text;
            empty.SetActive(false);

            var state = section.AddComponent<ShowroomEmptyState>();
            var serialized = new SerializedObject(state);
            serialized.FindProperty("_list").objectReferenceValue = list;
            serialized.FindProperty("_empty").objectReferenceValue = empty;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(state);
        }

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

        // Never substitute a default for an unknown axis: a successful bake would point at the wrong model.
        private static int ListAxisValue(SectionPlan plan)
        {
            var manifest = plan.Manifest;
            var section = plan.Section;
            // Zero marks an unwritten field; selectable axes come only from the manifest.
            var names = manifest.listAxisMembers.Select(member => member.name).ToArray();
            var offered = string.Join(", ", names);
            if (string.IsNullOrEmpty(section.Axis))
            {
                throw new InvalidOperationException(
                    $"[showroom] {plan.SectionId} reads through one of several mount axes and " +
                    "`page.json` does not say which. Add \"axis\" to its section; " +
                    $"the generator offers {offered}.");
            }
            var member = manifest.listAxisMembers.FirstOrDefault(
                candidate => string.Equals(candidate.name, section.Axis, StringComparison.Ordinal));
            if (member == null)
            {
                throw new InvalidOperationException(
                    $"[showroom] {plan.SectionId}: `page.json` names the mount axis '{section.Axis}', " +
                    $"which {manifest.listAxisEnumTypeName} does not declare. The generator offers {offered}.");
            }
            return member.value;
        }

        private static GameObject BuildListItemPrefab(SectionPlan plan, ShowroomPage page)
        {
            var sectionPrefab = AssetDatabase.LoadAssetAtPath<GameObject>(SectionPrefabPath);
            var item = (GameObject)PrefabUtility.InstantiatePrefab(sectionPrefab);
            PrefabUtility.UnpackPrefabInstance(
                item, PrefabUnpackMode.Completely, InteractionMode.AutomatedAction);
            item.name = plan.Name + "ListItem";
            foreach (var label in new[] { "Heading", "Explainer" })
            {
                var child = item.transform.Find(label);
                if (child != null) child.gameObject.SetActive(false);
            }
            item.AddComponent(plan.ItemHandler);
            var body = ItemsOf(item.transform);
            RealizeRows(plan, body, plan.Section, page, plan.Countdowns);
            WireToggles(plan.SectionId, item, plan.Toggles, body, plan.Section);

            Directory.CreateDirectory(GeneratedPrefabDirectory);
            var saved = PrefabUtility.SaveAsPrefabAsset(item, ListItemPrefabPath(plan.Name));
            UnityEngine.Object.DestroyImmediate(item);
            return saved;
        }

        // Two sections of one model may need different item layouts; a model-only path would overwrite one.
        private static string ListItemPrefabPath(string section)
        {
            return $"{GeneratedPrefabDirectory}/{section}ListItem.prefab";
        }

        // Delete by paths written in this bake, since sections can use different item layouts.
        // A skipped bake writes nothing and must not treat every existing prefab as orphaned.
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

        // The list reorders children; using the section root would push its heading below the rows.
        private static Transform ItemsOf(Transform section)
        {
            var items = section.Find("Items");
            if (items == null)
                throw new InvalidOperationException(
                    $"{section.name} has no Items container; the section prefab is out of date");
            return items;
        }

        // Reject unresolved declarations during planning; warnings here cannot undo a partially written scene.
        private static void RealizeRows(
            SectionPlan plan, Transform body, SectionSpec section, ShowroomPage page,
            IReadOnlyList<Type> countdowns)
        {
            // Captions strip the model prefix, while diagnostics use the section identity to distinguish repeated models.
            var model = plan.Model;
            foreach (var row in section.Rows)
            {
                var component = UiComponentNamed(plan, row.Component);
                if (component == null)
                {
                    Debug.LogWarning(
                        $"[showroom] {plan.SectionId}: no generated component named " +
                        $"'{row.Component}'; that row is left off the page");
                    continue;
                }
                var caption = row.Caption == null ? null : UiComponentNamed(plan, row.Caption);
                if (row.Caption != null && caption == null)
                {
                    Debug.LogWarning(
                        $"[showroom] {plan.SectionId}: '{row.Component}' names '{row.Caption}' as " +
                        "its reading, but no such component was generated");
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
                    case RowKind.Panel:
                        AddPanelRow(body, component);
                        break;
                    default:
                        Debug.LogWarning(
                            $"[showroom] {plan.SectionId}: '{row.Component}' is not a kind of row " +
                            "this page knows how to draw");
                        break;
                }
            }
        }

        // These guesses are authoring suggestions only; silently using them would publish an unchosen layout.
        private static SectionSpec DeriveSection(
            IReadOnlyList<RowComponent> labels, IReadOnlyList<RowComponent> buttons,
            IReadOnlyList<RowComponent> gauges, IReadOnlyList<RowComponent> clocks,
            IReadOnlyList<ToggleComponent> toggles)
        {
            var section = new SectionSpec();
            var readings = new Dictionary<RowComponent, RowComponent>();
            if (gauges.Count == 1 && labels.Count == 1) readings[gauges[0]] = labels[0];

            foreach (var clock in clocks)
            {
                section.Rows.Add(new RowSpec { Component = clock.Name });
            }
            if (clocks.Count == 0 && gauges.Count == 0 && labels.Count == 1 && buttons.Count == 1)
            {
                section.Rows.Add(
                    new RowSpec { Component = buttons[0].Name, Caption = labels[0].Name });
                return section;
            }

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

        private static IReadOnlyList<string> CollectionScopeNames(SectionPlan plan)
        {
            return plan.Manifest.scopeParameters.Select(parameter => parameter.name).ToList();
        }

        private static bool DeclaresKey(SectionPlan plan)
        {
            return plan.Declaration != null && plan.Declaration.Key.Count > 0;
        }

        private static bool DeclaresKeyFrom(SectionPlan plan)
        {
            return plan.Declaration != null && plan.Declaration.KeyFrom != null;
        }

        // Relayed keys also pin one row; checking only static keys would configure half a list.
        private static bool PinsOneRow(SectionPlan plan)
        {
            return DeclaresKey(plan) || DeclaresKeyFrom(plan);
        }

        // No scene is playing during bake; serialize keys for startup instead of invoking runtime SetKeys.
        private static Component PlaceHandler(GameObject host, SectionPlan plan)
        {
            var component = host.AddComponent(plan.Handler);
            if (!DeclaresKey(plan) || DeclaresKeyFrom(plan)) return component;
            var serialized = new SerializedObject(component);
            foreach (var key in plan.Declaration.Key)
            {
                var parameter = plan.Manifest.identityKeys.First(candidate => candidate.name == key.Key);
                WriteScalar(serialized.FindProperty(parameter.fieldName), parameter, key.Value);
            }
            serialized.ApplyModifiedPropertiesWithoutUndo();
            return component;
        }

        private static bool DeclaresNoRows(SectionPlan plan)
        {
            return plan.Declaration != null && plan.Declaration.Rows.Count == 0;
        }

        private static SectionSpec SectionFor(SectionPlan plan)
        {
            if (plan.Declaration != null) return plan.Declaration;
            throw new InvalidOperationException(
                $"[showroom] {plan.Model}: reached the build with no declaration; " +
                "CollectUndeclaredSections should have refused it");
        }

        private static string RowAsJson(RowSpec row)
        {
            if (row.Caption == null) return $"\"{row.Component}\"";
            return $"{{\"component\": \"{row.Component}\", \"caption\": \"{row.Caption}\"}}";
        }

        // Generated components take precedence so a demo class cannot shadow the package's emitted component.
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

        // Demo behaviours have no manifest, so inspect their shapes. Exclude generated types
        // already resolved through manifests to avoid ambiguous duplicate discovery.
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

        private static RowComponent WrittenRowComponent(Type type)
        {
            // Panels own their contents, so another supported shape must not override their row kind.
            if (IsPanel(type))
                return new RowComponent { Name = type.Name, Type = type, Kind = RowKind.Panel, Suffix = "Panel", TargetField = PanelField };
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

        private static bool IsPanel(Type component)
        {
            return component.GetField(PanelField, BindingFlags.Instance | BindingFlags.NonPublic)
                ?.FieldType == typeof(RectTransform);
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

        private static bool ReportsFailure(Type component)
        {
            return component.GetProperty("OnFailed")?.PropertyType == typeof(ErrorEvent);
        }

        private static bool IsLabel(Type component)
        {
            return component.GetProperty("OnUpdate")?.PropertyType == typeof(UnityEvent<string>);
        }

        // A reading names what the gauge number means; the fill alone may describe a different quantity.
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

        // Never target the toggle's own root: disabling it unsubscribes the component and freezes its last state.
        private static void WireToggles(
            string sectionId, GameObject root, IReadOnlyList<ToggleComponent> toggles,
            Transform body, SectionSpec section)
        {
            foreach (var toggle in toggles)
            {
                if (!section.Toggles.TryGetValue(toggle.Name, out var declared) ||
                    declared.Length == 0)
                {
                    Debug.LogWarning(
                        $"[showroom] {sectionId}: '{toggle.Name}' governs no rows in this " +
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
                        $"[showroom] {sectionId}: none of '{string.Join("|", declared)}' is a row " +
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
                        $"[showroom] {sectionId}: no Selectable under " +
                        $"'{string.Join("|", declared)}' for '{toggle.Name}'");
                    continue;
                }

                var component = root.AddComponent(toggle.Type);
                var serialized = new SerializedObject(component);
                var arm = serialized.FindProperty(toggle.ArmField);
                arm.arraySize = targets.Count;
                for (var i = 0; i < targets.Count; i++)
                {
                    arm.GetArrayElementAtIndex(i).objectReferenceValue = targets[i];
                }
                serialized.ApplyModifiedPropertiesWithoutUndo();
                EditorUtility.SetDirty(component);

                if (toggle.Hides) HideUntilTheModelSaysOtherwise(targets);
            }
        }

        // Before the first model update, visible condition arms can make contradictory claims.
        // Bake active-toggle rows hidden until their condition is known; failed binding leaves them hidden.
        private static void HideUntilTheModelSaysOtherwise(IEnumerable<UnityEngine.Object> rows)
        {
            foreach (var row in rows)
            {
                var target = (GameObject)row;
                target.SetActive(false);
                EditorUtility.SetDirty(target);
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

            // Report failures on the page so a refused action does not look like an unresponsive button.
            var failed = (ErrorEvent)button.Type.GetProperty("OnFailed").GetValue(action);
            UnityEventTools.AddPersistentListener(
                failed,
                (UnityAction<Gs2Exception, Func<IEnumerator>>)Delegate.CreateDelegate(
                    typeof(UnityAction<Gs2Exception, Func<IEnumerator>>), page, "LogError"));
            EditorUtility.SetDirty(action);
        }

        private static void AddPanelRow(Transform section, RowComponent panel)
        {
            var row = new GameObject(panel.Name, typeof(RectTransform));
            row.transform.SetParent(section, false);
            var layout = row.AddComponent<VerticalLayoutGroup>();
            layout.spacing = 12;
            layout.childControlWidth = true;
            layout.childControlHeight = true;
            layout.childForceExpandWidth = true;
            layout.childForceExpandHeight = false;

            var component = row.AddComponent(panel.Type);
            var serialized = new SerializedObject(component);
            serialized.FindProperty(panel.TargetField).objectReferenceValue = row.GetComponent<RectTransform>();

            var buttonTemplate = serialized.FindProperty(PanelButtonTemplateField);
            if (buttonTemplate != null)
            {
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(ActionRowPrefabPath);
                buttonTemplate.objectReferenceValue = prefab.transform.Find("Button").GetComponent<Button>();
            }
            var font = serialized.FindProperty(PanelFontField);
            if (font != null)
            {
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(ValueRowPrefabPath);
                font.objectReferenceValue = prefab.transform.Find("Value").GetComponent<Text>().font;
            }
            serialized.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(component);
        }

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

        // Use the declared model prefix even for demo-written components outside the generated namespace.
        // Remove only the suffix supplied by the component kind, preserving the rest of its reading name.
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
