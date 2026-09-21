/**
 * Live demo content for `micro-economy-skill-tree`.
 *
 * The feature package defines what a node is — what it costs, what has to be
 * released before it, and how much of the cost comes back if it is reset — and
 * ships no nodes: a tree is a title's decision. This package supplies four
 * nodes arranged so the shape is the whole of what they say, the currency the
 * costs are paid in, and the character whose tree is being read.
 *
 * **A node is released for somebody.** GS2-SkillTree keys progress by an
 * opaque property id, and this package spends the value the rest of the
 * character packages spend: the character's Inventory ItemSet GRN, minted when
 * a character is recruited. So the page recruits a character first, and only
 * then is there a tree to look at. Which character is a run-time fact — the
 * GRN does not exist until the recruit lands — so it cannot be baked into the
 * scene the way a shop's currency can. That is what `CharacterOpenTreeButton`
 * is for, and why it is written by hand: see the file for the whole of it.
 *
 * **The costs are not the skill tree's.** A node's release runs consume
 * actions, and a consume action is whatever the project installed can charge —
 * so the demo depends on `foundation-economy-currency` and pays out of its
 * wallet. A cost this package could charge on its own would have meant paying
 * for a skill node with a skill node.
 *
 * The cost is appended rather than authored. `SkillNode.releaseConsumeActions`
 * is the slot the feature package leaves open, and this demo overlays
 * `SkillNode` to append one withdrawal into it, sized from a `cost` it
 * declares — so four nodes charge four different amounts from one written-out
 * action, and a second package installed beside this one could append its own
 * beside it.
 *
 * **The shape is the content.** `first` is free of prerequisites; `left` and
 * `right` each want `first`; `last` wants both of them. That is the smallest
 * arrangement in which a prerequisite is visible as something other than a
 * chain: `last` cannot be reached by walking one branch, and GS2 refuses it
 * until both are released. The names say the shape and nothing else — an
 * ability invented to sit on top (fireball, second wind) would have put a game
 * on the page that is not there.
 *
 * The four costs are 10, 20, 20 and 50, and one press of the currency demo's
 * free deposit is 100. So a visitor funds the whole tree once and spends it
 * exactly, and a node that will not release for want of money is a state the
 * page can reach without being the state it starts in.
 *
 * **There is a press that puts it back.** `Restrain` un-releases a node and
 * returns `restrainReturnRate` of what it cost, so the flag can be watched
 * moving in both directions inside one visit rather than only on a player who
 * has never been here.
 *
 * **Neither press is a generated one.** `Gs2SkillTree:Release` and
 * `Restrain` are the calls that charge a node and enforce its premises, and a
 * delegated action on either cannot be generated: the catalog gives both a
 * `config` parameter that Gs2Bind's methods do not take, and the generator
 * refuses rather than emit a call that would not compile. So the two buttons
 * are written by hand, the way the shop demo writes its purchase —
 * `SkillNodeReleaseButton` and `SkillNodeRestrainButton` carry the whole of
 * the reasoning.
 */

import { defineOverlayDomainType, definePackage, dependencyPackage, PT, UiCond } from "~/dsl";

import { jaEnField } from "../../../dsl/jaEnField";

import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";
import skillTreeSurface from "../../dsl/dependency-surface.json";

// Materialization publishes each package's identities, so everything below is
// addressed by name; a typo is a compile error rather than an id that resolves
// to nothing.
const skillTree = dependencyPackage(skillTreeSurface);
// Where the costs are charged. The wallet, the Money2 namespace and the
// withdrawal are all the currency package's, already written and already
// deployed, so none of them is authored again here.
const currency = dependencyPackage(currencySurface);

/** The demo shows one player with one wallet, slot 0. */
const WALLET_SLOT = 0;

/**
 * Half the cost comes back. A rate rather than a refund so the number on the
 * row is the one the server divides by, and a reset that returned everything
 * would have made `restrainReturnRate` look like a flag.
 */
