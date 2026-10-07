// Reload after an account switch: existing binders remain subscribed as the old account.
#nullable disable
#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif
using UnityEngine;

namespace GS2Studio.Showroom
{
    public static class ShowroomReload
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void ShowroomReload_Reload();
#endif

        // Reloading only the scene would sign in beside a GS2 client holding the old session.
        // Outside the browser, require a Play Mode restart instead.
        public static void Reload()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            ShowroomReload_Reload();
#else
            Debug.LogWarning("ShowroomReload: there is no browser page to reload here; restart Play Mode to sign in as the remembered account.");
#endif
        }
    }
}
