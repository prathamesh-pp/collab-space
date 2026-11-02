const COLOR_SATURATION = 72;
const COLOR_LIGHTNESS = 36;

function hslToHex(hue: number, saturation: number, lightness: number) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const segment = hue / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  const [red, green, blue] = segment < 1
    ? [chroma, secondary, 0]
    : segment < 2
      ? [secondary, chroma, 0]
      : segment < 3
        ? [0, chroma, secondary]
        : segment < 4
          ? [0, secondary, chroma]
          : segment < 5
            ? [secondary, 0, chroma]
            : [chroma, 0, secondary];
  const match = lightness - chroma / 2;
  return `#${[red, green, blue]
    .map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function getPresenceColor(userId: string): string {
  let hash = 2166136261;
  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hslToHex((hash >>> 0) % 360, COLOR_SATURATION / 100, COLOR_LIGHTNESS / 100);
}

export function getPresenceInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return (words.length === 1
    ? words[0].slice(0, 2)
    : `${words[0][0]}${words[words.length - 1][0]}`
  ).toLocaleUpperCase();
}

export type RemotePresenceUser = { clientId: number; name: string; color: string };

export function getRemotePresenceUsers(
  states: ReadonlyMap<number, unknown>,
  ownClientId: number,
): RemotePresenceUser[] {
  const users: RemotePresenceUser[] = [];
  for (const [clientId, state] of states) {
    if (clientId === ownClientId || !state || typeof state !== "object") continue;
    const user = (state as { user?: { name?: unknown; color?: unknown } }).user;
    if (typeof user?.name !== "string" || typeof user.color !== "string") continue;
    users.push({ clientId, name: user.name, color: user.color });
  }
  return users.sort((left, right) => left.name.localeCompare(right.name));
}
