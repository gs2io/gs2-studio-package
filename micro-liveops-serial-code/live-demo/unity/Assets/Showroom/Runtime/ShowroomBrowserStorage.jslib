// Use origin-scoped storage so sibling demos can share the visitor account.
// Synchronous writes must complete before an account-change reload.
// Report storage failures through the native return contract so browser exceptions do not escape into the player.
mergeInto(LibraryManager.library, {
  ShowroomBrowserStorage_Get: function (keyPointer) {
    var value;
    try {
      value = window.localStorage.getItem(UTF8ToString(keyPointer));
    } catch (error) {
      return 0;
    }
    if (value === null) return 0;
    var size = lengthBytesUTF8(value) + 1;
    var buffer = _malloc(size);
    stringToUTF8(value, buffer, size);
    return buffer;
  },

  ShowroomBrowserStorage_Set: function (keyPointer, valuePointer) {
    try {
      window.localStorage.setItem(UTF8ToString(keyPointer), UTF8ToString(valuePointer));
      return 1;
    } catch (error) {
      return 0;
    }
  },

  ShowroomBrowserStorage_Remove: function (keyPointer) {
    try {
      window.localStorage.removeItem(UTF8ToString(keyPointer));
      return 1;
    } catch (error) {
      return 0;
    }
  },
});
