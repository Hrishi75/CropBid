// =============================================================================
// Server Entry Point
// =============================================================================
// WHY http.createServer INSTEAD OF app.listen?
// Express 5's app.listen creates a server internally, but we need direct access
// to the HTTP server object for two reasons:
//   1. Socket.io needs to attach to the raw HTTP server (Phase 10)
//   2. Express 5 route handling works more reliably with createServer
//
// This pattern is standard for any Express app that uses WebSockets.
// =============================================================================

// First, so Sentry can instrument what is imported after it.
import './instrument';
import http from 'http';
import app from './app';
import { config } from './config';
import { initializeSocket } from './socket';
import { clearPlaintextRefreshTokens } from './utils/refreshToken';
import { purgeExpiredSignInData } from './services/retention.service';
import { countSealedPayoutDetails, encryptStoredPayoutDetails } from './services/payoutDetails';
import { assertEncryptionKeyValid, isEncryptionConfigured } from './utils/fieldCrypto';
import { warmRates } from './services/rates.service';
import { repostDueRequirements } from './services/requirement.service';
import { createDueBatches } from './services/supplyContract.service';

const PORT = config.port;

// Create HTTP server with Express as the request handler
const server = http.createServer(app);

// Attach Socket.io to the HTTP server
// WHY HERE AND NOT IN app.ts?
// Socket.io needs the raw HTTP server, not the Express app.
// app.ts exports the Express app (for middleware/routes).
// index.ts creates the HTTP server and attaches both Express and Socket.io to it.
initializeSocket(server);

// Refresh tokens are stored hashed (utils/refreshToken). A deploy applies
// migrations before swapping the API, so the old code can write a raw token
// into the column the migration cleared; this runs after the swap and clears
// whatever landed in that window. It matches nothing on an ordinary boot.
//
// Not awaited, and never fatal: the server must come up either way, and a
// leftover token is refused by the comparison regardless.
void clearPlaintextRefreshTokens()
  .then((cleared) => {
    if (cleared > 0) console.log(`🔑 Cleared ${cleared} refresh token(s) that were stored in the clear`);
  })
  .catch((err) => console.error('Could not sweep plaintext refresh tokens:', err));

// Payout details are encrypted at rest when PAYOUT_ENCRYPTION_KEY is set. A
// malformed key stops the boot here rather than leaving details unreadable
// later. So does a MISSING key once anything has been encrypted with one: the
// key was removed after use, every seller's account read and every payout
// read would fail, and a seller re-saving their details would store them in
// the clear. A failed start is seen at once, in the deploy; that is not.
// With no key and nothing encrypted yet, it is said out loud and nothing else.
// Otherwise the rows still stored in the clear are encrypted.
assertEncryptionKeyValid();
if (!isEncryptionConfigured()) {
  void countSealedPayoutDetails()
    .then((sealed) => {
      if (sealed > 0) {
        console.error(
          `FATAL: ${sealed} seller profile(s) hold encrypted payout details but PAYOUT_ENCRYPTION_KEY is not set. ` +
            'Restore the key that encrypted them.',
        );
        process.exit(1);
      }
      if (config.nodeEnv === 'production') {
        console.warn('⚠️  PAYOUT_ENCRYPTION_KEY is not set: seller bank details are stored unencrypted');
      }
    })
    .catch((err) => console.error('Could not check for encrypted payout details:', err));
} else {
  void encryptStoredPayoutDetails()
    .then((n) => {
      if (n > 0) console.log(`🔒 Encrypted payout details on ${n} seller profile(s)`);
    })
    .catch((err) => console.error('Could not encrypt stored payout details:', err));
}

// Start downloading the day's mandi feed and reading the usual prices now,
// so the first visitor to the rates board is not the one who waits. Never fatal.
warmRates();

server.listen(PORT, () => {
  console.log(`
  🌾 CropBid Server is running!

  → Local:        http://localhost:${PORT}
  → Health check: http://localhost:${PORT}/api/health
  → WebSocket:    ws://localhost:${PORT}/socket.io
  → Environment:  ${config.nodeEnv}
  `);
});

// REPEAT ORDERS AND CONTRACT BATCHES. Every 15 minutes, post the next copy of any repeating request
// that has fallen due (requirement.service repostDueRequirements). Each repost
// is claimed in the database, so a deploy's overlapping processes cannot both
// post one. Not in tests: they call the function directly.
if (config.nodeEnv !== 'test') {
  // Supply-contract batches fall due on the same tick (supplyContract.service).
  const repost = () => {
    repostDueRequirements().catch((err) => console.error('[repeat]', err));
    createDueBatches().catch((err) => console.error('[contracts]', err));
  };
  setTimeout(repost, 30_000).unref();
  setInterval(repost, 15 * 60_000).unref();

  // RETENTION. Hourly, delete sign-in codes, unfinished sign-ups and reset
  // links that expired over a day ago (retention.service). Idempotent, so two
  // processes in a deploy's overlap running it together is harmless.
  const purge = () => {
    purgeExpiredSignInData()
      .then((r) => {
        const total = r.phoneChallenges + r.pendingSignups + r.resetTokens;
        if (total > 0) console.log('[retention] cleared expired sign-in data', r);
      })
      .catch((err) => console.error('[retention]', err));
  };
  setTimeout(purge, 60_000).unref();
  setInterval(purge, 60 * 60_000).unref();
}

export { server };
