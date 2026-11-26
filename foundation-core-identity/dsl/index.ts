import {
  Bind,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  defineUserDataResource,
  instance,
  PT,
  Source,
  transactionSettingV2,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

const TakeOverSetting = defineDomainType("TakeOverSetting", {
  properties: {
    type: PT.int32().masterData().required(),
    configurationPath: PT.string().masterData().required(),
    clientId: PT.string().masterData().required(),
    clientSecret: PT.string().masterData().required(),
    doneEndpointUrl: PT.string().masterData().required(),
    appleTeamId: PT.string().masterData(),
    appleKeyId: PT.string().masterData(),
    applePrivateKeyPem: PT.string().masterData(),
    hasTakeOver: PT.bool().userData(),
  },
  localizedDisplay: {
    ja: {
      label: "引き継ぎ設定",
      description: "アカウント引き継ぎに使用するOIDC接続情報と認証設定を登録します。",
    },
    en: {
      label: "Take-over setting",
      description:
        "Configures the OIDC connection and authentication settings used for account transfer.",
    },
  },
  localizedProperties: {
      id: jaEnId("引き継ぎ設定", "take-over setting"),
      type: jaEnField(
        "認証種別",
        "Authentication type",
        "引き継ぎに使用する認証方式の種別番号です。",
        "Numeric type of authentication used for account transfer."
      ),
      configurationPath: jaEnField(
        "OIDC設定URL",
        "OIDC configuration URL",
        "OpenID Connect設定ドキュメントのURLです。",
        "URL of the OpenID Connect configuration document."
      ),
      clientId: jaEnField(
        "クライアントID",
        "Client ID",
        "OIDCクライアントIDです。",
        "OIDC client identifier."
      ),
      clientSecret: jaEnField(
        "クライアントシークレット",
        "Client secret",
        "OIDC認証に使用するクライアントシークレットです。",
        "Client secret used for OIDC authentication."
      ),
      doneEndpointUrl: jaEnField(
        "完了後URL",
        "Completion URL",
        "ログイン完了後に遷移するURLです。",
        "URL opened after login completes."
      ),
      appleTeamId: jaEnField(
        "Apple Team ID",
        "Apple Team ID",
        "Sign in with Appleで使用するTeam IDです。",
        "Apple Team ID used for Sign in with Apple."
      ),
      appleKeyId: jaEnField(
        "Apple Key ID",
        "Apple Key ID",
        "Sign in with Appleで使用するKey IDです。",
        "Apple Key ID used for Sign in with Apple."
      ),
      applePrivateKeyPem: jaEnField(
        "Apple秘密鍵",
        "Apple private key",
        "Sign in with Appleで使用するPEM形式の秘密鍵です。",
        "PEM private key used for Sign in with Apple."
      ),
      hasTakeOver: jaEnField(
        "引き継ぎデータあり",
        "Has take-over data",
        "プレイヤーに引き継ぎデータが登録されているかを示します。",
        "Whether take-over data is registered for the player."
      ),
    },
});

export const TRANSFER_CODE_TAKE_OVER_TYPE = 1024;

const TransferCode = defineDomainType("TransferCode", {
  properties: {
    userIdentifier: PT.string().userData().required(),
    registered: PT.bool().userData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "引き継ぎコード",
      description: "プレイヤーが登録した、IDとパスワードによる引き継ぎコードです。",
    },
    en: {
      label: "Transfer code",
      description: "The ID-and-password transfer code a player has registered.",
    },
  },
  localizedProperties: {
      id: jaEnId("引き継ぎコード", "transfer code"),
      userIdentifier: jaEnField(
        "引き継ぎ用ID",
        "Transfer ID",
        "引き継ぎコードとして登録した識別子です。パスワードは保存されないため表示できません。",
        "Identifier registered as the transfer code. The password is never stored, so it cannot be shown."
      ),
      registered: jaEnField(
        "登録済み",
        "Registered",
        "プレイヤーが引き継ぎコードを登録しているかを示します。",
        "Whether the player has registered a transfer code."
      ),
    },
});

