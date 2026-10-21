/**
 * Derive access-log username from eng_name.
 * "MR. SIRICHAI  CHAYMANEE" → "sirichai.c"
 * "Miss Jutamat  Siwakun" → "jutamat.s"
 */
const ENGLISH_TITLES = new Set(["miss", "mrs", "mr", "ms", "dr"]);
const THAI_TITLES = new Set(["นาย", "นาง", "นางสาว"]);

function isEnglishTitleToken(token: string): boolean {
  return ENGLISH_TITLES.has(token.toLowerCase().replace(/\.+$/, ""));
}

function isThaiTitleToken(token: string): boolean {
  return THAI_TITLES.has(token);
}

/** Title glued to given name with a dot, e.g. "Mr.Sirichai" → "Sirichai". Needs the dot so "Drew" stays intact. */
function stripGluedEnglishTitle(token: string): string {
  const m = token.match(/^(?:miss|mrs|mr|ms|dr)\.(.+)$/i);
  return m ? m[1] : token;
}

export function usernameFromEngName(engName: string | null | undefined): string | null {
  if (!engName) return null;
  let tokens = engName.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  if (tokens.length >= 2 && (isEnglishTitleToken(tokens[0]) || isThaiTitleToken(tokens[0]))) {
    tokens = tokens.slice(1);
  } else {
    tokens = [stripGluedEnglishTitle(tokens[0]), ...tokens.slice(1)];
  }

  // Drop stray dots at token edges ("C." → "C") so the result never has "..", or a leading/trailing ".".
  tokens = tokens.map((t) => t.replace(/^\.+|\.+$/g, "")).filter(Boolean);
  if (tokens.length === 0) return null;
  if (tokens.length === 1) return tokens[0].toLowerCase();

  const given = tokens[0].toLowerCase();
  const initial = tokens[tokens.length - 1].charAt(0).toLowerCase();
  return `${given}.${initial}`;
}
