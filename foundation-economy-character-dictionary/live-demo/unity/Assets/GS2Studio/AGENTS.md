<!-- Written by GS2 Studio's Unity code generation, which rewrites it on every run. Do not edit. -->
# Building Unity scenes from GS2 Studio's generated code

GS2 Studio writes the game's GS2 code into `Assets/GS2Studio/Generated/` and rewrites this file with it. Never edit
either: change the GS2 Studio project and run `codegen unity` again. Keep the game's own scripts, scenes and prefabs
outside `Assets/GS2Studio/Generated/`, which every run replaces. The DSL documents cited below are in the `docs/`
folder of the package DSL directory (`dsl init` writes it).

## What is generated

- `Handlers/<Type>Handler.cs`, `<Type>ListHandler.cs`, `<Type>ListBy<Property>Handler.cs`: hold the rows of a type.
- `Handlers/UI/<Type><Item>.cs`: one component per UI item of the DSL (label, template label, value, countdown, image,
  gauge, button action, active toggle, interactable).
- `Handlers/<Type>.showroom.json`: the handler classes of a type, their Inspector fields, and each UI component
  class with its kind and the fields to fill. Read it instead of guessing field names.
- `Runtime/Gs2StudioAccount.cs`: the GS2-Account namespace the project deploys (see "Sign-in").

## Scene

One GameObject at the scene root (such as `GS2`) holds:

1. `Gs2ClientHolder` (Add Component > GS2/Core). Add `Assets/GS2Studio/Gs2Environment.asset`, which
   `deploy unity-environment` writes, to Environments, and set Active Environment Name to the asset's `name`
   field (`GS2Studio` unless `deploy unity-environment --name` set another), not its file name. Wire its `onError`
   to its own `DebugErrorHandler`, which logs GS2 errors; without a listener they are not logged.
2. `Gs2GameSessionHolder` (GS2/Core).
3. `Gs2AutoLoginAction` (GS2/Account/AutoLogin), which signs in (see "Sign-in"); wire its `onError` too.
4. `Gs2HolderRuntimeContextProvider` (GS2 Studio/Runtime), through which the handlers reach the holders.

Then:

- Put each `<Type>Handler` on an ancestor of every component that reads it, typically the page root. A component
  uses the nearest `<Type>HandlerBase` above it, and without one it logs a warning and does nothing. A condition
  on another type's row reads every `<Type>Handler` above it. A single-entry type's handler takes no row id.
  REFERENCE.md "Rows in the game" and "Another type's row".
- A list is a `<Type>ListHandler` with `_itemPrefab` (a prefab with a `<Type>ListItemHandler` at its root
  and the row's components below it) and `_contentParent`; set `_axis` when the type has one.
- The scene needs an `EventSystem` whose input module matches Player Settings > Active Input Handling
  (`InputSystemUIInputModule` for the Input System package).

## Wiring

- No component writes to a `Text` by itself. Wire the `OnUpdate` (`UnityEvent<string>`) of each label,
  template label and countdown to the text element's `text`, in the Inspector or with
  `UnityEditor.Events.UnityEventTools.AddPersistentListener` in an editor script.
- Not wired for you: `_button` of a button action (empty, it does nothing and logs nothing), `_target` of a gauge
  and of an image, and the lists of an active toggle and an interactable. `_handler` fields find their handler.
- Put an active toggle on a GameObject that stays active, never on one it hides. REFERENCE.md "UI components".
- An image component loads nothing: implement `partial void ApplyImage(Image target, string reference)` in your
  own part of its class.
- A gauge sets `fillAmount` of its target `Image`, which shows only when the Image Type is Filled and the Image
  has a Source Image (any sprite, such as a white one); otherwise the gauge warns once in the Console.
- Show the time left until a timestamp (a stamina's next recovery) with the generated countdown
  (`UiItem.countdown`), not a hand-written timer: it counts on the GS2 session's clock. While there is no time,
  such as at full stamina, it sends the item's `fallbackText`, or empty text when the DSL sets none.
- Do not call `Reload` or `Invalidate` after an action: handlers follow action results through the GS2 SDK
  cache. REFERENCE.md "Rows in the game".

## Sign-in

- Set `Gs2AutoLoginAction.accountNamespace` to `Gs2StudioAccount.NamespaceName` from
  `Generated/Runtime/Gs2StudioAccount.cs`, in the namespace that file declares (`GS2Studio.Generated.Runtime` by
  default); an editor script can assign the constant. That file is absent when
  the project deploys no GS2-Account namespace or more than one; then add one to the project, or ask the user which.
- Without `persistAccount`, every Play signs in as a new player. To continue as the same player, set
  `persistAccount`, add `Gs2PlayerPrefsAccountStore` (GS2/Account/PlayerPrefs Account Store), and wire
  `OnAccountCreated` to its `Remember` and `OnRestoreAccount` to its `Restore`. PlayerPrefs keeps the
  password in plain text, as a save file would.
- When the saved account no longer exists on the server (its stack was deleted and deployed again), sign-in raises
  a `NotFoundException` through `onError` and stops: nothing retries unless the `onError` listener runs the
  retry it is given, and a retry restores the same saved account. Call the store's `Forget()` first, then retry
  or Play again, and a new account is created.
- The client ID and secret: LLM.md "8. The game's GS2 client credentials".

## Language

- Generated labels show localized text in `Gs2Locale.Current` (`Gs2Bind.Localization`) and update on
  `Gs2Locale.Changed`. Switch with `Gs2Locale.Set("ja")` or `Gs2Locale.Set("en")`; with
  `com.unity.localization` installed, it follows that package's selected locale. REFERENCE.md "Localized text".
- `Gs2Locale.Current` starts from the device language and can be a regional tag such as `ja-JP`: compare its
  language prefix, not the whole tag.
- Fixed text, such as headings and button captions, is not generated; the game localizes it.

## Verify

1. After `codegen unity`, let Unity import and compile (focus the Editor, or Assets > Refresh), and check that the
   Console shows no compile error.
2. Enter Play mode, wait for sign-in (`Gs2AutoLoginAction`'s `OnAuthenticationComplete`), and check that the Console
   shows no error and no warning from the generated components, which name a handler or loader they lack. An empty
   `_target` or `_button` logs nothing.
3. Look at the screen (a screenshot), not only at the values the components send: an unwired event, an empty
   target or a gauge without a sprite shows nothing.