const RETURN_RATE = 0.5;

/** The inherited slots this demo names. An overlay declares only `cost`. */
const RELEASE_CONSUME_ACTIONS = skillTree.propertyId("SkillNode", "releaseConsumeActions");
const PREMISE_NODES = skillTree.propertyId("SkillNode", "premiseNodes");
const RESTRAIN_RETURN_RATE = skillTree.propertyId("SkillNode", "restrainReturnRate");
const RELEASED = skillTree.propertyId("SkillNode", "released");

/**
 * The node, overlaid so it can carry what it costs.
 *
 * `releaseConsumeActions` is the slot the feature package leaves open: the
 * generated `NodeModel` binds an array child to it, and whatever the property
 * resolves to is what GS2 charges when the node is released. Appending rather
 * than replacing is what lets the amount come off the row — one withdrawal is
 * written here, and `cost` decides how big it is on each of the four nodes.
 *
 * The property is `masterData`: its value is authored here and travels into
 * the deployed node's consume action, which is where GS2 reads it at release
 * time. Nothing on the server answers for it afterwards, so the page reads it
 * back from the same row the deploy was built from.
 */
const SkillNode = defineOverlayDomainType(
  "SkillNode",
  {
    ...skillTree.overlay("SkillNode"),
    actionPropertyTransforms: [
      {
        // Addressed by id because the property belongs to the type this
        // overlay extends: a single-package build does not load its
        // dependency closure, so the name would pass through unresolved.
        targetProperty: RELEASE_CONSUME_ACTIONS,
        kind: "transformEntries",
        mode: "append",
        entries: [
          {
            transformPackageId: currency.packageId,
            transformName: "WithdrawCurrency",
            arguments: [
              { parameterName: "slot", source: { kind: "static", value: WALLET_SLOT } },
              // Free currency, which is what the deposit on the page pays in.
              { parameterName: "paidOnly", source: { kind: "static", value: false } },
              {
                parameterName: "count",
                source: { kind: "domainProperty", propertyName: "cost" },
              },
            ],
          },
        ],
      },
    ],
  },
  domainType =>
    domainType
      .property(
        PT.int32("cost")
          .masterData()
          .required()
          .description("Free currency this node charges when it is released")
      )
      .localizedProperties({
        cost: jaEnField(
          "解放コスト",
          "Unlock cost",
          "このノードを解放するときに消費する無償通貨の額です。",
          "Free currency spent to unlock this node."
        ),
      })
);

/**
 * The four nodes, with what each one wants first and what it charges.
 *
 * Read once and folded out below. `first` opens the tree, `left` and `right`
 * each want it, and `last` wants both — so a prerequisite is visible as a
 * join rather than as a queue, and the order a visitor can press in is not a
 * single line.
 */
const NODES = [
  { id: "first", premises: [] as readonly string[], cost: 10 },
  { id: "left", premises: ["first"], cost: 20 },
  { id: "right", premises: ["first"], cost: 20 },
  { id: "last", premises: ["left", "right"], cost: 50 },
] as const;

/**
 * The package up to its dependencies. Split here because a builder chain has
 * no room for a loop and the nodes are folded in from {@link NODES}.
 */
