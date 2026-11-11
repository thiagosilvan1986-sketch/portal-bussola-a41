/** Nome curto do aparelho para a lista de avisos ("Android · Chrome"), a partir do texto que o navegador informa. */
export function deviceLabel(userAgent: string): string {
  const ua = userAgent || ''
  const system = /iPhone/i.test(ua)
    ? 'iPhone'
    : /iPad/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua))
      ? 'iPad'
      : /Android/i.test(ua)
        ? 'Android'
        : /Windows/i.test(ua)
          ? 'Windows'
          : /Macintosh|Mac OS X/i.test(ua)
            ? 'Mac'
            : /CrOS/i.test(ua)
              ? 'Chromebook'
              : /Linux/i.test(ua)
                ? 'Linux'
                : 'Aparelho'
  // A ordem importa: Edge, Opera e Samsung dizem "Chrome" também; no iPhone todos dizem "Safari".
  const browser = /EdgA?\/|Edg\//i.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/i.test(ua)
      ? 'Opera'
      : /SamsungBrowser/i.test(ua)
        ? 'Samsung Internet'
        : /Firefox|FxiOS/i.test(ua)
          ? 'Firefox'
          : /CriOS|Chrome/i.test(ua)
            ? 'Chrome'
            : /Safari/i.test(ua)
              ? 'Safari'
              : ''
  return browser ? `${system} · ${browser}` : system
}
