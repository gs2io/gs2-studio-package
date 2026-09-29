/**
 * Regression test: the generated C# names the Ez types the Bind loaders really
 * return.
 *
 * `SendFriendRequestLoader` / `ReceiveFriendRequestLoader` and their array
 * loaders all yield `EzFriendRequest`; there is no `EzSendFriendRequest` or
 * `EzReceiveFriendRequest` in the Ez SDK. Codegen used to spell the type as
 * `Ez` + the catalog model name, which generated C# that does not compile in
 * Unity while every TypeScript gate stayed green. It now reads the type the
 * Bind surface records for each loader.
 *
 * The collection's per-item apply is matched on the same recorded type, so a
 * one-sided switch would silently turn `ApplyFriendFriendUserItemTo` into a
 * no-op; the apply call is pinned here too.
 *
 * The Friend collection exists because `friend::FriendUser` is listable, and
 * `FriendUserArrayLoader` defaults `withProfile` to `false`, so the collection
 * constructs it with the namespace alone rather than passing a string where
 * Bind takes `bool`.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { generateAllPackagesCSharp } from "~/application/codegen";
import { Result } from "~/domain/core";
import { PackageCollection } from "~/domain/package";
import { Project } from "~/domain/project";
import { loadPackages, unwrapLoaderResult } from "~/testing/applicationAdapters/projectFilesystem";
import { loadRealCatalog } from "~/testing/codegen/loadRealCatalog";

const currentDir = dirname(fileURLToPath(import.meta.url));

async function generateSocialGraphFiles(): Promise<ReadonlyMap<string, string>> {
  const catalog = loadRealCatalog();
  const loaded = unwrapLoaderResult(await loadPackages(resolve(currentDir, "packages"), catalog));
  const project = new Project(PackageCollection.fromTrusted(loaded.packages!));
  const generated = generateAllPackagesCSharp({ project, catalog });
  if (Result.isFailure(generated)) {
    throw new Error(`generateAllPackagesCSharp failed: ${generated.error.message}`);
  }
  const pkg = generated.value.succeeded.find(o => o.packageName === "foundation-social-graph");
  expect(pkg, "foundation-social-graph must generate").toBeDefined();
  return new Map(pkg!.artifacts.files.map(file => [file.fileName, file.content]));
}

describe("foundation-social-graph generated C# names the recorded Ez types", () => {
  it("never names an Ez type the SDK does not declare", async () => {
    const files = await generateSocialGraphFiles();

    for (const [fileName, content] of files) {
      expect(content, fileName).not.toContain("EzSendFriendRequest");
      expect(content, fileName).not.toContain("EzReceiveFriendRequest");
    }
    expect(files.get("SendFriendRequestBinder.cs")).toContain(
      "ApplyUserdataFriendSendFriendRequest(IMutableSendFriendRequest model, Gs2.Unity.Gs2Friend.Model.EzFriendRequest? source)"
    );
    expect(files.get("ReceiveFriendRequestBinderCollection.cs")).toContain(
      "IList<Gs2.Unity.Gs2Friend.Model.EzFriendRequest> items"
    );
  });

  it("applies each list item to its row through the loader that reads the same Ez type", async () => {
    const files = await generateSocialGraphFiles();

    expect(files.get("SendFriendRequestBinderCollection.cs")).toContain(
      "SendFriendRequestBinder.ApplyUserdataFriendSendFriendRequest(model, item);"
    );
    expect(files.get("ReceiveFriendRequestBinderCollection.cs")).toContain(
      "ReceiveFriendRequestBinder.ApplyUserdataFriendReceiveFriendRequest(model, item);"
    );
  });

  it("lists friends through FriendUserArrayLoader without a string withProfile argument", async () => {
    const files = await generateSocialGraphFiles();
    const collection = files.get("FriendBinderCollection.cs");

    expect(collection, "FriendBinderCollection.cs must be emitted").toBeDefined();
    expect(collection).toContain('new Gs2Bind.Gs2Friend.FriendUserArrayLoader("Friend")');
    expect(collection).not.toMatch(/FriendUserArrayLoader\("Friend", "[^"]*"\)/);
    expect(collection).toContain("FriendBinder.ApplyUserdataFriendFriendUser(model, item);");
  });
});
