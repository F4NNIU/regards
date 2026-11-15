import { describe, expect, it } from "vitest";
// @ts-expect-error a build script, without types
import { manifest } from "../scripts/update-manifest.mjs";

const base = "https://github.com/lucienPochon/regards/releases/download/v0.4.0";
const signatures = {
  "Regards_0.4.0_x64-setup.exe.sig": "win\n",
  "Regards_0.4.0_aarch64.app.tar.gz.sig": "arm",
  "Regards_0.4.0_x64.app.tar.gz.sig": "intel",
  "Regards_0.4.0_amd64.AppImage.sig": "appimage",
  "Regards_0.4.0_amd64.deb.sig": "deb",
  "Regards-0.4.0-1.x86_64.rpm.sig": "rpm",
};

describe("the update manifest of a release", () => {
  it("names each system's file and signature", () => {
    const made = manifest(signatures, "v0.4.0", `${base}/`, new Date("2026-12-01T10:00:00Z"));
    expect(made.version).toBe("0.4.0");
    expect(made.pub_date).toBe("2026-12-01T10:00:00.000Z");
    expect(made.platforms["windows-x86_64"]).toEqual({ signature: "win", url: `${base}/Regards_0.4.0_x64-setup.exe` });
    expect(made.platforms["windows-x86_64-nsis"]).toEqual(made.platforms["windows-x86_64"]);
    expect(made.platforms["darwin-aarch64"].url).toBe(`${base}/Regards_0.4.0_aarch64.app.tar.gz`);
    expect(made.platforms["darwin-x86_64-app"].signature).toBe("intel");
    // A copy from a package asks for its own kind; the short name is the AppImage.
    expect(made.platforms["linux-x86_64"].signature).toBe("appimage");
    expect(made.platforms["linux-x86_64-deb"].url).toBe(`${base}/Regards_0.4.0_amd64.deb`);
    expect(made.platforms["linux-x86_64-rpm"].url).toBe(`${base}/Regards-0.4.0-1.x86_64.rpm`);
  });

  it("does without the packages, but not without a system", () => {
    const { "Regards_0.4.0_amd64.deb.sig": _deb, "Regards-0.4.0-1.x86_64.rpm.sig": _rpm, ...needed } = signatures;
    expect(Object.keys(manifest(needed, "0.4.0", base).platforms)).not.toContain("linux-x86_64-deb");
    const { "Regards_0.4.0_x64.app.tar.gz.sig": _intel, ...noIntel } = signatures;
    expect(() => manifest(noIntel, "0.4.0", base)).toThrow("no signed file for darwin-x86_64");
  });

  it("refuses two files for one system", () => {
    expect(() => manifest({ ...signatures, "Other_x64-setup.exe.sig": "x" }, "0.4.0", base)).toThrow("two files for");
  });
});
