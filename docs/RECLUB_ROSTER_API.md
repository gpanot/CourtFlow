# Reclub — Fetch event participants (name + avatar)

**No auth required. 2 HTTP requests. ~1 second.**

---

## Overview

For any public Reclub event, you can retrieve the full participant list (display name + avatar URL) using only public endpoints. The flow is:

1. Find the event's `referenceCode` via the group activities API
2. Fetch the event web page, parse `__NUXT_DATA__` to extract `userId`s
3. Batch-fetch player profiles to get names and avatar URLs

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

*Created: April 29, 2026*