const withDependencies = definePackage("micro-economy-skill-tree-demo", "0.0.0")
  .display({
    label: { ja: "スキルツリー（デモデータ）", en: "Skill tree (demo data)" },
    description: {
      ja: "ライブデモ用の4つのスキルノードと、その解放コストを支払う無償通貨を提供します。ノードの解放状況はキャラクターごとに記録されます。",
      en: "Supplies the live demo's four skill nodes and the free currency their unlock costs are paid from. What is unlocked is tracked per character.",
    },
  })
  .displayType(SkillNode, {
    label: { ja: "スキルノード", en: "Skill node" },
    description: {
      ja: "デモのスキルノードに、解放時へ消費する無償通貨の額を足します。",
      en: "Adds the free currency a demo skill node charges when it is released.",
    },
  })
  .dependency(skillTree.packageId, "github:gs2io/gs2-studio-package")
  // The skill tree hangs off a character, and an install does not walk a
  // package's own dependencies, so the package that owns that type is named
  // here too.
  .dependency("foundation-economy-character", "github:gs2io/gs2-studio-package")
  // Where a character comes from. A visitor arrives owning nothing, and a
  // tree with no owner has no rows, so the roster and the recruit that grants
  // one are installed rather than authored again.
  .dependency("foundation-economy-character-demo", "github:gs2io/gs2-studio-package")
  // What the costs are charged against, and the press that funds them.
  .dependency(currency.packageId, "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-currency-demo", "github:gs2io/gs2-studio-package")

  // The overlay that carries what a node costs. Registered outright because it
  // declares a property and hosts the append.
  .domainType(SkillNode);

// Four nodes, one tree. Authored by type name rather than through the
// overlay's handle: a row belongs to the canonical type, and the dependency's
// handle resolves value keys only against what that package publishes. The
// name reaches the overlay this package declared, and `cost` with it.
const withNodes = NODES.reduce(
  (builder, { id, premises, cost }) =>
    builder.instance("SkillNode", id, {
      // The slot the cost is appended to. Authored empty rather than left
      // unset because the feature package requires it, and empty is what it
      // holds before the append: what a node charges is this demo's to say.
      [RELEASE_CONSUME_ACTIONS]: [],
      [PREMISE_NODES]: [...premises],
      [RESTRAIN_RETURN_RATE]: RETURN_RATE,
      cost,
    }),
  withDependencies
);

export const microEconomySkillTreeDemo = withNodes
  // The feature package ships the flag and what a node is; what it does not
  // ship is a sentence about one, so those are here. The presses are neither
  // the feature package's nor generated — see the header.
  //
  // `owner` gets no component. It is the scope the list is read for rather
  // than a fact about a node — every row in a section carries the same value —
  // and the character it names is already on the page, as the row whose button
  // put it there.
  .uiComponent(SkillNode, ui =>
    ui
      // What a node charges, read off the row — so a page and a stack that
      // have drifted apart say so instead of the page confidently printing a
      // cost nothing enforces. The page heads the row with the component's
      // own name, so the reading says the amount and not the word again.
      //
      // What a node wants released first is the other half, and it is not
      // here: `premiseNodes` is a list, and a template label interpolates
      // whatever it is given, which for a list is the name of its class. The
      // demo writes `SkillNodeNeedsLabel` to read the same property into a
      // reading.
      .templateLabel(
        "CostLabel",
        "{cost} free currency",
        { cost: ui.prop("cost") },
        { name: "SkillNode" }
      )
      // What a release leaves behind, on the node rather than in the wallet.
      // The row only appears once the node is released, so its heading is the
      // news and the reading is what a reset would give back. The rate is the
      // row's own, so a released node names the share its own reset will
      // return instead of a figure written out twice.
      .templateLabel(
        "UnlockedLabel",
        "A reset returns {rate} of what it cost.",
        { rate: ui.inheritedProp(RESTRAIN_RETURN_RATE) },
        { name: "SkillNode" }
      )
      // An active toggle carries the rows its condition empties, so each one
      // below is named for the state in which its row has nothing to say
      // rather than for the state that puts it on the page.
      //
      // Written as `not(released)` rather than through `invert`, because the
      // generated `<summary>` is built from the condition and not from the
      // flag, and would otherwise describe the opposite of what it does.
      .activeToggle("ReleasedActiveToggle", UiCond.truthy(ui.inheritedProp(RELEASED)), {
        name: "SkillNode",
      })
      .activeToggle(
        "UnreleasedActiveToggle",
        UiCond.not(UiCond.truthy(ui.inheritedProp(RELEASED))),
        { name: "SkillNode" }
      )
  )
  .build();
