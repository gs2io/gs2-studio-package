import type { LocalizedDisplaySnapshotDto } from "~/contracts/domainType/LocalizedDisplaySnapshotDto";

type LocalizedUnit = string | { readonly ja: string; readonly en: string };

export function jaEnField(
  jaLabel: string,
  enLabel: string,
  jaDescription: string,
  enDescription: string,
  unit?: LocalizedUnit
): LocalizedDisplaySnapshotDto {
  const jaUnit = typeof unit === "string" ? unit : unit?.ja;
  const enUnit = typeof unit === "string" ? unit : unit?.en;
  return {
    ja: {
      label: jaLabel,
      description: jaDescription,
      ...(jaUnit === undefined ? {} : { unit: jaUnit }),
    },
    en: {
      label: enLabel,
      description: enDescription,
      ...(enUnit === undefined ? {} : { unit: enUnit }),
    },
  };
}

export function jaEnId(jaSubject: string, enSubject: string): LocalizedDisplaySnapshotDto {
  return jaEnField(
    "ID",
    "ID",
    `${jaSubject}を一意に識別します。`,
    `Uniquely identifies the ${enSubject}.`
  );
}
