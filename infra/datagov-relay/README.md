# data.gov.in relay (AWS Lambda, Mumbai)

data.gov.in refuses connections from the API's Lightsail box, which is in the US:
"Connection refused" from there, while an Indian connection to the same address gets
a normal reply (measured 2026-10-23). This Lambda runs in Mumbai and forwards the
API's mandi-feed requests, so they reach data.gov.in from an Indian address.

`index.mjs` is the whole function. It forwards only `GET /resource/<id>` to
`api.data.gov.in`, only with the shared secret, and gzips the reply.

## It stays inside the always-free tier

Lambda's free allowance renews every month and does not expire after a year.

| | Free each month | This relay, worst case |
|---|---|---|
| Requests | 1,000,000 | ~18,000 (about 37 per sweep, 12 sweeps a day; failed sweeps retry every 10 min but stop at the first refusal) |
| Compute | 400,000 GB-seconds | ~3,600 (128 MB, about 80 s per sweep) |
| Data out | 100 GB | under 1 GB (replies are gzipped, ~0.5 MB per sweep) |

The guards that keep it there:

- **The secret.** Without it the function refuses before calling data.gov.in, in a
  few milliseconds. The function URL itself is a random address nobody else knows.
- **Two rate limits.** The function forwards at most 300 requests an hour per running
  copy, counted only after the secret check, so strangers cannot spend it; with two
  copies that is at most 432,000 a month. The API sends at most 2,000 a day to the
  relay (`relayDailyCap` in `server/src/config`), against normal use of about 450,
  so a bug that loops on the feed stops there instead of running up requests.
- **Reserved concurrency of 2.** At most two copies run at once, so nothing can make
  it run wide. The API only ever sends one request at a time.
- **A zero-spend budget.** AWS emails you the moment anything costs a cent.
- **Log retention of one week**, so logs cannot pile up (5 GB of logs a month is free;
  this writes a line only when data.gov.in fails).

## Setup (AWS console, about 10 minutes)

1. Top right, switch the region to **Asia Pacific (Mumbai) ap-south-1**. Everything
   below must be in Mumbai; that is the point.
2. **Lambda → Create function** → Author from scratch.
   - Name: `cropbid-datagov-relay`
   - Runtime: **Node.js 22.x**, architecture **arm64**
   - Leave the default execution role. Create.
3. **Code** tab: delete the sample `index.mjs` content, paste this folder's
   `index.mjs`, press **Deploy**. Handler stays `index.handler`.
4. **Configuration → General configuration → Edit**: memory **128 MB**, timeout
   **1 min 0 sec**. Save.
5. Make a secret on your Mac:
   ```bash
   openssl rand -hex 32
   ```
   **Configuration → Environment variables → Edit**: add `RELAY_SECRET` with that
   value. Save. Keep the value: the API needs the same one.
6. **Configuration → Concurrency → Edit**: Reserve concurrency, **2**. If AWS refuses
   because the account's concurrency limit is 10 (new accounts), skip this step: the
   secret and the budget still hold.
7. **Configuration → Function URL → Create function URL**: Auth type **NONE**
   (the secret is the check). Save, and copy the URL
   (`https://<random>.lambda-url.ap-south-1.on.aws/`).
8. **CloudWatch → Log groups → `/aws/lambda/cropbid-datagov-relay`** → Actions →
   Edit retention → **1 week**. (The group appears after the first request; come back
   after step 9.)
9. **Billing and Cost Management → Budgets → Create budget** → template
   **Zero spend budget**, your email. Create.

## Check it from the Lightsail box

```bash
URL='https://<random>.lambda-url.ap-south-1.on.aws'
SECRET='<the RELAY_SECRET value>'
K=$(sudo grep '^DATA_GOV_API_KEY=' /home/cropbid/app/server/.env | cut -d= -f2- | tr -d "\"'")
curl -s --compressed -m 60 -H "x-relay-secret: $SECRET" -w "\nHTTP %{http_code}\n" \
  "$URL/resource/9ef84268-d588-465a-a308-a864a43d0070?api-key=$K&format=json&limit=2" | tail -c 400
```

- `HTTP 200` with records: data.gov.in accepts Mumbai. Go on.
- `HTTP 502` with `upstream ECONNREFUSED`: data.gov.in refuses AWS Mumbai too. Delete
  the function; this route is closed.
- `HTTP 403`: the secret in the header does not match `RELAY_SECRET`.

## Point the API at it

Once the change that reads these settings is deployed, add to
`/home/cropbid/app/server/.env`:

```
DATA_GOV_RELAY_URL=https://<random>.lambda-url.ap-south-1.on.aws
DATA_GOV_RELAY_SECRET=<the RELAY_SECRET value>
```

then `sudo systemctl restart cropbid-api`. The first complete download takes about a
minute and a half; after that `https://api.cropbid.in/api/rates/board` says
`"live": true`. If it does not, `sudo journalctl -u cropbid-api | grep "\[rates\]"`
names the failure, and a relay failure says `data.gov.in via relay`.

Either setting blank, the API goes straight to data.gov.in, which is right for local
development in India.

## Updating the function

Paste the new `index.mjs` into the console and Deploy. Nothing deploys it
automatically; it is not part of the API's deploy.
