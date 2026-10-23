# data.gov.in relay (AWS Lambda, Mumbai)

data.gov.in refuses connections from the API's Lightsail box, which is in the US:
"Connection refused" from there, while an Indian connection to the same address gets
a normal reply (measured 2026-10-23). This Lambda runs in Mumbai and forwards the
API's mandi-feed requests, so they reach data.gov.in from an Indian address.

`index.mjs` is the whole function. It forwards only `GET /resource/<id>` to
`api.data.gov.in`, only with the shared secret, and gzips the reply.

## It stays inside the always-free tier

Lambda's free allowance renews every month and does not expire after a year.

| | Free each month | This relay, normal use (an estimate) |
|---|---|---|
| Requests | 1,000,000 | ~18,000 (about 37 per sweep, 12 sweeps a day; failed sweeps retry every 10 min but stop at the first refusal) |
| Compute | 400,000 GB-seconds | ~3,600 (128 MB, about 80 s per sweep) |
| Data out | 100 GB | under 1 GB (replies are gzipped, ~0.5 MB per sweep) |

**What the limits do and do not guarantee.** Every request to the function URL is a
Lambda invocation and counts against the free million, including one refused for a
wrong secret and one answered with the hourly cap's 429. So the limits keep the calls
to data.gov.in down; they do not cap what Lambda counts. What keeps the count low is
that only CropBid's API calls the URL, and the API holds itself to 2,000 a day. A
stranger who learned the URL could run up invocations; the alerts below are how you
would know, and deleting the function URL stops it at once.

- **The secret.** Without it the function refuses before calling data.gov.in, in a
  few milliseconds. The function URL itself is a random address nobody else knows.
- **The API's daily cap** (`relayDailyCap` in `server/src/config`): at most 2,000
  relay requests a day against normal use of about 450, so a bug in the API that loops
  on the feed stops there. This is the one limit on what our own side can spend.
- **The relay's hourly cap:** at most 300 forwarded requests an hour per running copy,
  counted after the secret check. It protects data.gov.in and our standing with it, not
  the Lambda bill: the count lives in one copy's memory and starts again whenever AWS
  replaces that copy.
- **Reserved concurrency of 2, where the account allows it** (CropBid's does not, step
  6). It limits how many copies run at once, not how many requests are made.
- **Alerts that do not fire on Lightsail.** AWS Free Tier alerts (Billing preferences)
  email at 85% of any free allowance; a cost budget a little above the usual Lightsail
  bill emails on any other charge. A whole-account zero-spend budget would fire every
  month on Lightsail, and a Lambda-only budget cannot be made until Lambda has a cost
  history.
- **Log retention of one week**, so logs cannot pile up (5 GB of logs a month is free;
  normal use is a few MB).

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
6. **Configuration → Concurrency → Edit**: Reserve concurrency, **2**. AWS refuses this
   with "The unreserved account concurrency can't go below 100" on an account whose
   limit is under 102, which is what CropBid's was (2026-10-24). Cancel and skip it:
   the secret, the API's daily cap and the budget still hold, and the account's own
   low limit bounds how many copies can run.
7. **Configuration → Function URL → Create function URL**: Auth type **NONE**
   (the secret is the check). Save, and copy the URL
   (`https://<random>.lambda-url.ap-south-1.on.aws/`).
8. **CloudWatch → Log groups → `/aws/lambda/cropbid-datagov-relay`** → Actions →
   Edit retention → **1 week**. (The group appears after the first request; come back
   after step 9.)
9. **Alerts.** Billing and Cost Management → **Billing preferences → Alert preferences
   → Edit**, tick **Receive AWS Free Tier alerts**, your email. Then **Budgets → Create
   budget → Customize (advanced) → Cost budget**, monthly, fixed, at the usual monthly
   bill plus $0.50, all services, alert at 100% actual. Not the Zero spend template: it
   covers Lightsail and would email every month.

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
