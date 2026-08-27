import { Bind, defineDomainType, defineMasterDataResource, definePackage, PT, Source } from "~/dsl";
import { GS2 } from "~/dsl/gs2";

const Energy = defineDomainType("Energy", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.int32("defaultMaximum").masterData().required())
    .property(PT.bool("useOverflow").masterData().required())
    .property(PT.int32("overflowedMaximum").masterData().required())
    .property(PT.int32("recoveryIntervalMinutes").masterData().required())
    .property(PT.int32("recoveryValue").masterData().required())
    .property(PT.int32("currentValue").userData().required())
    .property(PT.int32("currentMaximumValue").userData().required())
    .property(PT.timestamp("nextRecoverdAt").userData().required())
);

const StaminaModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.stamina.StaminaModel)
    .mountLocal(Energy)
    .bindings({
      name: Bind.domainProperty(Source.direct(Energy, "id")),
      initialCapacity: Bind.domainProperty(Source.direct(Energy, "defaultMaximum")),
      isOverflow: Bind.domainProperty(Source.direct(Energy, "useOverflow")),
      maxCapacity: Bind.domainProperty(Source.direct(Energy, "overflowedMaximum")),
      recoverIntervalMinutes: Bind.domainProperty(Source.direct(Energy, "recoveryIntervalMinutes")),
      recoverValue: Bind.domainProperty(Source.direct(Energy, "recoveryValue")),
      maxStaminaTable: Bind.null(),
      recoverIntervalTable: Bind.null(),
      recoverValueTable: Bind.null(),
    })
);

export const foundationEconomyEnergy = definePackage("foundation-economy-energy", "0.0.0")
  .display({
    label: { ja: "スタミナ", en: "Stamina" },
    description: {
      ja: "時間経過で回復するスタミナ（行動力）を管理します。",
      en: "Manages a stamina/energy meter that recovers over time.",
    },
  })
  .displayType(Energy, { label: { ja: "スタミナ", en: "Stamina" } })
  .domainType(Energy)

  .masterDataResource(r =>
    r
      .model(GS2.stamina.Namespace)
      .bindings({
        name: Bind.static("Energy"),
        overflowTriggerScript: Bind.null(),
        logSetting: Bind.null(),
        transactionSetting: {
          acquireActionUseJobQueue: Bind.static(false),
          commitScriptResultInUseDistributor: Bind.static(false),
          distributorNamespaceId: Bind.static("grn:gs2:{region}:{ownerId}:distributor:default"),
          enableAtomicCommit: Bind.static(false),
          enableAutoRun: Bind.static(false),
          queueNamespaceId: Bind.static("grn:gs2:{region}:{ownerId}:queue:default"),
          transactionUseDistributor: Bind.static(false),
        },
      })
      .addChild(StaminaModel)
  )

  .userDataResource(r =>
    r
      .model(GS2.stamina.Stamina)
      .linkedMasterResourceId(StaminaModel)
      .mountLocal(Energy)
      .bindings({
        value: Bind.domainProperties([Source.direct(Energy, "currentValue")]),
        maxValue: Bind.domainProperties([Source.direct(Energy, "currentMaximumValue")]),
        nextRecoverAt: Bind.domainProperties([Source.direct(Energy, "nextRecoverdAt")]),
        overflowValue: Bind.skip(),
        staminaName: Bind.skip(),
        userId: Bind.skip(),
      })
  )

  .actionTransform("ConsumeEnergy", at =>
    at
      .category("consume")
      .parameter("value", { type: PT.int32() })
      .output("Gs2Stamina:ConsumeStaminaByUserId", o =>
        o
          .resourceRef(() => StaminaModel)
          .mapResourceKey("namespaceName")
          .mapResourceKey("staminaName")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("consumeValue", "value")
      )
  )
  .actionTransform("RecoveryEnergy", at =>
    at
      .category("acquire")
      .parameter("value", { type: PT.int32() })
      .output("Gs2Stamina:RecoverStaminaByUserId", o =>
        o
          .resourceRef(() => StaminaModel)
          .mapResourceKey("namespaceName")
          .mapResourceKey("staminaName")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("recoverValue", "value")
      )
  )
  .build();
