// Batch-mode WebGL build entry point for a showroom demo.
//
//   Unity -batchmode -quit -projectPath <project> \
//     -executeMethod GS2Studio.Showroom.EditorTools.ShowroomBuilder.BuildWebGL \
//     -showroomOutput <directory> [-showroomCompression Brotli|Gzip|Disabled]
#nullable disable
using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace GS2Studio.Showroom.EditorTools
{
    public static class ShowroomBuilder
    {
        private const string ScenePath = "Assets/Scenes/Showroom.unity";

        public static void BuildWebGL()
        {
            try
            {
                var outputDirectory = ReadArgument("-showroomOutput") ?? "Build/WebGL";
                var compression = ReadArgument("-showroomCompression") ?? "Disabled";
                var diagnostics = ReadArgument("-showroomDiagnostics") == "true";

                EnsureScene();
                ConfigurePlayer(compression, diagnostics);

                var options = new BuildPlayerOptions
                {
                    scenes = new[] { ScenePath },
                    locationPathName = outputDirectory,
                    target = BuildTarget.WebGL,
                    targetGroup = BuildTargetGroup.WebGL,
                    options = BuildOptions.None,
                };
                var report = BuildPipeline.BuildPlayer(options);
                var summary = report.summary;
                Debug.Log(
                    $"[showroom] build {summary.result} size={summary.totalSize} time={summary.totalTime}"
                );
                if (summary.result != BuildResult.Succeeded)
                {
                    var errors = report.steps
                        .SelectMany(step => step.messages)
                        .Where(message => message.type == LogType.Error || message.type == LogType.Exception)
                        .Select(message => message.content)
                        .Take(20);
                    foreach (var error in errors) Debug.LogError($"[showroom] {error}");
                    EditorApplication.Exit(1);
                    return;
                }
                EditorApplication.Exit(0);
            }
            catch (Exception exception)
            {
                Debug.LogError($"[showroom] build threw: {exception}");
                EditorApplication.Exit(1);
            }
        }

        private static void ConfigurePlayer(string compression, bool diagnostics)
        {
            PlayerSettings.companyName = "Game Server Services";
            // The demo's own name, taken from the project rather than a
            // generated constant: the title a visitor reads is a Text in the
            // scene, and the player name follows the project directory.
            PlayerSettings.productName = new DirectoryInfo(
                Path.GetDirectoryName(Application.dataPath) ?? "Showroom"
            ).Parent?.Name ?? "Showroom";
            PlayerSettings.WebGL.compressionFormat = ParseCompression(compression);
            // Off on purpose: with the fallback on, Unity names the payloads
            // `.unityweb` and expects the browser to decompress them in
            // JavaScript. Off, they are named `.br` / `.gz`, which is what
            // `publish.mjs` matches when it sets `Content-Encoding` on the
            // bucket — the browser then decompresses natively.
            PlayerSettings.WebGL.decompressionFallback = false;
            PlayerSettings.WebGL.dataCaching = true;
            // A diagnostic build keeps managed symbols so a stack trace names the
            // method that threw; the shipping build stays lean.
            PlayerSettings.WebGL.exceptionSupport = diagnostics
                ? WebGLExceptionSupport.FullWithStacktrace
                : WebGLExceptionSupport.ExplicitlyThrownExceptionsOnly;
            PlayerSettings.WebGL.debugSymbolMode = diagnostics
                ? WebGLDebugSymbolMode.Embedded
                : WebGLDebugSymbolMode.Off;
            PlayerSettings.WebGL.linkerTarget = WebGLLinkerTarget.Wasm;
            // A project template without the Unity footer bar: the demo is embedded in
            // a page of its own, so the player fills the frame.
            PlayerSettings.WebGL.template = "PROJECT:Showroom";
            PlayerSettings.stripEngineCode = !diagnostics;
            PlayerSettings.SetManagedStrippingLevel(
                NamedBuildTarget.WebGL,
                diagnostics ? ManagedStrippingLevel.Disabled : ManagedStrippingLevel.Minimal
            );
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.WebGL, ScriptingImplementation.IL2CPP);
            PlayerSettings.SetApiCompatibilityLevel(NamedBuildTarget.WebGL, ApiCompatibilityLevel.NET_Standard);
            PlayerSettings.runInBackground = true;
            PlayerSettings.SplashScreen.show = false;
            PlayerSettings.SplashScreen.showUnityLogo = false;
            // Keep the define set empty and reproducible. UNITY_INCLUDE_TESTS in
            // particular must stay undefined: it pulls editor-only AssetDatabase
            // calls in the GS2 Unity SDK into the player build.
            PlayerSettings.SetScriptingDefineSymbols(NamedBuildTarget.WebGL, new string[0]);
        }

        private static WebGLCompressionFormat ParseCompression(string compression)
        {
            switch (compression)
            {
                case "Brotli":
                    return WebGLCompressionFormat.Brotli;
                case "Gzip":
                    return WebGLCompressionFormat.Gzip;
                default:
                    return WebGLCompressionFormat.Disabled;
            }
        }

        /// <summary>The demo builds its own interface, so the scene only has to exist.</summary>
        private static void EnsureScene()
        {
            if (File.Exists(ScenePath)) return;
            Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            EditorSceneManager.SaveScene(scene, ScenePath);
            AssetDatabase.Refresh();
        }

        private static string ReadArgument(string name)
        {
            var arguments = Environment.GetCommandLineArgs();
            for (var index = 0; index < arguments.Length - 1; index += 1)
            {
                if (arguments[index] == name) return arguments[index + 1];
            }
            return null;
        }
    }
}
