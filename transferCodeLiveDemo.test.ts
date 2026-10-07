import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { TRANSFER_CODE_TAKE_OVER_TYPE } from "./foundation-core-identity/dsl";

const liveDemoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "foundation-core-identity/live-demo"
);

interface PageDeclaration {
  readonly sections: Record<
    string,
    { readonly key?: Record<string, unknown>; readonly rows?: readonly unknown[] }
  >;
}

describe("transfer code live demo", () => {
  // An unconfigured handler uses type 0; pin the transfer type so the scene cannot read another take-over slot.
  it("keys the page's TransferCode section by the transfer code take-over type", () => {
    const page = JSON.parse(
      readFileSync(resolve(liveDemoRoot, "page.json"), "utf8")
    ) as PageDeclaration;
    const transferCodeSections = Object.entries(page.sections).filter(
      ([sectionId]) => sectionId === "TransferCode" || sectionId.startsWith("TransferCode#")
    );

    expect(transferCodeSections).toHaveLength(1);
    const [, section] = transferCodeSections[0];
    expect(section.key).toEqual({ type: TRANSFER_CODE_TAKE_OVER_TYPE });
  });

  it("issues and takes over transfer codes under the same take-over type", () => {
    const source = readFileSync(
      resolve(liveDemoRoot, "unity/Assets/Showroom/IdentityDemo.cs"),
      "utf8"
    );
    const declared = /public const int TakeOverType = (\d+);/.exec(source);

    expect(declared).not.toBeNull();
    expect(Number(declared![1])).toBe(TRANSFER_CODE_TAKE_OVER_TYPE);
  });

  it("reads the remembered account back under the scene's account store keys", () => {
    const source = readFileSync(
      resolve(liveDemoRoot, "unity/Assets/Showroom/IdentityDemo.cs"),
      "utf8"
    );
    const scene = readFileSync(resolve(liveDemoRoot, "unity/Assets/Scenes/Showroom.unity"), "utf8");
    const prefixes = [...scene.matchAll(/^ {2}_keyPrefix: (\S+)$/gm)].map(match => match[1]);

    expect(prefixes).toHaveLength(1);
    expect(source).toContain(`RememberedUserIdKey = "${prefixes[0]}.userId"`);
    expect(source).toContain(`RememberedPasswordKey = "${prefixes[0]}.password"`);
  });
});
