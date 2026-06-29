const SENSITIVE_PATTERNS = [
  { pattern: /1[3-9]\d{9}/g, type: "phone" },
  { pattern: /[\w.-]+@[\w.-]+\.\w+/g, type: "email" },
  { pattern: /\d{17}[\dXx]/g, type: "idcard" },
  { pattern: /\b\d{16,19}\b/g, type: "bankcard" },
];

export interface SensitiveMatch {
  type: string;
  original: string;
  masked: string;
}

function maskSensitiveText(type: string, text: string): string {
  switch (type) {
    case "phone":
      return text.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
    case "email": {
      const [local, domain] = text.split("@");
      return local.slice(0, 2) + "***@" + domain;
    }
    case "idcard":
      return text.replace(/(\d{4})\d{10}(\d{4})/, "$1**********$2");
    case "bankcard":
      return text.replace(/(\d{4})\d+(\d{4})/, "$1****$2");
    default:
      return "****";
  }
}

export function detectSensitive(content: string): SensitiveMatch[] {
  const matches: SensitiveMatch[] = [];

  for (const { pattern, type } of SENSITIVE_PATTERNS) {
    pattern.lastIndex = 0;
    const found = content.match(pattern);
    pattern.lastIndex = 0;

    if (!found) continue;

    for (const text of found) {
      matches.push({
        type,
        original: text,
        masked: maskSensitiveText(type, text),
      });
    }
  }

  return matches;
}

export function hasSensitiveInfo(content: string): boolean {
  for (const { pattern } of SENSITIVE_PATTERNS) {
    pattern.lastIndex = 0;
    const found = pattern.test(content);
    pattern.lastIndex = 0;
    if (found) return true;
  }

  return false;
}

export function maskSensitiveContent(
  content: string,
  matches: readonly SensitiveMatch[] = detectSensitive(content)
): string {
  if (matches.length === 0) return content;

  return matches.reduce(
    (text, match) => text.replace(match.original, match.masked),
    content
  );
}
