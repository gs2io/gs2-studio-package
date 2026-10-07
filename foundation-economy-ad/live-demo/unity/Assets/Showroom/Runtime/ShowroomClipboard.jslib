// Poll the asynchronous clipboard result because browser permission prompts may outlive a Unity frame.
var ShowroomClipboard = {
  $ShowroomClipboardState: { status: 0, text: "", request: 0 },

  $ShowroomClipboardBegin: function () {
    var state = ShowroomClipboardState;
    state.request += 1;
    state.status = 1;
    state.text = "";
    return state.request;
  },

  // Ignore late promises after abandonment or replacement so they cannot overwrite the active request.
  $ShowroomClipboardSettle: function (request, status, text) {
    var state = ShowroomClipboardState;
    if (request !== state.request) return;
    state.status = status;
    state.text = text;
  },

  ShowroomClipboardCopy: function (textPointer) {
    var text = UTF8ToString(textPointer);
    var request = ShowroomClipboardBegin();
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      ShowroomClipboardSettle(request, 3, "this browser has no clipboard access");
      return;
    }
    navigator.clipboard.writeText(text).then(
      function () {
        ShowroomClipboardSettle(request, 2, "");
      },
      function (error) {
        ShowroomClipboardSettle(request, 3, String(error && error.message ? error.message : error));
      }
    );
  },

  ShowroomClipboardPaste: function () {
    var request = ShowroomClipboardBegin();
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      ShowroomClipboardSettle(request, 3, "this browser does not let a page read the clipboard");
      return;
    }
    navigator.clipboard.readText().then(
      function (text) {
        ShowroomClipboardSettle(request, 2, text);
      },
      function (error) {
        ShowroomClipboardSettle(request, 3, String(error && error.message ? error.message : error));
      }
    );
  },

  ShowroomClipboardStatus: function () {
    return ShowroomClipboardState.status;
  },

  ShowroomClipboardTake: function () {
    var state = ShowroomClipboardState;
    var text = state.text;
    state.status = 0;
    state.text = "";
    return stringToNewUTF8(text);
  },

  ShowroomClipboardAbandon: function () {
    var state = ShowroomClipboardState;
    state.request += 1;
    state.status = 0;
    state.text = "";
  },
};

autoAddDeps(ShowroomClipboard, "$ShowroomClipboardState");
autoAddDeps(ShowroomClipboard, "$ShowroomClipboardBegin");
autoAddDeps(ShowroomClipboard, "$ShowroomClipboardSettle");
mergeInto(LibraryManager.library, ShowroomClipboard);
