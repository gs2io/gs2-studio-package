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
        private const string GeneratedPrefabDirectory = "Assets/Showroom/Generated";
        private const string GeneratedNamespacePrefix = "GS2Studio.Generated.";

        /// <summary>
        /// Entry point for `-executeMethod`. Reads `-showroomTitle`,
        /// `-showroomSubtitle` and `-showroomRebuildPage`, and owns the exit
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
                    ReadArgument("-showroomRebuildPage") == "true");
                EditorApplication.Exit(0);
            }
            catch (Exception exception)
            {
                Debug.LogError($"[showroom] page build threw: {exception}");
                EditorApplication.Exit(1);
            }
        }

        /// <summary>
        /// Writes the demo's page. Returns the number of sections, or -1 when
        /// the scene already existed and was left alone.
        /// </summary>
        public static int BuildPage(string title, string subtitle, bool rebuild)
        {
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
            var sections = BuildSections(content, page);

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

        /// <summary>UI components the same package generated for this handler.</summary>
        private static IReadOnlyList<Type> UiComponentsFor(Type handler, string eventPropertyName)
        {
            var uiNamespace = handler.Namespace + ".UI";
            return SafeTypes(handler.Assembly)
                .Where(type =>
                    type.IsClass && !type.IsAbstract && type.Namespace == uiNamespace &&
                    type.GetProperty(eventPropertyName) != null)
                .OrderBy(type => type.Name, StringComparer.Ordinal)
                .ToList();
        }

        private static int BuildSections(Transform content, ShowroomPage page)
        {
            var sectionPrefab = AssetDatabase.LoadAssetAtPath<GameObject>(SectionPrefabPath);
            var handlers = GeneratedHandlers();
            // Every handler answers a completed action, because an action can
            // change anything the page is showing and a handler has no other
            // way to hear about it.
            var placed = new List<Component>();
            var sections = new List<(Type Handler, Transform Body)>();

            foreach (var handler in handlers)
            {
                var labels = UiComponentsFor(handler, "OnUpdate");
                var buttons = UiComponentsFor(handler, "OnCompleted");
                if (labels.Count == 0 && buttons.Count == 0) continue;

                var section = (GameObject)PrefabUtility.InstantiatePrefab(sectionPrefab, content);
                section.name = ModelNameOf(handler);
                SetText(section.transform.Find("Heading"), Humanize(ModelNameOf(handler)));
                var explainer = section.transform.Find("Explainer");
                // Nothing here knows what to say about the model; a demo author
                // writes it, and an empty line of placeholder prose is worse
                // than none.
                if (explainer != null) explainer.gameObject.SetActive(false);
                sections.Add((handler, section.transform));

                // A handler whose `SetKeys` takes arguments cannot stand on its
                // own: it would sit in the page with an empty id, bind nothing
                // and render a row of blanks. A keyed model is a set of rows,
                // so its list handler shows them and each row carries its own
                // copy of the components.
                if (NeedsIdentityKeys(handler))
                {
                    AddList(section, handler, labels, buttons, page);
                    continue;
                }

                placed.Add(section.AddComponent(handler));
                AddRows(ItemsOf(section.transform), labels, buttons, page);
            }

            foreach (var (_, body) in sections)
            {
                foreach (var button in body.GetComponentsInChildren<MonoBehaviour>(true))
                {
                    var completed = button.GetType().GetProperty("OnCompleted");
                    if (completed == null) continue;
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
            IReadOnlyList<Type> buttons, ShowroomPage page)
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

            var itemPrefab = BuildListItemPrefab(model, itemHandler, labels, buttons, page);
            var list = section.AddComponent(listHandler);
            var serialized = new SerializedObject(list);
            serialized.FindProperty("_itemPrefab").objectReferenceValue =
                itemPrefab.GetComponent(itemHandler);
            serialized.FindProperty("_contentParent").objectReferenceValue = ItemsOf(section.transform);
            // What the player has, not what the catalogue offers. A row mounted
            // from master data has no user-data key, so reading its per-player
            // state asks the server for `property/null` and is answered with a
            // 400 — a page of rows that cannot say anything about themselves.
            //
            // A model with no user data at all is generated without the choice,
            // and then the catalogue is the only thing there is to list.
            var source = serialized.FindProperty("_source");
            if (source != null) source.enumValueIndex = UserDataSourceIndex(listHandler);
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        /// <summary>
        /// The list handler's `Source.UserData` ordinal, read from the enum the
        /// generator emitted rather than assumed, so a reordering there cannot
        /// silently point every demo at the wrong source.
        /// </summary>
        private static int UserDataSourceIndex(Type listHandler)
        {
            var sourceEnum = listHandler.GetNestedType("Source");
            if (sourceEnum == null) return 0;
            var names = Enum.GetNames(sourceEnum);
            var index = Array.IndexOf(names, "UserData");
            return index < 0 ? 0 : index;
        }

        private static GameObject BuildListItemPrefab(
            string model, Type itemHandler, IReadOnlyList<Type> labels,
            IReadOnlyList<Type> buttons, ShowroomPage page)
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
            AddRows(ItemsOf(item.transform), labels, buttons, page);

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
        /// Lays out one model's rows.
        ///
        /// A single value with a single action is one thing a visitor does, so
        /// it reads as one line — what it is on the left, the button on the
        /// right. Anything else is a stat block with its actions under it.
        /// </summary>
        private static void AddRows(
            Transform body, IReadOnlyList<Type> labels, IReadOnlyList<Type> buttons,
            ShowroomPage page)
        {
            if (labels.Count == 1 && buttons.Count == 1)
            {
                AddActionRow(body, buttons[0], page, labels[0]);
                return;
            }
            foreach (var label in labels) AddValueRow(body, label);
            foreach (var button in buttons) AddActionRow(body, button, page, null);
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

        /// <summary>`WalletFreeBalanceLabel` -> `FreeBalance`.</summary>
        private static string TrimModelPrefix(Type uiComponent)
        {
            var model = (uiComponent.Namespace ?? "")
                .Replace(GeneratedNamespacePrefix, "").Replace(".UI", "");
            var name = uiComponent.Name;
            if (name.StartsWith(model)) name = name.Substring(model.Length);
            foreach (var suffix in new[] { "Label", "Button" })
                if (name.EndsWith(suffix) && name.Length > suffix.Length)
                    name = name.Substring(0, name.Length - suffix.Length);
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
