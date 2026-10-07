// Reload after account changes because existing binders remain subscribed to the previous account.
mergeInto(LibraryManager.library, {
  ShowroomReload_Reload: function () {
    window.location.reload();
  },
});
