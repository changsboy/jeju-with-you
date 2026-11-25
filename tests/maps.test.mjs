import { test } from "node:test";
import assert from "node:assert/strict";
import { mapLinks, hasCoords, launchMap } from "../src/maps.js";
const a = { name: "출발", lat: 33.5, lng: 126.5 };
const b = { name: "도착 & 카페", lat: 33.4, lng: 126.4 };
test("verified coordinates form official routes; missing coordinates use search", () => {
  assert.equal(hasCoords({ lat: null, lng: 126 }), false);
  const n = mapLinks(a, b, "naver", "https://example.test");
  const url = new URL(n.app);
  assert.equal(url.host, "route");
  assert.equal(url.pathname, "/car");
  assert.equal(url.searchParams.get("sname"), "출발");
  assert.equal(url.searchParams.get("appname"), "https://example.test");
  assert.ok(
    !mapLinks(null, b, "naver", "https://example.test").app.includes("slat"),
  );
  assert.ok(
    mapLinks(a, b, "kakao", "https://example.test").app.startsWith(
      "kakaomap://route?sp=33.5,126.5&ep=33.4,126.4",
    ),
  );
  assert.equal(
    mapLinks({ name: "좌표 없음" }, b, "kakao", "https://example.test").kind,
    "search",
  );
  assert.equal(
    mapLinks(a, { name: "미확인" }, "naver", "https://example.test").kind,
    "search",
  );
});
test("app launch falls back to web unless browser goes into background", () => {
  let timer, listener;
  const visits = [];
  const doc = {
    hidden: false,
    addEventListener: (name, fn) => {
      listener = fn;
    },
    removeEventListener: () => {},
  };
  const win = {
    navigator: { userAgent: "iPhone" },
    location: { assign: (u) => visits.push(u) },
    setTimeout: (fn) => {
      timer = fn;
      return 1;
    },
    clearTimeout: () => {
      timer = null;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const links = mapLinks(a, b, "naver", "https://example.test");
  launchMap(links, win, doc);
  assert.equal(visits[0], links.app);
  timer();
  assert.equal(visits[1], links.web);
  launchMap(links, win, doc);
  doc.hidden = true;
  listener();
  assert.equal(timer, null);
});
