// Reloads the page the player runs in.
//
// A demo that changes which account the visitor is (taking over another
// browser's account) starts over from a fresh page rather than re-signing in
// place: every binder on the page is subscribed as the old account, and a new
// page is the one state in which nothing still is.
mergeInto(LibraryManager.library, {
  ShowroomReload_Reload: function () {
    window.location.reload();
  },
});
