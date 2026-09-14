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
        private const string GeneratedNamespacePrefix = "GS2Studio.Generated.";

        /// <summary>
        /// Entry point for `-executeMethod`. Reads `-showroomTitle`,
        /// `-showroomSubtitle` and `-showroomRebuildPage`.
        /// </summary>
        public static void Build()
        {
            try
            {
                var rebuild = ReadArgument("-showroomRebuildPage") == "true";
                var existed = File.Exists(ScenePath);
                if (existed && !rebuild)
                {
                    Debug.Log($"[showroom] {ScenePath} already exists; left alone");
                    EditorApplication.Exit(0);
                    return;
                }

                var scene = OpenOrCreateScene(existed);
                var page = UnityEngine.Object.FindAnyObjectByType<ShowroomPage>();
                if (page == null) throw new InvalidOperationException("no ShowroomPage in the scene");

                ApplyHeader(page, ReadArgument("-showroomTitle"), ReadArgument("-showroomSubtitle"));
                var content = ContentMount(page);
                ClearChildren(content);
                var sections = BuildSections(content, page);

                EditorSceneManager.MarkSceneDirty(scene);
                EditorSceneManager.SaveScene(scene, ScenePath);
                Debug.Log($"[showroom] wrote {ScenePath} with {sections} section(s)");
                EditorApplication.Exit(0);
            }
            catch (Exception exception)
            {
                Debug.LogError($"[showroom] page build threw: {exception}");
                EditorApplication.Exit(1);
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

                placed.Add(section.AddComponent(handler));
                sections.Add((handler, section.transform));

                foreach (var label in labels) AddValueRow(section.transform, label);
                foreach (var button in buttons) AddActionRow(section.transform, button, page);
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

        private static void AddValueRow(Transform section, Type labelType)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(ValueRowPrefabPath);
            var row = (GameObject)PrefabUtility.InstantiatePrefab(prefab, section);
            row.name = labelType.Name;
            SetText(row.transform.Find("Caption"), Humanize(TrimModelPrefix(labelType)));

            var label = row.AddComponent(labelType);
            var value = row.transform.Find("Value").GetComponent<Text>();
            var onUpdate = (UnityEvent<string>)labelType.GetProperty("OnUpdate").GetValue(label);
            UnityEventTools.AddPersistentListener(
                onUpdate,
                (UnityAction<string>)Delegate.CreateDelegate(
                    typeof(UnityAction<string>), value, "set_text"));
            EditorUtility.SetDirty(label);
        }

        private static void AddActionRow(Transform section, Type buttonType, ShowroomPage page)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(ActionRowPrefabPath);
            var row = (GameObject)PrefabUtility.InstantiatePrefab(prefab, section);
            row.name = buttonType.Name;
            SetText(row.transform.Find("Label"), Humanize(TrimModelPrefix(buttonType)));

            var action = row.AddComponent(buttonType);
            var serialized = new SerializedObject(action);
            serialized.FindProperty("_button").objectReferenceValue = row.GetComponent<Button>();
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
