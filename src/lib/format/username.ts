/**
 * Derive access-log username from eng_name.
 * "Miss Jutamat  Siwakun" → "Jutamat.s"
 */
const TITLES = new Set(["miss", "mrs", "mr", "ms", "dr"]);

export function usernameFromEngName(engName: string | null | undefined): string | null {
  if (!engName) return null;
  const parts = engName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  let tokens = parts;
  if (tokens.length >= 2 && TITLES.has(tokens[0].toLowerCase())) {
    tokens = tokens.slice(1);
  }
  if (tokens.length === 0) return null;
  if (tokens.length === 1) return tokens[0];

  const given = tokens[0];
  const family = tokens[tokens.length - 1];
  const initial = family.charAt(0);
  if (!initial) return given;
  return `${given}.${initial.toLowerCase()}`;
}
