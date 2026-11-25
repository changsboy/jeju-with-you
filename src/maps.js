export const hasCoords = (s) =>
  !!s &&
  ["lat", "lng"].every(
    (k, i) =>
      s[k] !== null &&
      s[k] !== undefined &&
      String(s[k]).trim() !== "" &&
      Number.isFinite(Number(s[k])) &&
      Math.abs(Number(s[k])) <= (i ? 180 : 90),
  );
export const mapSearch = (s, provider) => {
  const query = encodeURIComponent(
    `${s.address || "제주"} ${s.mapName || s.name}`,
  );
  return provider === "kakao"
    ? `https://map.kakao.com/link/search/${query}`
    : `https://map.naver.com/p/search/${query}`;
};
export function mapLinks(a, b, provider, appname, mode = "route") {
  if (!b) return null;
  const web = mapSearch(b, provider);
  const canRoute = mode === "route" && hasCoords(b) && (!a || hasCoords(a));
  if (provider === "naver") {
    const params = new URLSearchParams({ appname });
    if (canRoute) {
      params.set("dlat", b.lat);
      params.set("dlng", b.lng);
      params.set("dname", b.mapName || b.name);
      if (a) {
        params.set("slat", a.lat);
        params.set("slng", a.lng);
        params.set("sname", a.mapName || a.name);
      }
      return { app: `nmap://route/car?${params}`, web, kind: "route" };
    }
    params.set("query", `${b.address || "제주"} ${b.mapName || b.name}`);
    return { app: `nmap://search?${params}`, web, kind: "search" };
  }
  if (canRoute) {
    const query = `${a ? `sp=${a.lat},${a.lng}&` : ""}ep=${b.lat},${b.lng}&by=car`;
    return {
      app: `kakaomap://route?${query}`,
      web: `https://m.map.kakao.com/scheme/route?${query}`,
      kind: "route",
    };
  }
  return {
    app: `kakaomap://search?q=${encodeURIComponent(`${b.address || "제주"} ${b.mapName || b.name}`)}`,
    web,
    kind: "search",
  };
}
// Browser app detection is heuristic. Always also show an explicit web link.
export function launchMap(links, win = window, doc = document) {
  if (!links) return () => {};
  if (!/Android|iPhone|iPad|iPod/i.test(win.navigator.userAgent)) {
    win.location.assign(links.web);
    return () => {};
  }
  let timer;
  const cleanup = () => {
    win.clearTimeout(timer);
    doc.removeEventListener("visibilitychange", hidden);
    win.removeEventListener("pagehide", cleanup);
  };
  const hidden = () => {
    if (doc.hidden) cleanup();
  };
  doc.addEventListener("visibilitychange", hidden);
  win.addEventListener("pagehide", cleanup, { once: true });
  timer = win.setTimeout(() => {
    cleanup();
    if (!doc.hidden) win.location.assign(links.web);
  }, 1800);
  try {
    win.location.assign(links.app);
  } catch {
    cleanup();
    win.location.assign(links.web);
  }
  return cleanup;
}
