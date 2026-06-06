# Reclub — Fetch event participants (name + avatar)

**No auth required. 2 HTTP requests. ~0.5 second.**

> **Updated June 2026:** Reclub stopped server-side-rendering participant data in `__NUXT_DATA__`. The HTML-scraping approach (Steps 2–3 below) no longer works. Use the **`/meets/by-ref/{referenceCode}`** API instead — see the [new approach](#new-approach-meets-by-ref) section.

---

## Overview

For any public Reclub event, you can retrieve the full participant list (display name + avatar URL) using only public endpoints. The flow is:

1. Find the event's `referenceCode` via the group activities API
2. ~~Fetch the event web page, parse `__NUXT_DATA__` to extract `userId`s~~ *(broken as of June 2026)*
3. ~~Batch-fetch player profiles to get names and avatar URLs~~

---

## Step 0 — Prerequisites

**Base URL:** `https://api.reclub.co`

**Headers (use on all API calls):**

```
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)
x-output-casing: camelCase
Accept: application/json
```

**You need:** a `groupId` (the club's numeric ID on Reclub).

To find a club's `groupId`, use the slug:
```
GET https://api.reclub.co/groups/slug/{slug}?scopes=COUNTS
```
Example: `slug=next11-pickleball-club` → `groupId=298257`

---

## Step 1 — Find the event (`referenceCode`)

```
GET /groups/{groupId}/activities?types=MEETS&min_start_datetime={unix_start}&max_start_datetime={unix_end}&limit=100&sort_dir=1
```

- Timestamps are **Unix seconds** in **Vietnam time (UTC+7)**.
- Response is a JSON array of meet objects.

**Example (Python):**

```python
import urllib.request, json, datetime

API = "https://api.reclub.co"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "x-output-casing": "camelCase",
    "Accept": "application/json",
}
VN = datetime.timezone(datetime.timedelta(hours=7))

def api_get(path):
    req = urllib.request.Request(f"{API}{path}", headers=HEADERS)
    return json.loads(urllib.request.urlopen(req, timeout=20).read().decode())

# Build day window (e.g. April 29 2026, full day)
day = datetime.datetime(2026, 4, 29, tzinfo=VN)
ts_min = int(day.timestamp())
ts_max = int((day + datetime.timedelta(days=1) - datetime.timedelta(seconds=1)).timestamp())

group_id = 298257  # NEXT11 PICKLEBALL CLUB

meets = api_get(f"/groups/{group_id}/activities?types=MEETS"
                f"&min_start_datetime={ts_min}&max_start_datetime={ts_max}"
                f"&limit=100&sort_dir=1")

# meets is a list; each meet has:
#   referenceCode  — e.g. "ZV97F2"
#   name           — event title
#   startDatetime  — Unix seconds
#   participantsStatusCount.joined — confirmed count
```

Pick the event you want and note its **`referenceCode`**.

---

## Step 2 — Extract participant `userId`s from the meet page

Fetch the event's public web page and parse the Nuxt SSR payload:

```
GET https://reclub.co/m/{referenceCode}
```

**Example:**

```python
import re

def get_participant_user_ids(reference_code):
    url = f"https://reclub.co/m/{reference_code}"
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "Accept": "text/html",
    })
    html = urllib.request.urlopen(req, timeout=20).read().decode()

    # Extract __NUXT_DATA__ JSON
    match = re.search(
        r'<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL
    )
    raw = json.loads(match.group(1))

    # Nuxt uses a flat array with index-based references.
    # Participant dicts have: referenceType, referenceId, status, isHost, etc.
    # The VALUES in these dicts are indices into the same `raw` array.
    #
    # Key resolved values (as of April 2026):
    #   referenceType → 10 = real user (also seen: 9, 30)
    #   status        → 1  = confirmed
    #   referenceId   → resolves to the integer userId

    user_ids = set()
    for item in raw:
        if not isinstance(item, dict) or "referenceId" not in item:
            continue

        ref_type = raw[item["referenceType"]]  # dereference index
        status   = raw[item["status"]]
        user_id  = raw[item["referenceId"]]

        if status == 1 and isinstance(user_id, int) and user_id > 1000:
            user_ids.add(user_id)

    return sorted(user_ids)
```

**Notes:**
- Some participants are guests (no `userId`) — expect ~3 fewer than `participantsStatusCount.joined`.
- If Reclub changes the Nuxt payload format, the index-dereferencing logic may need updating.

---

## Step 3 — Batch-fetch names and avatars

```
GET /players/userIds?userIds={comma_separated_ids}&scopes=BASIC_PROFILE
```

**Example:**

```python
def get_player_profiles(user_ids):
    BATCH = 50
    players = []
    for i in range(0, len(user_ids), BATCH):
        batch = user_ids[i:i + BATCH]
        ids = ",".join(str(uid) for uid in batch)
        data = api_get(f"/players/userIds?userIds={ids}&scopes=BASIC_PROFILE")
        players.extend(data.get("players", []))
    return players
```

**Each player object contains (among others):**

| Field      | Example                                                           |
|------------|-------------------------------------------------------------------|
| `userId`   | `581303`                                                          |
| `name`     | `"GuiGui 🇨🇵 (Guillaume)"`                                        |
| `username` | `"guillaume-panot-12"`                                            |
| `imageUrl` | `"https://assets.reclub.co/user-avatars/581303.webp?updatedAt=…"` |
| `gender`   | `"M"` / `"F"`                                                     |

Players without a custom avatar get a default initials image:
`https://d1upr18ac2olqz.cloudfront.net/default-avatars/{XX}.png`

---

## Full working example

```python
#!/usr/bin/env python3
"""Fetch participant names + avatars for any Reclub event."""

import urllib.request, json, re, datetime, time

API = "https://api.reclub.co"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "x-output-casing": "camelCase",
    "Accept": "application/json",
}
VN = datetime.timezone(datetime.timedelta(hours=7))


def api_get(path):
    req = urllib.request.Request(f"{API}{path}", headers=HEADERS)
    return json.loads(urllib.request.urlopen(req, timeout=20).read().decode())


def find_meets(group_id, date):
    """Return all meets for a club on a given date (datetime.date)."""
    day = datetime.datetime(date.year, date.month, date.day, tzinfo=VN)
    ts_min = int(day.timestamp())
    ts_max = int((day + datetime.timedelta(days=1) - datetime.timedelta(seconds=1)).timestamp())
    return api_get(
        f"/groups/{group_id}/activities?types=MEETS"
        f"&min_start_datetime={ts_min}&max_start_datetime={ts_max}"
        f"&limit=100&sort_dir=1"
    )


def get_participant_ids(reference_code):
    """Parse the meet page Nuxt payload and return confirmed userIds."""
    url = f"https://reclub.co/m/{reference_code}"
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "Accept": "text/html",
    })
    html = urllib.request.urlopen(req, timeout=20).read().decode()
    match = re.search(r'<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
    raw = json.loads(match.group(1))

    user_ids = set()
    for item in raw:
        if not isinstance(item, dict) or "referenceId" not in item:
            continue
        status  = raw[item["status"]]
        user_id = raw[item["referenceId"]]
        if status == 1 and isinstance(user_id, int) and user_id > 1000:
            user_ids.add(user_id)
    return sorted(user_ids)


def get_profiles(user_ids):
    """Batch-fetch player profiles (name, avatar, etc.)."""
    players = []
    for i in range(0, len(user_ids), 50):
        ids = ",".join(str(uid) for uid in user_ids[i:i + 50])
        data = api_get(f"/players/userIds?userIds={ids}&scopes=BASIC_PROFILE")
        players.extend(data.get("players", []))
        if i + 50 < len(user_ids):
            time.sleep(0.3)
    return players


# --- Usage ---
if __name__ == "__main__":
    GROUP_ID = 298257          # NEXT11 PICKLEBALL CLUB
    DATE = datetime.date(2026, 4, 29)

    t0 = time.time()
    meets = find_meets(GROUP_ID, DATE)
    ref_code = meets[0]["referenceCode"]   # pick first meet, or filter by name/time

    user_ids = get_participant_ids(ref_code)
    players  = get_profiles(user_ids)

    for p in sorted(players, key=lambda x: x["name"]):
        print(f'{p["name"]:<40} {p["imageUrl"]}')

    print(f"\n{len(players)} players — {time.time() - t0:.2f}s")
```

---

## Quick reference: known `groupId`s (HCM pickleball)

| Club | `groupId` | Slug |
|------|-----------|------|
| NEXT11 PICKLEBALL CLUB | 298257 | `next11-pickleball-club` |
| ELITE SPORT PICKLEBALL @Pacific | 22476 | `js-pickleball-club` |
| Big Balls Pickle Club | 11186 | `big` |
| Aspire DRILL Club | 14164 | `aspire` |
| ACE SQUAD PICKLEBALL | 30158 | `pickleballacesquad` |
| Top One | 104121 | `top-one` |
| The MM Pickleball Club | 326472 | `the-mm-pickleball-club` |

---

## Performance

| Step | Requests | Time |
|------|----------|------|
| Find event (activities API) | 1 | ~0.3s |
| Parse roster (meet HTML page) | 1 | ~0.7s |
| Fetch profiles (batch API) | 1 per 50 players | ~0.4s |
| **Total (typical 48-player event)** | **3** | **~1.1s** |

---

## Caveats

- **No auth required** — all endpoints above are public.
- **Guest players** (added by hosts without a Reclub account) won't have a `userId` and won't appear in the roster. Expect the count to be slightly below `participantsStatusCount.joined`.
- **Nuxt payload format is fragile** — if Reclub updates their frontend, the `__NUXT_DATA__` structure may change. The index-dereferencing pattern has been stable since late 2025 but verify if results look wrong.
- **Rate limiting** — be polite. Add `time.sleep(0.3)` between batch calls if fetching many events. On HTTP 429, back off.

---

## Invited players and manually-added guests (discovered: May 8, 2026)

The `participantsStatusCount.joined` count on Reclub includes **three types** of confirmed participants, not just Reclub account holders:

### Type 1 — Regular Reclub users (own account)
- `referenceId` resolves to a numeric `userId > 1000`
- `externalReference` is `null`
- Covered by the existing flow (Step 2 → Step 3)

### Type 2 — Players added by another player ("bring a friend")
- **Same `userId` as the adder** (Reclub reuses the adder's userId for the slot)
- `externalReference` is an object: `{ name: "Display Name", gender: "M"|"F", level: <int> }`
- These appear as **duplicate userIds** in the Nuxt array — the adder has their own entry (extRef = null) plus one entry per person they added (extRef = name)
- **Were previously lost** by the `Set<number>` deduplication

### Type 3 — Manually-added guests (no Reclub account)
- `referenceId` resolves to `null`
- `referenceType` resolves to `2` (guest type, vs `9` for real users)
- `externalReference` is an object: `{ name: "Display Name", gender: "M"|"F" }`
- **Were previously dropped** by the `typeof userId === "number" && userId > 1000` guard

### Real example — Ace Squad E52MQB (May 8, 2026)

Reclub shows **51 confirmed**. Breakdown:
- 45 unique Reclub users (own accounts) → fetched normally
- 4 "added by" slots: **C Chi** and **C Tuyết** (added by Lê Phi Japan, userId 1322554), **Selena go out** (added by Romain, userId 9850), **Xị** (added by Danny, userId 437115)
- 2 manual guests: **Anh Dương** and **Anh dương + 1** (referenceId = null)

### Updated parsing logic (Step 2)

To capture all three types, iterate the raw array once and collect both numeric-userId entries **and** externalReference-name entries separately. For "added by" entries, the key signal is: `status === 1` AND the entry has an `externalReference` with a resolved `name` AND the `userId` is a duplicate of another entry (or you can simply emit a synthetic player for every extRef-name entry regardless of whether the userId is a dupe — duplicates without extRef are the "self" entry):

```python
def get_all_participants(reference_code):
    """
    Returns list of dicts:  { userId, name, gender, is_guest }
    Covers:
      - real Reclub users (own account)
      - players added by another user ("bring a friend")
      - manually-added guests (no Reclub account)
    """
    url = f"https://reclub.co/m/{reference_code}"
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "Accept": "text/html",
    })
    html = urllib.request.urlopen(req, timeout=20).read().decode()
    match = re.search(r'<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
    raw = json.loads(match.group(1))

    reclub_user_ids = set()   # for batch-profile fetch
    named_entries   = []      # synthetic players with a name from externalReference

    for item in raw:
        if not isinstance(item, dict) or "referenceId" not in item:
            continue

        status  = raw[item["status"]]
        user_id = raw[item["referenceId"]]   # int for real users, None for guests

        if status != 1:
            continue

        # Resolve externalReference (name supplied by adder / admin)
        ext_raw = item.get("externalReference")
        ext_ref = raw[ext_raw] if ext_raw is not None else None
        if isinstance(ext_ref, dict):
            name   = raw.get(ext_ref["name"])   if "name"   in ext_ref else None
            gender = raw.get(ext_ref["gender"]) if "gender" in ext_ref else None
            if name:
                named_entries.append({
                    "userId":   user_id,   # may be None (guest) or int (added-by)
                    "name":     name,
                    "gender":   gender or "",
                    "is_guest": user_id is None,
                })
                continue   # do NOT also add their userId to the batch-fetch set

        # Plain Reclub user — collect for batch profile fetch
        if isinstance(user_id, int) and user_id > 1000:
            reclub_user_ids.add(user_id)

    # Batch-fetch real profiles
    profile_players = get_profiles(sorted(reclub_user_ids))

    # Combine: real profiles + synthetic named entries
    all_players = profile_players + named_entries
    return all_players
```

**Key rule:** when an entry has a non-null `externalReference.name`, emit a synthetic player from that name and **skip** adding the `userId` to the batch-fetch set. This prevents the adder from being counted twice (their own entry — with `extRef = null` — is still collected normally).

*Updated: May 8, 2026*

---

---

## New approach: `/meets/by-ref/` (June 2026+)

Reclub stopped embedding participant data in `__NUXT_DATA__` around June 2026. Their frontend now fetches participants client-side via a dedicated API endpoint. This endpoint is public (no auth required) and returns the full meet object including all participants in a single call — no HTML scraping needed.

### Step 2 replacement — fetch participants directly

```
GET https://api.reclub.co/meets/by-ref/{referenceCode}
```

Headers: same as Step 0 (`User-Agent`, `x-output-casing: camelCase`, `Accept: application/json`)

**Response shape (relevant fields):**
```json
{
  "name": "🇻🇳[ACE CLUBHOUSE D2]🇻🇳 ACE SQUAD ⭐️ (9AM-12:30PM)⭐️",
  "participants": [
    {
      "referenceType": 1,
      "referenceId": 1578483,
      "externalReference": null,
      "status": 1,
      "lastStatusUpdatedAt": 1780713239164,
      "createdAt": 1780713239
    }
  ]
}
```

**`status` values:** `1` = confirmed, `3` = waitlist, `-1` = cancelled, `0` = pending, `5` = other. Only `status === 1` participants should be shown.

**`referenceType` values:**
| Value | Meaning | `externalReference` |
|-------|---------|---------------------|
| `1` | Own Reclub account | `null` — fetch profile via `/players/userIds` |
| `2` | Guest (no Reclub account, added by another user) | `null` — `referenceId` is the adder's userId; skip profile fetch, no name available |
| `3` | Added-by-friend (bring-a-friend) | `{ name: "Display Name", gender: "M"\|"F", level?: number }` — use this name directly |

### Updated parsing logic

```python
def fetch_roster(reference_code):
    """Fetch all confirmed participants for a Reclub event."""
    url = f"https://api.reclub.co/meets/by-ref/{reference_code}"
    data = api_get(url)  # api_get defined in Step 0

    confirmed = [p for p in data["participants"] if p["status"] == 1]
    # Sort by lastStatusUpdatedAt ASC = order in which players confirmed
    confirmed.sort(key=lambda p: p["lastStatusUpdatedAt"])

    # Collect userId for own-account players (referenceType 1 or 2 without externalReference)
    own_ids = []
    seen = set()
    for p in confirmed:
        if p["referenceType"] == 3 and p.get("externalReference"):
            continue  # handled via externalReference.name below
        ref_id = p.get("referenceId")
        if isinstance(ref_id, int) and ref_id > 0 and ref_id not in seen:
            seen.add(ref_id)
            own_ids.append(ref_id)

    # Batch-fetch profiles
    profiles = get_profiles(own_ids)  # get_profiles defined in Step 3
    profile_map = {p["userId"]: p for p in profiles}

    players = []
    for p in confirmed:
        if p["referenceType"] == 3 and p.get("externalReference", {}).get("name"):
            ext = p["externalReference"]
            players.append({
                "userId": None,
                "name": ext["name"],
                "gender": ext.get("gender", ""),
                "is_added_by_friend": True,
                "imageUrl": None,
            })
        elif isinstance(p.get("referenceId"), int) and p["referenceId"] > 0:
            profile = profile_map.get(p["referenceId"])
            if profile:
                players.append({
                    "userId": p["referenceId"],
                    "name": profile["name"],
                    "gender": profile.get("gender", ""),
                    "is_added_by_friend": False,
                    "imageUrl": profile["imageUrl"],
                })

    return {"event_name": data["name"], "players": players}
```

### Performance

| Step | Requests | Time |
|------|----------|------|
| Find event (activities API) | 1 | ~0.3s |
| Fetch participants (`/meets/by-ref/`) | 1 | ~0.2s |
| Fetch profiles (batch API) | 1 per 50 players | ~0.4s |
| **Total (typical 50-player event)** | **3** | **~0.9s** |

The old approach required fetching + parsing a full HTML page (~47 KB); the new API response is ~10 KB and much faster.

*Added: June 7, 2026*

---

*Created: April 29, 2026*
