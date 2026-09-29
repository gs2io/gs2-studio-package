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
  // The generated TransferCode handler's `_type` defaults to 0, which is the
  // apple OIDC setting: a page that keyed the slot by anything but the
  // transfer code type would silently read another take-over.
  it("keys the page's TransferCode section by the transfer code take-over type", () => {
    const page = JSON.parse(
      readFileSync(resolve(liveDemoRoot, "page.json"), "utf8")
    ) as PageDeclaration;
    const transferCodeSections = Object.entries(page.sections).filter(
      ([sectionId]) => sectionId === "TransferCode" || sectionId.startsWith("TransferCode#")
    );

    expect(transferCodeSections).toHaveLength(1);
    const [, section] = transferCodeSections[0];
    // A single keyed read: the take-over list would carry the OIDC types too.
    expect(section.key).toEqual({ type: TRANSFER_CODE_TAKE_OVER_TYPE });
  });

  // The hand-written panel issues and uses codes under its own constant.
  it("issues and takes over transfer codes under the same take-over type", () => {
    const source = readFileSync(
      resolve(liveDemoRoot, "unity/Assets/Showroom/IdentityDemo.cs"),
      "utf8"
    );
    const declared = /public const int TakeOverType = (\d+);/.exec(source);

    expect(declared).not.toBeNull();
    expect(Number(declared![1])).toBe(TRANSFER_CODE_TAKE_OVER_TYPE);
  });
});
