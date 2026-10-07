/** Catalog model names can differ from SDK Ez types; use the shipped Bind surface so fixtures reflect actual loader results. */
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
      'new Gs2Bind.Gs2Friend.SendFriendRequestLoader("Friend", _model.Id)'
    );
    expect(files.get("ReceiveFriendRequestBinderCollection.cs")).toContain(
      "IList<Gs2.Unity.Gs2Friend.Model.EzFriendRequest> items"
    );
  });

  it("keys friend request rows by the other player's id and never reads a request profile", async () => {
    const files = await generateSocialGraphFiles();

    expect(files.get("SendFriendRequestBinderCollection.cs")).toContain(
      "new SendFriendRequestId(item.TargetUserId)"
    );
    expect(files.get("ReceiveFriendRequestBinderCollection.cs")).toContain(
      "new ReceiveFriendRequestId(item.UserId)"
    );
    for (const fileName of [
      "SendFriendRequest.cs",
      "SendFriendRequestBinder.cs",
      "SendFriendRequestBinderCollection.cs",
      "ReceiveFriendRequest.cs",
      "ReceiveFriendRequestBinder.cs",
      "ReceiveFriendRequestBinderCollection.cs",
    ]) {
      const content = files.get(fileName);
      expect(content, `${fileName} must be emitted`).toBeDefined();
      expect(content, fileName).not.toContain("PublicProfile");
    }
  });

  it.each([
    ["Friend", "FriendUser"],
    ["Follow", "FollowUser"],
  ])(
    "loads %s profiles by passing withProfile: true to every %s loader",
    async (typeName, modelName) => {
      const files = await generateSocialGraphFiles();
      const collection = files.get(`${typeName}BinderCollection.cs`);
      const binder = files.get(`${typeName}Binder.cs`);

      expect(collection, `${typeName}BinderCollection.cs must be emitted`).toBeDefined();
      expect(collection).toContain(
        `var arrayLoader = new Gs2Bind.Gs2Friend.${modelName}ArrayLoader("Friend", withProfile: true);`
      );
      expect(collection).toContain(
        `new Gs2Bind.Gs2Friend.${modelName}ArrayLoader("Friend", withProfile: true).Invalidate(_gs2, _session);`
      );
      expect(collection).not.toMatch(new RegExp(`${modelName}ArrayLoader\\("Friend"\\)`));
      expect(collection).toContain(
        `${typeName}Binder.ApplyUserdataFriend${modelName}(model, item);`
      );
      expect(binder).toContain(
        `new Gs2Bind.Gs2Friend.${modelName}Loader("Friend", _model.Id, withProfile: true)`
      );
      expect(binder).toContain("model.PublicProfile = source.PublicProfile;");
    }
  );
});
