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
- `Handlers/<Type>.showroom.json`: the handler classes of a type, their Inspector fields, the values this project
  gives its key fields (`keyValues`), and each UI component class with its kind and the fields to fill. Read it
  instead of guessing field names.
- `Runtime/Gs2StudioAccount.cs`: the GS2-Account namespace the project deploys (see "Sign-in").

## Scene

One GameObject at the scene root (such as `GS2`) holds:

1. `Gs2ClientHolder` (Add Component > GS2/Core). Add `Assets/GS2Studio/Gs2Environment.asset`, which
   `deploy unity-environment` writes, to Environments, and set Active Environment Name to the asset's `name`
   field (`GS2Studio` unless `deploy unity-environment --name` set another), not its file name. Wire its `onError`
   (an internal field: in the Inspector, or as a serialized property) to its own
   `DebugErrorHandler(Gs2Exception, Func<IEnumerator>)`, which logs GS2 errors; without a listener they are not logged.
2. `Gs2GameSessionHolder` (GS2/Core).
3. `Gs2AutoLoginAction` (GS2/Account/AutoLogin), which signs in (see "Sign-in"). For testing, wire its `onError`,
   and any other GS2 UIKit component's, to `Gs2ClientHolder.DebugErrorHandler`, which only logs: it never runs the
   retry it is given, so sign-in stops at an error. A game's own listener shows the error and can retry with
   `StartCoroutine(retry())`.
4. `Gs2HolderRuntimeContextProvider` (GS2 Studio/Runtime), through which the handlers reach the holders.

Then:

- Put each `<Type>Handler` on an ancestor of every component that reads it, typically the page root. A component
  uses the nearest `<Type>HandlerBase` above it, and without one it logs a warning and does nothing. A condition
  on another type's row reads every `<Type>Handler` above it. A single-entry type's handler takes no row id; what
  the others take is under "This project". REFERENCE.md "Rows in the game" and "Another type's row".
