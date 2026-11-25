import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("schema is repeatable; RLS and login throttle block anonymous access", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon; create role authenticated; create role service_role bypassrls; create schema storage; create table storage.objects(bucket_id text); alter table storage.objects enable row level security; grant usage on schema storage to anon, authenticated; grant all on storage.objects to anon, authenticated; create policy unrelated_broad_policy on storage.objects for all to anon using (true) with check (true); insert into storage.objects values ('trip-private'),('other'); create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
    );
    const sql = await readFile("supabase/schema.sql", "utf8");
    await db.exec(sql);
    await db.exec(sql);
    assert.equal(
      (await db.query("select count(*)::int as count from trip_state")).rows[0]
        .count,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select public from storage.buckets where id='trip-private'",
        )
      ).rows[0].public,
      false,
    );
    for (let i = 0; i < 11; i++)
      assert.equal(
        (await db.query("select allow_login_attempt('test') as allowed"))
          .rows[0].allowed,
        i < 10,
      );
    await db.exec(
      "update login_attempts set window_start=now()-interval '16 minutes'",
    );
    assert.equal(
      (await db.query("select allow_login_attempt('test') as allowed")).rows[0]
        .allowed,
      true,
    );
    await db.exec("set role service_role");
    assert.equal(
      (await db.query("select count(*)::int as count from trip_state")).rows[0]
        .count,
      1,
    );
    await db.exec("reset role; set role anon");
    assert.deepEqual(
      (await db.query("select bucket_id from storage.objects")).rows,
      [{ bucket_id: "other" }],
    );
    await assert.rejects(
      db.query("insert into storage.objects values ('trip-private')"),
      /row-level security/,
    );
    await assert.rejects(
      db.query("select * from trip_state"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select allow_login_attempt('bypass')"),
      /permission denied/,
    );
    await db.exec("reset role");
  } finally {
    await db.close();
  }
});
