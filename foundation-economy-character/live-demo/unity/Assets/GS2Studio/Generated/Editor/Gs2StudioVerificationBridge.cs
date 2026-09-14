#if UNITY_EDITOR
using System;
using System.IO;

using UnityEditor;
using UnityEditor.Compilation;
using UnityEngine;

namespace GS2Studio.Generated.Runtime
{
    [InitializeOnLoad]
    internal static class Gs2StudioVerificationBridge
    {
        private const string RequestPath = "ProjectSettings/GS2StudioVerification.json";
        private const string ReceiptDirectory = "Library/GS2Studio";
        private const string ReceiptPath = ReceiptDirectory + "/verification-result.json";
        private const double RequestPollIntervalSeconds = 0.5d;
        private const int MessageLimit = 4096;

        private static VerificationRequest currentRequest;
        private static string currentRequestKey = string.Empty;
        private static double nextRequestPollAt;
        private static bool compilationFailed;
        private static bool playModeFailed;
        private static string failureMessage = string.Empty;

        static Gs2StudioVerificationBridge()
        {
            CompilationPipeline.compilationStarted += OnCompilationStarted;
            CompilationPipeline.assemblyCompilationFinished += OnAssemblyCompilationFinished;
            CompilationPipeline.compilationFinished += OnCompilationFinished;
            EditorApplication.playModeStateChanged += OnPlayModeStateChanged;
            EditorApplication.update += OnEditorUpdate;
            Application.logMessageReceived += OnLogMessageReceived;
            EditorApplication.delayCall += InitializeFromDisk;
        }

        private static void InitializeFromDisk()
        {
            VerificationRequest request = ReadRequest();
            if (request == null)
            {
                return;
            }

            currentRequest = request;
            currentRequestKey = RequestKey(request);
            VerificationReceipt receipt = ReadReceipt();
            if (!MatchesCurrentRequest(receipt))
            {
                WriteReceipt("resolvingPackages", false, false, string.Empty);
                EditorApplication.delayCall += AdvanceAfterResolution;
                return;
            }

            if (EditorApplication.isCompiling)
            {
                WriteReceipt("compiling", false, false, string.Empty);
            }
            else if (EditorApplication.isPlayingOrWillChangePlaymode)
            {
                WriteReceipt("runningPlayMode", true, false, string.Empty);
            }
            else if (receipt.phase != "completed" && receipt.phase != "failed")
            {
                WriteReceipt("awaitingPlayMode", true, false, string.Empty);
            }
        }

        private static void OnEditorUpdate()
        {
            if (EditorApplication.timeSinceStartup < nextRequestPollAt)
            {
                return;
            }

            nextRequestPollAt = EditorApplication.timeSinceStartup + RequestPollIntervalSeconds;
            VerificationRequest request = ReadRequest();
            if (request == null)
            {
                return;
            }

            string requestKey = RequestKey(request);
            if (requestKey == currentRequestKey)
            {
                currentRequest = request;
                return;
            }

            currentRequest = request;
            currentRequestKey = requestKey;
            compilationFailed = false;
            playModeFailed = false;
            failureMessage = string.Empty;
            WriteReceipt("resolvingPackages", false, false, string.Empty);
            EditorApplication.delayCall += AdvanceAfterResolution;
        }

        private static void AdvanceAfterResolution()
        {
            if (currentRequest == null)
            {
                return;
            }

            if (EditorApplication.isCompiling)
            {
                WriteReceipt("compiling", false, false, string.Empty);
                return;
            }

            if (EditorApplication.isPlayingOrWillChangePlaymode)
            {
                WriteReceipt("runningPlayMode", true, false, string.Empty);
                return;
            }

            WriteReceipt("awaitingPlayMode", true, false, string.Empty);
        }

        private static void OnCompilationStarted(object _)
        {
            RefreshCurrentRequest();
            if (currentRequest == null)
            {
                return;
            }

            compilationFailed = false;
            failureMessage = string.Empty;
            WriteReceipt("compiling", false, false, string.Empty);
        }

        private static void OnAssemblyCompilationFinished(string _, CompilerMessage[] messages)
        {
            if (currentRequest == null)
            {
                return;
            }

            for (int index = 0; index < messages.Length; index += 1)
            {
                CompilerMessage message = messages[index];
                if (message.type != CompilerMessageType.Error)
                {
                    continue;
                }

                compilationFailed = true;
                failureMessage = LimitMessage(message.message);
                break;
            }
        }

        private static void OnCompilationFinished(object _)
        {
            RefreshCurrentRequest();
            if (currentRequest == null)
            {
                return;
            }

            WriteReceipt(
                compilationFailed ? "failed" : "awaitingPlayMode",
                !compilationFailed,
                false,
                failureMessage
            );
        }

