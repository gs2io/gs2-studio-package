// Starting the page over.
//
// A demo that switches the visitor to another account (taking over the one a
// different browser made) remembers the new credentials and then reloads,
// rather than signing in again in place: every binder on the page is
// subscribed as the old account, and a fresh page is the one state in which
// none of them is. The saved account lives in the origin's localStorage, whose
// writes are synchronous, so the next page reads what was remembered here.
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

        /// <summary>
        /// Reloads the browser page. Outside a WebGL player there is no page to
        /// reload. Loading the scene again is not offered in its place, because
        /// it would re-run the sign-in beside a GS2 client that already holds
        /// the old session; the run is left as it is and says so.
        /// </summary>
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
