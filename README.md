# gs2-studio-package

GS2 Studio で利用する公式パッケージ定義とサンプルプロジェクトを管理するリポジトリです。

## 構成

- `index.json` - GS2 Studio の Simple Mode が表示・導入する機能の公開インデックス
- `<package-id>/dsl/index.ts` - パッケージ定義の source of truth
- `<package-id>/project.json` - GS2 Studio で読み込める生成済みプロジェクト
- `<package-id>/packages/<package-id>/` - 生成済みパッケージデータ
- `sample-*`, `rename-overlay-sample` - GS2 Studio の回帰検証用プロジェクト

`index.json` の `features[].id` は、対応するディレクトリ名および生成済み
`package.json` の `id` と一致させます。`dependsOn` は各パッケージの直接依存だけを
列挙します。

## 更新

このリポジトリは GS2 Studio の `packages/` submodule として参照されます。
DSL の materialize と整合性検査は、互換な GS2 Studio checkout から実行します。

```bash
git submodule update --init
npm run materialize:packages
npm run check:package-materialization
```

パッケージ側の変更を先にこのリポジトリへコミットし、その後 GS2 Studio 側で
submodule の参照コミットを更新してください。これにより、アプリへ同梱される
コンテンツと Simple Mode のインデックスが同じリビジョンに固定されます。
