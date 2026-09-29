// The browser's localStorage, for the showroom's saved account.
//
// Unity's PlayerPrefs on WebGL live in IndexedDB under a directory named after
// the page's own URL, so two demos served from sibling directories of one
// origin never see each other's values. localStorage belongs to the origin,
// which is what lets every demo on it sign in as the same visitor. Its writes
// are synchronous as well, so a value written just before the page reloads is
// already there when the next page reads it.
//
// Every entry point swallows the storage's own failures (a private window, a
// browser set to block site data) and reports them through its return value:
// null for a read, 0 for a write.
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
