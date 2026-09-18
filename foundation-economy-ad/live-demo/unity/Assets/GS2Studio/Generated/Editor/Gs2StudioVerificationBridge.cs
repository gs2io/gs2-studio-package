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

        private static VerificationRequestState currentRequestState;
        private static double nextRequestPollAt;

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
            VerificationReceipt receipt = ReadReceipt();
            VerificationRequest request = ReadRequest();
            if (request == null)
            {
                return;
            }

            bool requestChanged = AdoptRequest(request);
            VerificationRequestState requestState = currentRequestState;
            if (requestChanged && !MatchesCurrentRequest(receipt, requestState))
            {
                BeginRequest(requestState);
                return;
            }

            if (!MatchesCurrentRequest(receipt, requestState))
            {
                WriteReceipt(requestState, VerificationPhase.ResolvingPackages, string.Empty);
                EditorApplication.delayCall += () => AdvanceAfterResolution(requestState);
                return;
            }

            if (EditorApplication.isCompiling)
            {
                WriteReceipt(requestState, VerificationPhase.Compiling, string.Empty);
            }
            else if (EditorApplication.isPlayingOrWillChangePlaymode)
            {
                WriteReceipt(requestState, VerificationPhase.RunningPlayMode, string.Empty);
            }
            else if (receipt.phase != "completed" && receipt.phase != "failed")
            {
                WriteReceipt(requestState, VerificationPhase.AwaitingPlayMode, string.Empty);
            }
        }

        private static void OnEditorUpdate()
        {
            if (EditorApplication.timeSinceStartup < nextRequestPollAt)
            {
                return;
            }

            nextRequestPollAt = EditorApplication.timeSinceStartup + RequestPollIntervalSeconds;
            VerificationRequestState requestState = ReadAndAdoptRequest(out bool requestChanged);
            if (requestState == null)
            {
                return;
            }

            if (!requestChanged)
            {
                return;
            }

            BeginRequest(requestState);
        }

        private static void BeginRequest(VerificationRequestState requestState)
        {
            if (EditorApplication.isPlaying)
            {
                requestState.playModeNeedsRestart = true;
                SchedulePlayModeRestart(requestState);
            }

            if (EditorApplication.isCompiling)
            {
                requestState.compilationAwaitingBoundary = true;
            }

            WriteReceipt(requestState, VerificationPhase.ResolvingPackages, string.Empty);
            EditorApplication.delayCall += () => AdvanceAfterResolution(requestState);
        }

        private static void AdvanceAfterResolution(VerificationRequestState requestState)
        {
            VerificationRequestState currentState = ReadAndAdoptRequest(out bool requestChanged);
            if (
                currentState == null ||
                !ReferenceEquals(currentState, requestState)
            )
            {
                if (requestChanged && currentState != null)
                {
                    BeginRequest(currentState);
                }
                return;
            }

            if (EditorApplication.isCompiling)
            {
                WriteReceipt(requestState, VerificationPhase.Compiling, string.Empty);
                requestState.compilationAwaitingBoundary = true;
                return;
            }

            if (requestState.compilationAwaitingBoundary)
            {
                requestState.compilationAwaitingBoundary = false;
                RequestScriptCompilationForCurrentRequest(requestState);
                return;
            }

            if (EditorApplication.isPlayingOrWillChangePlaymode)
            {
                WriteReceipt(
                    requestState,
                    requestState.playModeNeedsRestart
                        ? VerificationPhase.AwaitingPlayMode
                        : VerificationPhase.RunningPlayMode,
                    string.Empty
                );
                return;
            }

            WriteReceipt(requestState, VerificationPhase.AwaitingPlayMode, string.Empty);
        }

        // The callback argument is named rather than discarded: a parameter
        // called `_` is a variable, not a discard, so `out _` below would try
        // to assign an `object` where a `bool` is wanted and fail to compile.
        private static void OnCompilationStarted(object compilationContext)
        {
            VerificationRequestState requestState = ReadAndAdoptRequest(out _);
            if (requestState == null)
            {
                return;
            }

            // A compilation-start callback is the boundary that owns this
            // revision, including when polling observed the request just now.
            // Later callbacks must use this same state or be discarded.
            requestState.compilationAwaitingBoundary = false;
            requestState.compilationRecompileRequested = false;
            requestState.compilationInProgress = true;
            requestState.compilationFailed = false;
            requestState.failureMessage = string.Empty;
            WriteReceipt(requestState, VerificationPhase.Compiling, string.Empty);
        }

        private static void OnAssemblyCompilationFinished(string _, CompilerMessage[] messages)
        {
            VerificationRequestState requestState = ReadAndAdoptRequest(out bool requestChanged);
            if (requestState == null)
            {
                return;
            }

            if (requestChanged)
            {
                requestState.compilationAwaitingBoundary = true;
                BeginRequest(requestState);
                return;
            }

            if (!requestState.compilationInProgress)
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

                requestState.compilationFailed = true;
                requestState.failureMessage = LimitMessage(message.message);
                break;
            }
        }

        private static void OnCompilationFinished(object _)
        {
            VerificationRequestState requestState = ReadAndAdoptRequest(out bool requestChanged);
            if (requestState == null)
            {
                return;
            }

            if (requestChanged)
            {
                requestState.compilationAwaitingBoundary = true;
                BeginRequest(requestState);
                return;
            }

            if (!requestState.compilationInProgress)
            {
                if (requestState.compilationAwaitingBoundary)
                {
                    requestState.compilationAwaitingBoundary = false;
                    RequestScriptCompilationForCurrentRequest(requestState);
                }
                return;
            }

            requestState.compilationInProgress = false;
            WriteReceipt(
                requestState,
                requestState.compilationFailed
                    ? VerificationPhase.CompilationFailed
                    : VerificationPhase.AwaitingPlayMode,
                requestState.failureMessage
            );
        }

        private static void OnPlayModeStateChanged(PlayModeStateChange state)
        {
            VerificationRequestState requestState = ReadAndAdoptRequest(out bool requestChanged);
            if (requestState == null)
            {
                return;
            }

            if (requestChanged)
            {
                if (
                    state == PlayModeStateChange.ExitingEditMode ||
                    state == PlayModeStateChange.EnteredPlayMode
                )
                {
                    if (requestState.playModeNeedsRestart || requestState.playModeRestartScheduled)
                    {
                        SchedulePlayModeRestart(requestState);
                        return;
                    }

                    StartPlayMode(requestState);
                    return;
                }

                requestState.playModeNeedsRestart = true;
                BeginRequest(requestState);
                SchedulePlayModeRestart(requestState);
                return;
            }

            if (state == PlayModeStateChange.ExitingEditMode)
            {
                StartPlayMode(requestState);
                return;
            }

            if (state == PlayModeStateChange.EnteredPlayMode)
            {
                StartPlayMode(requestState);
                return;
            }

            if (state == PlayModeStateChange.ExitingPlayMode)
            {
                if (!requestState.playModeInProgress)
                {
                    if (requestState.playModeNeedsRestart)
                    {
                        requestState.playModeNeedsRestart = false;
                        WriteReceipt(requestState, VerificationPhase.AwaitingPlayMode, string.Empty);
                        SchedulePlayModeRestart(requestState);
                    }
                    return;
                }

                requestState.playModeInProgress = false;
                WriteReceipt(
                    requestState,
                    requestState.playModeFailed
                        ? VerificationPhase.PlayModeFailed
                        : VerificationPhase.Completed,
                    requestState.failureMessage
                );
            }
        }

        private static void OnLogMessageReceived(string condition, string _, LogType type)
        {
            if (!EditorApplication.isPlaying)
            {
                return;
            }

            VerificationRequestState requestState = ReadAndAdoptRequest(out bool requestChanged);
            if (requestState == null)
            {
                return;
            }

            if (requestChanged)
            {
                requestState.playModeNeedsRestart = true;
                BeginRequest(requestState);
                return;
            }

            if (type != LogType.Error && type != LogType.Assert && type != LogType.Exception)
            {
                return;
            }

            if (!requestState.playModeInProgress)
            {
                return;
            }

            requestState.playModeFailed = true;
            requestState.failureMessage = LimitMessage(condition);
        }

        private static VerificationRequestState ReadAndAdoptRequest(out bool requestChanged)
        {
            VerificationRequest request = ReadRequest();
            if (request == null)
            {
                requestChanged = false;
                return null;
            }

            requestChanged = AdoptRequest(request);
            return currentRequestState;
        }

        private static void SchedulePlayModeRestart(VerificationRequestState requestState)
        {
            if (requestState.playModeRestartScheduled)
            {
                return;
            }

            requestState.playModeRestartScheduled = true;
            EditorApplication.delayCall += () => RestartPlayMode(requestState);
        }

        private static void RestartPlayMode(VerificationRequestState requestState)
        {
            VerificationRequestState currentState = ReadAndAdoptRequest(out _);
            requestState.playModeRestartScheduled = false;
            if (currentState == null || !ReferenceEquals(currentState, requestState))
            {
                // The callback belongs to an abandoned state. A transferred
                // scheduled flag is not the callback currently executing, so
                // always create a fresh reservation for the adopted state.
                if (currentState != null)
                {
                    currentState.playModeNeedsRestart = true;
                    currentState.playModeRestartScheduled = false;
                    BeginRequest(currentState);
                    SchedulePlayModeRestart(currentState);
                }
                return;
            }

            if (EditorApplication.isCompiling || EditorApplication.isPlayingOrWillChangePlaymode)
            {
                SchedulePlayModeRestart(requestState);
                return;
            }

            requestState.playModeNeedsRestart = false;
            EditorApplication.isPlaying = true;
        }

        private static void StartPlayMode(VerificationRequestState requestState)
        {
            requestState.playModeNeedsRestart = false;
            requestState.playModeRestartScheduled = false;
            requestState.playModeInProgress = true;
            requestState.playModeFailed = false;
            requestState.failureMessage = string.Empty;
            WriteReceipt(requestState, VerificationPhase.RunningPlayMode, string.Empty);
        }

        private static void RequestScriptCompilationForCurrentRequest(
            VerificationRequestState requestState
        )
        {
            if (
                !ReferenceEquals(currentRequestState, requestState) ||
                requestState.compilationInProgress ||
                requestState.compilationRecompileRequested
            )
            {
                return;
            }

            requestState.compilationRecompileRequested = true;
            WriteReceipt(requestState, VerificationPhase.Compiling, string.Empty);
            CompilationPipeline.RequestScriptCompilation();
        }

        private static bool AdoptRequest(VerificationRequest request)
        {
            string requestKey = RequestKey(request);
            if (currentRequestState != null && currentRequestState.key == requestKey)
            {
                return false;
            }

            bool previousPlayModeRequiresRestart =
                currentRequestState != null &&
                (currentRequestState.playModeInProgress ||
                    currentRequestState.playModeNeedsRestart ||
                    currentRequestState.playModeRestartScheduled);
            bool previousPlayModeRestartScheduled =
                currentRequestState != null && currentRequestState.playModeRestartScheduled;
            currentRequestState = new VerificationRequestState(request, requestKey)
            {
                playModeNeedsRestart = previousPlayModeRequiresRestart,
                playModeRestartScheduled = previousPlayModeRestartScheduled,
            };
            return true;
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

        private static bool MatchesCurrentRequest(
            VerificationReceipt receipt,
            VerificationRequestState requestState
        )
        {
            return
                receipt != null &&
                requestState != null &&
                receipt.schemaVersion == 1 &&
                receipt.unityArtifactRevision == requestState.request.unityArtifactRevision &&
                receipt.deploymentArtifactRevision == requestState.request.deploymentArtifactRevision;
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
            VerificationRequestState requestState,
            VerificationPhase phase,
            string message
        )
        {
            if (!ReferenceEquals(currentRequestState, requestState))
            {
                return;
            }

            bool compilationPassed;
            bool playModePassed;
            string receiptPhase;
            switch (phase)
            {
                case VerificationPhase.ResolvingPackages:
                    receiptPhase = "resolvingPackages";
                    compilationPassed = false;
                    playModePassed = false;
                    break;
                case VerificationPhase.Compiling:
                    receiptPhase = "compiling";
                    compilationPassed = false;
                    playModePassed = false;
                    break;
                case VerificationPhase.AwaitingPlayMode:
                    receiptPhase = "awaitingPlayMode";
                    compilationPassed = true;
                    playModePassed = false;
                    break;
                case VerificationPhase.RunningPlayMode:
                    receiptPhase = "runningPlayMode";
                    compilationPassed = true;
                    playModePassed = false;
                    break;
                case VerificationPhase.Completed:
                    receiptPhase = "completed";
                    compilationPassed = true;
                    playModePassed = true;
                    break;
                case VerificationPhase.CompilationFailed:
                    receiptPhase = "failed";
                    compilationPassed = false;
                    playModePassed = false;
                    break;
                case VerificationPhase.PlayModeFailed:
                    receiptPhase = "failed";
                    compilationPassed = true;
                    playModePassed = false;
                    break;
                default:
                    throw new ArgumentOutOfRangeException("phase", phase, "Unknown verification phase");
            }

            VerificationReceipt receipt = new VerificationReceipt
            {
                schemaVersion = 1,
                unityArtifactRevision = requestState.request.unityArtifactRevision,
                compilationPassed = compilationPassed,
                playModePassed = playModePassed,
                deploymentArtifactRevision = requestState.request.deploymentArtifactRevision,
                verifiedAt = DateTime.UtcNow.ToString("O"),
                phase = receiptPhase,
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

        private enum VerificationPhase
        {
            ResolvingPackages,
            Compiling,
            AwaitingPlayMode,
            RunningPlayMode,
            Completed,
            CompilationFailed,
            PlayModeFailed,
        }

        private sealed class VerificationRequestState
        {
            public readonly VerificationRequest request;
            public readonly string key;
            public bool compilationAwaitingBoundary;
            public bool compilationInProgress;
            public bool compilationRecompileRequested;
            public bool compilationFailed;
            public bool playModeInProgress;
            public bool playModeNeedsRestart;
            public bool playModeRestartScheduled;
            public bool playModeFailed;
            public string failureMessage = string.Empty;

            public VerificationRequestState(VerificationRequest request, string key)
            {
                this.request = request;
                this.key = key;
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