        private static void OnPlayModeStateChanged(PlayModeStateChange state)
        {
            RefreshCurrentRequest();
            if (currentRequest == null)
            {
                return;
            }

            if (state == PlayModeStateChange.ExitingEditMode)
            {
                playModeFailed = false;
                failureMessage = string.Empty;
                WriteReceipt("runningPlayMode", true, false, string.Empty);
                return;
            }

            if (state == PlayModeStateChange.EnteredPlayMode)
            {
                WriteReceipt("runningPlayMode", true, false, string.Empty);
                return;
            }

            if (state == PlayModeStateChange.ExitingPlayMode)
            {
                WriteReceipt(
                    playModeFailed ? "failed" : "completed",
                    true,
                    !playModeFailed,
                    failureMessage
                );
            }
        }

        private static void OnLogMessageReceived(string condition, string _, LogType type)
        {
            if (!EditorApplication.isPlaying || currentRequest == null)
            {
                return;
            }

            if (type != LogType.Error && type != LogType.Assert && type != LogType.Exception)
            {
                return;
            }

            playModeFailed = true;
            failureMessage = LimitMessage(condition);
        }

        private static void RefreshCurrentRequest()
        {
            VerificationRequest request = ReadRequest();
            if (request == null)
            {
                return;
            }

            currentRequest = request;
            currentRequestKey = RequestKey(request);
        }

        private static VerificationRequest ReadRequest()
        {
            try
            {
                if (!File.Exists(RequestPath))
                {
                    return null;
                }

                VerificationRequest request = JsonUtility.FromJson<VerificationRequest>(
                    File.ReadAllText(RequestPath)
                );
                if (
                    request == null ||
                    request.schemaVersion != 1 ||
                    string.IsNullOrEmpty(request.unityArtifactRevision) ||
                    string.IsNullOrEmpty(request.deploymentArtifactRevision)
                )
                {
                    return null;
                }

                return request;
            }
            catch (Exception)
            {
                return null;
            }
        }

        private static VerificationReceipt ReadReceipt()
        {
            try
            {
                return File.Exists(ReceiptPath)
                    ? JsonUtility.FromJson<VerificationReceipt>(File.ReadAllText(ReceiptPath))
                    : null;
            }
            catch (Exception)
            {
                return null;
            }
        }

        private static bool MatchesCurrentRequest(VerificationReceipt receipt)
        {
            return
                receipt != null &&
                currentRequest != null &&
                receipt.schemaVersion == 1 &&
                receipt.unityArtifactRevision == currentRequest.unityArtifactRevision &&
                receipt.deploymentArtifactRevision == currentRequest.deploymentArtifactRevision;
        }

        private static string RequestKey(VerificationRequest request)
        {
            return request.unityArtifactRevision + "\n" + request.deploymentArtifactRevision;
        }

        private static string LimitMessage(string message)
        {
            if (string.IsNullOrEmpty(message) || message.Length <= MessageLimit)
            {
                return message ?? string.Empty;
            }

            return message.Substring(0, MessageLimit);
        }

        private static void WriteReceipt(
            string phase,
            bool compilationPassed,
            bool playModePassed,
            string message
        )
        {
            if (currentRequest == null)
            {
                return;
            }

            VerificationReceipt receipt = new VerificationReceipt
            {
                schemaVersion = 1,
                unityArtifactRevision = currentRequest.unityArtifactRevision,
                compilationPassed = compilationPassed,
                playModePassed = playModePassed,
                deploymentArtifactRevision = currentRequest.deploymentArtifactRevision,
                verifiedAt = DateTime.UtcNow.ToString("O"),
                phase = phase,
                message = LimitMessage(message),
            };
            string temporaryPath = ReceiptPath + ".tmp";
            try
            {
                Directory.CreateDirectory(ReceiptDirectory);
                File.WriteAllText(temporaryPath, JsonUtility.ToJson(receipt, true) + "\n");
                if (File.Exists(ReceiptPath))
                {
                    File.Replace(temporaryPath, ReceiptPath, null);
                }
                else
                {
                    File.Move(temporaryPath, ReceiptPath);
                }
            }
            catch (Exception error)
            {
                try
                {
                    if (File.Exists(temporaryPath))
                    {
                        File.Delete(temporaryPath);
                    }
                }
                catch (Exception)
                {
                    // Preserve the original write failure.
                }

                Debug.LogWarning("GS2 Studio verification receipt could not be written: " + error.Message);
            }
        }

        [Serializable]
        private sealed class VerificationRequest
        {
            public int schemaVersion;
            public string unityArtifactRevision = string.Empty;
            public string deploymentArtifactRevision = string.Empty;
        }

        [Serializable]
        private sealed class VerificationReceipt
        {
            public int schemaVersion;
            public string unityArtifactRevision = string.Empty;
            public bool compilationPassed;
            public bool playModePassed;
            public string deploymentArtifactRevision = string.Empty;
            public string verifiedAt = string.Empty;
            public string phase = string.Empty;
            public string message = string.Empty;
        }
    }
}
#endif
