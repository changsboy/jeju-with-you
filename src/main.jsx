import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Heart,
  MapPin,
  Navigation,
  ImagePlus,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Pencil,
  Check,
  X,
  LockKeyhole,
  Camera,
  LogOut,
  RefreshCcw,
  Copy,
  Car,
  ShoppingBag,
  Route,
  ChevronDown,
} from "lucide-react";

import "./style.css";
import { hasCoords, mapSearch, mapLinks, launchMap } from "./maps";

const endpoint = (action, params = "") =>
  `/.netlify/functions/api?action=${action}${params}`;
async function api(action, method = "GET", value) {
  const res = await fetch(endpoint(action), {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: value ? JSON.stringify(value) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body.error || "연결에 실패했어요.");
    error.status = res.status;
    throw error;
  }
  return body;
}
const uid = () =>
  globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const photo = (p) =>
  p?.startsWith("uploaded:")
    ? endpoint("photo", `&path=${encodeURIComponent(p.slice(9))}`)
    : endpoint(
        "stock",
        `&name=${encodeURIComponent((p || "/photos/cafe.webp").split("/").pop())}`,
      );
const stamp = () =>
  new Date().toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
async function compress(file) {
  return await new Promise((resolve, reject) => {
    const img = new Image();
    const u = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement("canvas");
      const scale = Math.min(1, 1440 / Math.max(img.width, img.height));
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(
        async (blob) => {
          URL.revokeObjectURL(u);
          if (!blob) return reject(new Error("사진을 처리할 수 없어요."));
          const r = new FileReader();
          r.onload = () =>
            resolve({
              base64: String(r.result).split(",")[1],
              type: blob.type,
            });
          r.onerror = reject;
          r.readAsDataURL(blob);
        },
        "image/webp",
        0.78,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(u);
      reject(new Error("사진이 열리지 않아요."));
    };
    img.src = u;
  });
}
function App() {
  const [authed, setAuthed] = useState(null),
    [pass, setPass] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [data, setData] = useState(null),
    [day, setDay] = useState(0),
    [editing, setEditing] = useState(false),
    [menu, setMenu] = useState("schedule");
  const [form, setForm] = useState(null),
    [detail, setDetail] = useState(null),
    [undo, setUndo] = useState(null),
    [notice, setNotice] = useState(""),
    [provider, setProvider] = useState("kakao"),
    [origin, setOrigin] = useState("current"),
    [dest, setDest] = useState(""),
    [loadingImg, setLoadingImg] = useState("");
  const [fileRef] = [useRef(null)],
    [photoTarget, setPhotoTarget] = useState(null),
    [savedAt, setSavedAt] = useState(""),
    [saving, setSaving] = useState(false),
    [revision, setRevision] = useState(null),
    [dirty, setDirty] = useState(false);
  const [shareText, setShareText] = useState("");
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  const update = (fn) => {
    setDirty(true);
    setData((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  };
  async function loadState() {
    const r = await api("state");
    setData(r.data);
    dataRef.current = r.data;
    setRevision(r.revision);
    setDirty(false);
    setUndo(null);
    return r;
  }
  useEffect(() => {
    loadState()
      .then(() => setAuthed(true))
      .catch((e) => {
        setAuthed(false);
        if (e.status !== 401) setError(e.message);
      });
  }, []);
  useEffect(() => {
    if (!authed || dirty || editing || form || busy || saving || loadingImg)
      return;
    let active = true;
    const timer = setInterval(() => {
      api("state")
        .then((r) => {
          if (active) {
            setData(r.data);
            setRevision(r.revision);
          }
        })
        .catch((e) => {
          if (e.status === 401) setAuthed(false);
        });
    }, 45000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [authed, dirty, editing, form, busy, saving, loadingImg]);
  useEffect(() => {
    const warn = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function login(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("login", "POST", { password: pass });
      await loadState();
      setAuthed(true);
      setPass("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function save(next = data) {
    setSaving(true);
    try {
      const r = await api("state", "PUT", { data: next, revision });
      setRevision(r.revision);
      setDirty(false);
      setSavedAt(stamp());
      setEditing(false);
      setForm(null);
      setError("");
      return true;
    } catch (e) {
      setError(e.message);
      if (e.status === 401) setAuthed(false);
      return false;
    } finally {
      setSaving(false);
    }
  }
  async function reload() {
    if (dirty && !confirm("저장하지 않은 변경을 버리고 최신 일정을 불러올까?"))
      return;
    try {
      await loadState();
      setEditing(false);
      setForm(null);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  async function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return alert("이미지 파일을 골라줘.");
    setLoadingImg(photoTarget || "hero");
    try {
      const payload = await compress(file);
      const r = await api("upload", "POST", payload);
      const next = structuredClone(dataRef.current);
      if (photoTarget === "hero") next.hero = `uploaded:${r.path}`;
      else {
        const found = next.days
          .flatMap((d) => d.stops)
          .find((s) => s.id === photoTarget);
        if (found) found.image = `uploaded:${r.path}`;
      }
      setDirty(true);
      setData(next);
      await save(next);
    } catch (e) {
      alert("업로드 실패: " + e.message);
    } finally {
      setLoadingImg("");
      setPhotoTarget(null);
    }
  }
  const selected = data?.days[day] || data?.days[0];
  const stops = selected?.stops || [];
  const shopping = data?.shopping || [];
  const shoppingDone = data?.shoppingDone || [];
  function updateStop(id, change) {
    update((d) => {
      const s = d.days[day].stops.find((s) => s.id === id);
      Object.assign(s, change);
    });
  }
  function move(id, delta) {
    update((d) => {
      const a = d.days[day].stops;
      const i = a.findIndex((s) => s.id === id);
      const j = i + delta;
      if (j < 0 || j >= a.length) return;
      [a[i], a[j]] = [a[j], a[i]];
    });
  }
  function remove(id) {
    const index = stops.findIndex((s) => s.id === id);
    setUndo({
      date: selected.date,
      index,
      stop: structuredClone(stops[index]),
    });
    update((d) => {
      d.days[day].stops = d.days[day].stops.filter((s) => s.id !== id);
    });
    setNotice("장소를 삭제했어요. 되돌릴 수 있어요.");
  }
  function undoRemove() {
    if (!undo) return;
    update((d) => {
      const target = d.days.find((x) => x.date === undo.date);
      if (target && !target.stops.some((x) => x.id === undo.stop.id))
        target.stops.splice(
          Math.min(undo.index, target.stops.length),
          0,
          undo.stop,
        );
    });
    setUndo(null);
    setNotice("장소를 복원했어요. 변경 저장을 눌러주세요.");
  }
  function today() {
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const i = data.days.findIndex((d) => date === `2026-11-${d.date}`);
    setDay(i < 0 ? 0 : i);
    setMenu("schedule");
    if (i < 0)
      setNotice("여행 기간은 11월 26–29일이에요. 첫날 일정을 열었어요.");
  }
  function nextStop() {
    const next = stops.find((s) => !s.visited);
    if (!next) return setNotice("이 날의 모든 장소를 다녀왔어요.");
    setOrigin("current");
    setDest(next.id);
    setMenu("route");
  }
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("복사했어요.");
    } catch {
      setNotice(
        "자동 복사가 지원되지 않아요. 아래 내용을 선택해 복사해 주세요.",
      );
      setShareText(text);
    }
  }
  function itineraryText() {
    return data.days
      .map(
        (d) =>
          `11.${d.date} ${d.weekday} · ${d.theme}\n` +
          d.stops
            .map(
              (s) =>
                `${s.visited ? "✓ " : "• "}${s.time} ${s.name}${s.note ? " — " + s.note : ""}`,
            )
            .join("\n"),
      )
      .join("\n\n");
  }
  async function share() {
    const text = itineraryText();
    try {
      if (navigator.share)
        await navigator.share({ title: "Jeju, with you", text });
      else await copyText(text);
    } catch (e) {
      if (e.name !== "AbortError")
        setError("공유하지 못했어요. 일정 복사를 이용해 주세요.");
    }
  }
  async function deletePhoto(target) {
    if (!confirm("이 사진을 삭제하고 기본 이미지로 바꿀까?")) return;
    const next = structuredClone(data);
    const old =
      target === "hero"
        ? next.hero
        : next.days.flatMap((d) => d.stops).find((s) => s.id === target)?.image;
    if (target === "hero") next.hero = "/photos/oreum.webp";
    else
      next.days.flatMap((d) => d.stops).find((s) => s.id === target).image =
        "/photos/cafe.webp";
    setData(next);
    setDirty(true);
    if (await save(next)) {
      if (old?.startsWith("uploaded:"))
        try {
          await api("deletePhoto", "POST", { path: old.slice(9) });
        } catch (e) {
          setError(
            "사진 표시는 삭제했지만 저장소 정리는 실패했어요: " + e.message,
          );
        }
      setUndo(null);
    }
  }

  function beginAdd() {
    setForm({
      id: uid(),
      name: "",
      time: "",
      type: "관광",
      note: "",
      address: "",
      lat: "",
      lng: "",
      image: "/photos/cafe.webp",
      _new: true,
    });
  }
  function finishForm() {
    if (
      ["lat", "lng"].some(
        (k) =>
          form[k] !== "" &&
          (!Number.isFinite(Number(form[k])) ||
            Math.abs(Number(form[k])) > (k === "lat" ? 90 : 180)),
      )
    )
      return alert("올바른 위도·경도를 입력해 줘.");
    if (!form.name.trim()) return alert("장소 이름을 입력해 줘.");
    update((d) => {
      const a = d.days[day].stops;
      if (form._new) a.push({ ...form, _new: undefined });
      else {
        const i = a.findIndex((s) => s.id === form.id);
        if (i >= 0) a[i] = { ...form, _new: undefined };
      }
    });
    setForm(null);
    setEditing(true);
  }
  async function logout() {
    if (dirty && !confirm("저장하지 않은 변경이 있어요. 로그아웃할까?")) return;
    try {
      await api("logout", "POST");
      setAuthed(false);
      setData(null);
      setDirty(false);
      setDetail(null);
      setUndo(null);
      setShareText("");
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  const input = (label, key, placeholder = "") => (
    <label className="inputrow">
      <span>{label}</span>
      <input
        value={form[key] || ""}
        onChange={(e) => {
          const value = e.target.value;
          setForm((f) => ({
            ...f,
            [key]: value,
            ...(["name", "address"].includes(key)
              ? {
                  lat: "",
                  lng: "",
                  mapName: "",
                  locationSource: "",
                  locationCheckedAt: "",
                }
              : {}),
          }));
        }}
        placeholder={placeholder}
      />
    </label>
  );
  const openMap = (s) => setDetail(s.id);
  const detailStop = data?.days
    .flatMap((d) => d.stops)
    .find((s) => s.id === detail);
  const links = mapLinks(
    stops.find((s) => s.id === origin),
    stops.find((s) => s.id === dest),
    provider,
    window.location.origin,
  );
  if (authed === null)
    return (
      <div className="loading">
        jeju, with you ♡<small>여행 기록 여는 중...</small>
      </div>
    );
  if (!authed)
    return (
      <main className="gate">
        <div className="gate-photo" />
        <div className="gate-panel">
          <div className="eyebrow">PRIVATE TRAVEL JOURNAL · 2026</div>
          <h1>
            Jeju,
            <br />
            <em>with you.</em>
          </h1>
          <p>우리 둘만의 제주 여행 기록 ♡</p>
          <form onSubmit={login}>
            <label>둘만 아는 비밀번호</label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="비밀번호 입력"
            />
            <button disabled={busy} className="primary">
              {busy ? "확인 중..." : "우리 여행 열기 →"}
            </button>
            {error && <p className="err">{error}</p>}
          </form>
          <small>
            이 기기에서 30일간 로그인 상태가 유지돼요.
            <br />
            네이버 앱과 크롬은 각각 한 번씩 로그인해야 할 수 있어요.
          </small>
        </div>
      </main>
    );
  return (
    <div className="app">
      <header className="top">
        <button className="brand" onClick={() => setMenu("schedule")}>
          jeju, <b>with you.</b> ♡
        </button>
        <div className="topright">
          <span>26—29 NOV 2026</span>
          <button className="iconbtn" title="로그아웃" onClick={logout}>
            <LogOut size={17} />
          </button>
        </div>
      </header>
      <main className="wrap">
        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {undo && (
          <button className="quiet" onClick={undoRemove}>
            삭제 취소 · {undo.stop.name}
          </button>
        )}
        <div className="syncbar">
          <button
            className="quiet"
            onClick={reload}
            disabled={saving || !!loadingImg}
          >
            <RefreshCcw size={15} /> 최신 일정 불러오기
          </button>
          {dirty && (
            <button
              className="primary"
              onClick={() => save()}
              disabled={saving}
            >
              {saving ? "저장 중…" : "변경 저장"}
            </button>
          )}
        </div>
        <div className="trip-tools">
          <button onClick={today}>오늘 일정</button>
          <button onClick={nextStop}>다음 장소로 이동</button>
          <button onClick={share}>일정 공유</button>
          <button onClick={() => copyText(itineraryText())}>일정 복사</button>
        </div>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">OUR LITTLE JEJU STORY / VOL. 01</div>
            <h1>
              우리의
              <br />
              제주<span>♡</span>
            </h1>
            <p>2026.11.26 — 11.29 · 3박 4일</p>
            <div className="tiny">{data.note}</div>
            <button
              className="quiet"
              onClick={() => {
                setPhotoTarget("hero");
                fileRef.current?.click();
              }}
            >
              <Camera size={15} /> 메인 사진 바꾸기
            </button>
            {data.hero.startsWith("uploaded:") && (
              <button className="quiet" onClick={() => deletePhoto("hero")}>
                메인 사진 삭제
              </button>
            )}
          </div>
          <div className="hero-visual">
            <img src={photo(data.hero)} alt="제주 여행 메인 사진" />
            <span>somewhere in Jeju · with you.</span>
          </div>
        </section>
        <nav className="tabs">
          <button
            className={menu === "schedule" ? "active" : ""}
            onClick={() => setMenu("schedule")}
          >
            일정
          </button>
          <button
            className={menu === "route" ? "active" : ""}
            onClick={() => {
              setMenu("route");
              setDetail(null);
            }}
          >
            길찾기
          </button>
          <button
            className={menu === "shopping" ? "active" : ""}
            onClick={() => setMenu("shopping")}
          >
            장보기
          </button>
        </nav>
        {menu === "schedule" && (
          <>
            <div className="sectionhead">
              <div>
                <span className="eyebrow">OUR ITINERARY</span>
                <h2>하루씩, 우리 페이스로.</h2>
              </div>
              <span className="muted">
                일정 수정 후 저장하면 둘 다 보게 돼요.
              </span>
            </div>
            <div className="daytabs">
              {data.days.map((d, i) => (
                <button
                  key={d.date}
                  className={day === i ? "current" : ""}
                  onClick={() => {
                    setDay(i);
                  }}
                >
                  <small>{d.weekday}</small>
                  <strong>11.{d.date}</strong>
                </button>
              ))}
            </div>
            <div className="board">
              <section className="itinerary">
                <div className="daytitle">
                  <div>
                    <span className="eyebrow">
                      DAY 0{day + 1} / {selected.weekday}
                    </span>
                    <h2>{selected.theme}</h2>
                    <p>{selected.subtitle}</p>
                  </div>
                  <button
                    className={editing ? "editbtn on" : "editbtn"}
                    onClick={() => (editing ? save() : setEditing(true))}
                    disabled={saving}
                  >
                    {editing ? (
                      <>
                        <Check size={16} />
                        {saving ? "저장 중" : "저장하기"}
                      </>
                    ) : (
                      <>
                        <Pencil size={16} /> 일정 편집
                      </>
                    )}
                  </button>
                </div>
                <div className="cards">
                  {stops.map((s, i) => (
                    <article
                      className={`stop ${s.visited ? "visited" : ""}`}
                      key={s.id}
                    >
                      <div className="stop-image">
                        <img src={photo(s.image)} alt={s.name} />
                        <button
                          className="imgbtn"
                          onClick={() => {
                            setPhotoTarget(s.id);
                            fileRef.current?.click();
                          }}
                          title="사진 바꾸기"
                        >
                          <ImagePlus size={15} />
                        </button>
                      </div>
                      <div className="stop-main">
                        <div className="stop-meta">
                          <span>{s.time}</span>
                          <span>{s.type}</span>
                        </div>
                        <h3>
                          <button
                            className="place-title"
                            onClick={() => setDetail(s.id)}
                          >
                            {s.name}
                          </button>
                        </h3>
                        {s.note && <p>{s.note}</p>}
                        <label className="visit-check">
                          <input
                            type="checkbox"
                            checked={!!s.visited}
                            onChange={(e) =>
                              updateStop(s.id, { visited: e.target.checked })
                            }
                          />{" "}
                          방문 완료
                        </label>
                        <div className="stop-actions">
                          <button onClick={() => openMap(s)}>
                            <MapPin size={14} /> 지도
                          </button>
                        </div>
                      </div>
                      {editing && (
                        <div className="edits">
                          <button onClick={() => move(s.id, -1)} title="위로">
                            <ArrowUp size={15} />
                          </button>
                          <button onClick={() => move(s.id, 1)} title="아래로">
                            <ArrowDown size={15} />
                          </button>
                          <button
                            onClick={() => setForm({ ...s })}
                            title="수정"
                          >
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => remove(s.id)} title="삭제">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
                {editing && (
                  <div className="editing-footer">
                    <button className="add" onClick={beginAdd}>
                      <Plus size={17} /> 장소 추가
                    </button>
                    <button
                      onClick={() => save()}
                      disabled={saving}
                      className="primary"
                    >
                      변경 저장
                    </button>
                  </div>
                )}
                <p className="savehint">
                  {savedAt ? `${savedAt} 저장 완료 · ` : ""}사진은 분위기용
                  이미지예요. 직접 찍은 사진으로 교체할 수 있어요.
                </p>
              </section>
            </div>
          </>
        )}
        {menu === "route" && (
          <section className="route-page">
            <span className="eyebrow">ON THE ROAD</span>
            <h2>지금, 어디로 갈까?</h2>
            <p className="muted">
              일정 장소를 선택하고 지도 앱에서 길찾기를 열어봐.
            </p>
            <div className="routebox">
              <label>날짜</label>
              <select
                value={day}
                onChange={(e) => {
                  setDay(+e.target.value);
                  setOrigin("current");
                  setDest("");
                }}
              >
                {data.days.map((d, i) => (
                  <option key={i} value={i}>
                    11.{d.date} {d.weekday}
                  </option>
                ))}
              </select>
              <label>출발지</label>
              <select
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
              >
                <option value="current">현재 위치 / 목적지만 선택</option>
                {stops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <label>도착지</label>
              <select value={dest} onChange={(e) => setDest(e.target.value)}>
                <option value="">목적지 선택</option>
                {stops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <label>지도 앱</label>
              <div className="provider">
                <button
                  className={provider === "kakao" ? "chosen" : ""}
                  onClick={() => setProvider("kakao")}
                >
                  카카오맵
                </button>
                <button
                  className={provider === "naver" ? "chosen" : ""}
                  onClick={() => setProvider("naver")}
                >
                  네이버지도
                </button>
              </div>
              <button
                className="primary"
                disabled={!dest || origin === dest}
                onClick={() => launchMap(links)}
              >
                <Navigation size={17} /> 지도 앱으로 열기
              </button>
              <a className="quiet" href={links?.web} hidden={!links}>
                웹 지도로 열기
              </a>
              <p className="mapnote">
                {links?.kind === "route"
                  ? "등록된 좌표로 자동차 경로를 열어요."
                  : "좌표가 없는 장소는 이름·주소 검색으로 연결돼요. 검색 결과에서 출발지와 도착지를 확인해 주세요."}{" "}
                앱이 열리지 않으면 웹 지도로 전환해요.
              </p>
            </div>
          </section>
        )}
        {menu === "shopping" && (
          <section className="route-page">
            <span className="eyebrow">FRIDAY NIGHT</span>
            <h2>흑돼지 바비큐 장보기</h2>
            <p className="muted">한림 하나로마트 · 금요일 저녁을 위한 준비</p>
            <div className="shoplist">
              {shopping.map((s) => (
                <label key={s}>
                  <input
                    type="checkbox"
                    checked={shoppingDone.includes(s)}
                    onChange={(e) =>
                      update((d) => {
                        d.shoppingDone = e.target.checked
                          ? [...(d.shoppingDone || []), s]
                          : (d.shoppingDone || []).filter((t) => t !== s);
                      })
                    }
                  />
                  <span>{s}</span>
                </label>
              ))}
            </div>
            <button
              className="primary"
              onClick={() =>
                copyText(
                  shopping
                    .map((s) => (shoppingDone.includes(s) ? "✓ " : "□ ") + s)
                    .join("\n"),
                )
              }
            >
              <Copy size={16} /> 목록 복사
            </button>
            <p className="mapnote">
              체크한 후 변경 저장을 누르면 함께 볼 수 있어. 장보기 전에 그릴
              이용 신청도 확인해줘.
            </p>
          </section>
        )}
      </main>
      <footer>JEJU, WITH YOU · OUR PRIVATE TRAVEL JOURNAL ♡</footer>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={upload}
      />
      {(loadingImg || saving) && (
        <div className="overlay busy-overlay" role="status">
          <div className="modal small">
            {loadingImg ? "사진 처리 중…" : "변경 저장 중…"}
          </div>
        </div>
      )}
      {shareText && (
        <div className="overlay">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="일정 복사"
          >
            <button onClick={() => setShareText("")}>닫기</button>
            <textarea
              readOnly
              value={shareText}
              onFocus={(e) => e.target.select()}
              rows={14}
            />
          </div>
        </div>
      )}
      {detailStop && (
        <div className="overlay">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="장소 상세"
          >
            <div className="modal-top">
              <h3>{detailStop.name}</h3>
              <button onClick={() => setDetail(null)} aria-label="상세 닫기">
                <X />
              </button>
            </div>
            <img
              className="detail-image"
              src={photo(detailStop.image)}
              alt={detailStop.name}
            />
            <p>
              {detailStop.time} · {detailStop.type}
            </p>
            <p>{detailStop.note || "아직 메모가 없어요."}</p>
            <p>
              {detailStop.address ||
                "주소 미확인 · 지도 검색에서 확인해 주세요."}
            </p>
            {detailStop.locationSource?.startsWith("https://") && (
              <a
                href={detailStop.locationSource}
                target="_blank"
                rel="noreferrer"
              >
                위치 정보 출처
              </a>
            )}
            <small>
              {hasCoords(detailStop)
                ? "좌표 등록됨"
                : "좌표 미확인 · 장소 검색으로 연결됩니다."}
            </small>
            <div className="provider">
              {["kakao", "naver"].map((p) => (
                <a
                  key={p}
                  className="quiet"
                  href={mapSearch(detailStop, p)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {p === "kakao" ? "카카오맵" : "네이버지도"}에서 보기
                </a>
              ))}
            </div>
            <button
              className="primary"
              onClick={() => {
                setDest(detailStop.id);
                setOrigin("current");
                setMenu("route");
                setDetail(null);
              }}
            >
              이 장소로 길찾기
            </button>
            <button
              className="quiet"
              onClick={() => {
                setPhotoTarget(detailStop.id);
                fileRef.current?.click();
              }}
            >
              사진 바꾸기
            </button>
            {detailStop.image.startsWith("uploaded:") && (
              <button
                className="quiet"
                onClick={() => deletePhoto(detailStop.id)}
              >
                사진 삭제
              </button>
            )}
          </div>
        </div>
      )}
      {form && (
        <div className="overlay">
          <div className="modal">
            <div className="modal-top">
              <h3>{form._new ? "새 장소 추가" : "장소 수정"}</h3>
              <button className="iconbtn" onClick={() => setForm(null)}>
                <X size={20} />
              </button>
            </div>
            {input("시간", "time", "예: 14:30")}
            {input("장소 이름", "name", "예: 카페 베릴")}
            {input("분류", "type", "카페 / 관광 / 식사")}
            {input("주소", "address", "정확한 주소를 입력하면 검색이 쉬워요")}
            {input("메모", "note", "웨이팅, 주차 등")}
            <div className="coords">
              <p>좌표 (선택 · 정확한 카카오맵 경로용)</p>
              <div>
                {input("위도", "lat", "33.0000")}
                {input("경도", "lng", "126.0000")}
              </div>
              <small>
                장소 이름·주소를 바꾸면 기존 좌표가 초기화돼요. 정확한 값을
                모르면 비워두세요.
              </small>
            </div>
            <button onClick={finishForm} className="primary">
              {form._new ? "장소 추가하기" : "수정 완료"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
