const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function partsInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number.parseInt(parts.find((part) => part.type === type)?.value ?? "", 10);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

export function localDateTimeToUtc(value: string, timeZone = "Europe/Brussels"): Date {
  const match = LOCAL_DATE_TIME.exec(value.trim());
  if (!match) throw new Error("INVALID_LOCAL_DATE_TIME");
  const desired = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? 0),
  };
  const desiredAsUtc = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
    desired.second
  );
  let guess = desiredAsUtc;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const displayed = partsInZone(new Date(guess), timeZone);
    const displayedAsUtc = Date.UTC(
      displayed.year,
      displayed.month - 1,
      displayed.day,
      displayed.hour,
      displayed.minute,
      displayed.second
    );
    const correction = desiredAsUtc - displayedAsUtc;
    guess += correction;
    if (correction === 0) break;
  }

  const result = new Date(guess);
  const roundTrip = partsInZone(result, timeZone);
  if (Object.keys(desired).some((key) => roundTrip[key as keyof typeof desired] !== desired[key as keyof typeof desired])) {
    throw new Error("NON_EXISTENT_LOCAL_DATE_TIME");
  }
  return result;
}