const TakeOverTypeModel = defineMasterDataResource({
  model: GS2.account.TakeOverTypeModel,
  mount: TakeOverSetting,
  bindings: {
      type: Bind.domainProperty(Source.direct(TakeOverSetting, "type")),
      openIdConnectSetting: {
        additionalReturnValues: Bind.static([]),
        additionalScopeValues: Bind.static([]),
        appleKeyId: Bind.domainProperty(Source.direct(TakeOverSetting, "appleKeyId")),
        applePrivateKeyPem: Bind.domainProperty(
          Source.direct(TakeOverSetting, "applePrivateKeyPem")
        ),
        appleTeamId: Bind.domainProperty(Source.direct(TakeOverSetting, "appleTeamId")),
        clientId: Bind.domainProperty(Source.direct(TakeOverSetting, "clientId")),
        clientSecret: Bind.domainProperty(Source.direct(TakeOverSetting, "clientSecret")),
        configurationPath: Bind.domainProperty(Source.direct(TakeOverSetting, "configurationPath")),
        doneEndpointUrl: Bind.domainProperty(Source.direct(TakeOverSetting, "doneEndpointUrl")),
      },
    },
});

export const foundationCoreIdentity = definePackage({
  id: "foundation-core-identity",
  version: "0.0.1",
  display: {
    ja: {
      label: "引き継ぎ設定",
      description:
        "プレイヤーのアカウント（GS2-Account のネームスペース）を用意します。どのゲームでもプレイヤーのログインに必要です。引き継ぎコード（IDとパスワード）を発行して、別の端末やブラウザへアカウントを引き継ぐこともできます。",
    },
    en: {
      label: "Account Transfer",
      description:
        "Sets up player accounts (the GS2-Account namespace) that every game needs to sign players in. It also issues transfer codes (an ID and a password) to take the account over on another device or browser.",
    },
  },
  domainTypes: [TakeOverSetting, TransferCode],
  instances: [
    instance(TakeOverSetting, "apple", {
    type: 0,
    configurationPath: "https://appleid.apple.com/.well-known/openid-configuration",
    clientId: "dummy",
    clientSecret: "dummy",
    doneEndpointUrl: "dummy",
    appleTeamId: "dummy",
    appleKeyId: "dummy",
    applePrivateKeyPem: "dummy",
  }),
    instance(TakeOverSetting, "google", {
    type: 1,
    configurationPath: "https://accounts.google.com/.well-known/openid-configuration",
    clientId: "dummy",
    clientSecret: "dummy",
    doneEndpointUrl: "dummy",
  }),
  ],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.account.Namespace,
  bindings: {
        name: Bind.static("Account"),
        // Keep the issuing device's credentials valid after a transfer-code takeover.
        changePasswordIfTakeOver: Bind.static(false),
        ...Bind.nulls(
          "authenticationScript",
          "banScript",
          "createAccountScript",
          "createTakeOverScript",
          "doTakeOverScript",
          "unBanScript",
          "logSetting"
        ),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    TakeOverTypeModel,
  ],
}),
  ],
  userDataResources: [
    defineUserDataResource({
  model: GS2.account.TakeOver,
  linkedMaster: TakeOverTypeModel,
  existenceProperty: "hasTakeOver",
  bindings: {
        type: Bind.skip(),
        userId: Bind.skip(),
        userIdentifier: Bind.skip(),
      },
}),
    defineUserDataResource({
  model: GS2.account.TakeOver,
  mount: TransferCode,
  existenceProperty: "registered",
  bindings: {
        type: Bind.domainProperty(Source.direct(TransferCode, "id")),
        userIdentifier: Bind.domainProperties([Source.direct(TransferCode, "userIdentifier")]),
        userId: Bind.skip(),
      },
}),
  ],
});