- A list is a `<Type>ListHandler` with `_itemPrefab` (a prefab with a `<Type>ListItemHandler` at its root
  and the row's components below it) and `_contentParent`; set `_axis` when the type has one.
- The scene needs an `EventSystem` whose input module matches Player Settings > Active Input Handling
  (`InputSystemUIInputModule` for the Input System package).
- A `Canvas` added as a component starts in World Space: set Screen Space - Overlay (or Camera), and add a
  `CanvasScaler` and a `GraphicRaycaster`, without which no Button gets clicks. After reparenting UI objects
  under a Canvas, make sure their localScale is 1.

## Screen states

What a screen shows and allows follows the player's data through the generated condition components. Place them and
fill their lists; do not write scripts that switch panels or buttons.

- An interactable (`UiItem.interactable`) makes the Selectables, such as Buttons, in `_interactableWhenTrue`
  interactable while its condition holds, and those in `_interactableWhenFalse` while it does not. Use it to allow
  an action's button only when the action can succeed.
- An active toggle (`UiItem.activeToggle`) activates the GameObjects in `_activeWhenTrue` while its condition
  holds, and those in `_activeWhenFalse` while it does not. Use it to show what belongs to one state, such as a
  panel or a different button. Put it on a GameObject that stays active, never on one it hides. REFERENCE.md
  "UI components".
- Until its own row has loaded, a condition component leaves its targets as the scene has them, so save the scene in
  the state to show before data arrives (for example a Button not interactable). While a row of another type that its
  condition reads cannot be read (not loaded, or no handler above holds it), an interactable makes both lists not
  interactable, and an active toggle leaves its targets as they are.
- "This project" lists each type's button actions and condition components, and the rows of other types each one
  reads: put a `<Type>Handler` holding each of those rows above the component.

## Wiring

- No component writes to a `Text` by itself. Wire the `OnUpdate` (`UnityEvent<string>`) of each label,
  template label and countdown to the text element's `text`: in the Inspector, with
  `UnityEditor.Events.UnityEventTools.AddPersistentListener` in an editor script, or by setting the event's
  serialized `m_PersistentCalls.m_Calls` with a scene-editing tool.
- Generated components serialize their events as `_onUpdate` (label, template label, value, countdown),
  `_onSelect` (value), `_onRemaining` and `_onCounting` (countdown), and `_onCompleted` and `_onFailed`
  (button action). One persistent call:

  ```yaml
  _onUpdate:
    m_PersistentCalls:
      m_Calls:
      - m_Target: {fileID: <the Text component>}
        m_TargetAssemblyTypeName: UnityEngine.UI.Text, UnityEngine.UI
        m_MethodName: set_text
        m_Mode: 0
        m_Arguments:
          m_ObjectArgument: {fileID: 0}
          m_ObjectArgumentAssemblyTypeName:
          m_IntArgument: 0
          m_FloatArgument: 0
          m_StringArgument:
          m_BoolArgument: 0
        m_CallState: 2
  ```

  `m_Mode` 0 passes the event's own arguments, 1 passes none, and 5 passes `m_Arguments.m_StringArgument`.
  `m_CallState` 2 runs the call in Play mode and in builds (Runtime Only).
- Assembly-qualified names (`Namespace.Type, Assembly`) of the types this guide wires:
  - `Gs2.Unity.Util.Gs2ClientHolder, Gs2.Unity`: method `DebugErrorHandler`; event field `onError`.
  - `Gs2.Unity.Util.Gs2GameSessionHolder, Gs2.Unity`.
  - `Gs2Bind.Gs2Account.Gs2AutoLoginAction, Gs2Bind.Unity`: event fields `onAccountCreated`,
    `onRestoreAccount`, `onAutoLoginComplete` and `onError`.
  - `Gs2Bind.Gs2Account.Gs2PlayerPrefsAccountStore, Gs2Bind.Unity`: methods `Remember`, `Restore` and
    `Forget`.
  - `UnityEngine.UI.Text, UnityEngine.UI`: method `set_text`.
  - `TMPro.TMP_Text, Unity.TextMeshPro` (the base of TextMeshPro's text components): method `set_text`.
  - Generated classes and the game's own scripts: assembly `Assembly-CSharp` (`Assembly-CSharp-Editor` for
    those in an `Editor` folder), unless an assembly definition covers their folder. The generated namespaces are
    under "This project".
- Not wired for you: `_button` of a button action (empty, it does nothing and logs nothing), `_target` of a gauge
  and of an image, and the lists of an active toggle and an interactable. `_handler` fields find their handler.
- An image component loads nothing: implement `partial void ApplyImage(Image target, string reference)` in your
  own part of its class.
- A gauge sets `fillAmount` of its target `Image`, which shows only when the Image Type is Filled and the Image
  has a Source Image; otherwise the gauge warns once in the Console. Use a sprite that is white to its edges with no
  border, such as a small white texture imported as Sprite (2D and UI). A fill stretches the border and soft edges of
  a sprite made for Sliced, such as the built-in `UISprite`, and blurs.
- A button action logs its own failures, so its `OnFailed` (the `onError` signature) is for the game's error UI.
- Show the time left until a timestamp of a row with the generated countdown (`UiItem.countdown`), not a
  hand-written timer: it counts on the GS2 session's clock. While the timestamp holds no time, it sends the item's
  `fallbackText`, or empty text when the DSL sets none.
- Do not call `Reload` or `Invalidate` after an action: handlers follow action results through the GS2 SDK
  cache. REFERENCE.md "Rows in the game".

## Sign-in

- Set `Gs2AutoLoginAction.accountNamespace` to `Gs2StudioAccount.NamespaceName` from
  `Generated/Runtime/Gs2StudioAccount.cs`, in the namespace that file declares (`GS2Studio.Generated.Runtime` by
  default); an editor script can assign the constant. That file is absent when
  the project deploys no GS2-Account namespace or more than one; then add one to the project, or ask the user which.
- Without `persistAccount`, every Play signs in as a new player. To continue as the same player, set
  `persistAccount`, add `Gs2PlayerPrefsAccountStore` (GS2/Account/PlayerPrefs Account Store), and wire
  `Gs2AutoLoginAction`'s `onAccountCreated` to its `Remember` and `onRestoreAccount` to its `Restore`
  (`m_Mode` 0). PlayerPrefs keeps the password in plain text, as a save file would.
- When the saved account no longer exists on the server (its stack was deleted and deployed again), sign-in raises
  a `NotFoundException` through `onError` and stops: nothing retries unless the `onError` listener runs the
  retry it is given, and a retry restores the same saved account. Call the store's `Forget()` first, then retry
  or Play again, and a new account is created.
- The client ID and secret: LLM.md "8. The game's GS2 client credentials".

## Language

- Generated labels show localized text in `Gs2Locale.Current` (`Gs2Bind.Localization`) and update on
  `Gs2Locale.Changed`. Switch with `Gs2Locale.Set` and a locale, such as `Gs2Locale.Set("en")`; with
  `com.unity.localization` installed, it follows that package's selected locale. REFERENCE.md "Localized text".
- `Gs2Locale.Current` starts from the device language and can be a regional tag such as `en-US`: compare its
  language prefix, not the whole tag.
- A Button's `onClick` cannot call the static `Gs2Locale.Set`. Add a component such as
  `public class LocaleSwitch : MonoBehaviour { public void Set(string locale) => Gs2Locale.Set(locale); }` and
  wire `onClick` to its `Set` with the locale as the argument (`m_Mode` 5).
- Fixed text, such as headings and button captions, comes from a `UiItem.templateLabel` whose template is text per
  locale with no placeholders, when the DSL declares one ("This project" lists them): its generated component sends
  the text for `Gs2Locale.Current` without waiting for a row and again on `Gs2Locale.Changed`. Wire its
  `OnUpdate` to the Text as for any label, and put it under its type's handler like every generated component.
  REFERENCE.md "Localized templates". Other fixed text is the game's to localize, or the user can add such a
  template label to the DSL.
- A text element shows only the glyphs its font has. For a locale whose script is not Latin, such as Japanese,
  Chinese or Korean, use TextMeshPro with a font asset made from a font that covers it, or legacy `Text` with a font
  that covers it (its default font falls back to an OS font, which differs by device). When the font has no bold face,
  Bold makes Unity draw a faux bold, which blurs small text in such a script: leave it off.

## Verify

1. After `codegen unity`, let Unity import and compile (focus the Editor, or Assets > Refresh), and check that the
   Console shows no compile error.
2. Enter Play mode and wait for sign-in: the `Initialized` property of the scene's `Gs2GameSessionHolder` (also
   `Gs2GameSessionHolder.Instance`) turns true when it has finished, just before `Gs2AutoLoginAction` invokes
   `onAutoLoginComplete` (the C# event `OnAuthenticationComplete`). A handler has loaded its row
   when its `HasValue` is true, and a list handler its rows when its `IsLoaded` is true; a list's `Count` can be
   0 while it reloads. Then check that the Console shows no error and no warning from the generated components,
   which name a handler or loader they lack. An empty `_target` or `_button` logs nothing.
3. Look at the screen (a screenshot), not only at the values the components send: an unwired event, an empty
   target or a gauge without a sprite shows nothing.

## This project

Handler fields to set, each with the values the project gives it: the ids of the rows it deploys, of the rows
conditions read, and of the rows its actions name with a literal value. A field with no value listed takes an id
listed for the handler of the type it names, or a value the DSL's action transforms compute
(REFERENCE.md "Rows in the game"). Ask the user when unsure.

- `EquipmentCatalogHandler`: `_id` = `iron-sword` or `oak-staff` or `steel-shield`
- `EquipmentHandler`: `_id` = `iron-sword` or `oak-staff` or `steel-shield`, `_propertyId`

Button actions and condition components (see "Screen states"):

- `EquipmentCatalog`: button actions `EquipmentCatalogTakeButton`
- `EquipmentCollection`: button actions `EquipmentCollectionExpandButton`; interactables `EquipmentCollectionExpandableInteractable`; active toggles `EquipmentCollectionFullActiveToggle`, `EquipmentCollectionHoldsAnyActiveToggle`
- `Equipment`: button actions `EquipmentDiscardButton`

Generated namespaces: `GS2Studio.Generated.<Type>` for a type's handlers, `GS2Studio.Generated.<Type>.UI` for its UI components, and `GS2Studio.Generated.Runtime` for `Gs2HolderRuntimeContextProvider` and `Gs2StudioAccount`.

No template label of this project is fixed text, so the game supplies its headings (see "Language").

No localized text of this project names a locale; choose fonts for the languages the game shows (see "Language").
