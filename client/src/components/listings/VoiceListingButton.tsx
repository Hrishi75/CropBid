// =============================================================================
// VoiceListingButton — dictate a listing instead of typing it
// =============================================================================
// The farmer taps, speaks for up to ~25 seconds, and the form above fills in.
// Every field is a suggestion they then check; publishing still goes through
// the normal Publish button, so a mis-hearing costs a correction, not a bad
// listing.
//
// WHY 25 SECONDS: Sarvam's REST speech endpoint rejects audio of 30s or more.
// The server sends the real ceiling via GET /api/voice/status, and we stop a
// few seconds under it to leave room for container padding and clock skew.
// Long or multi-clip recordings are deliberately out of scope — not forgotten.
//
// WHY THE PRIMING COPY MATTERS: 25 seconds is plenty for "fifty quintal
// onions, A grade, Nashik, two thousand minimum" and nowhere near enough for a
// rambling story. Telling the farmer WHAT to say, with an example in their own
// language, is what makes the limit workable.
//
// ⚠️ DEV NOTE: navigator.mediaDevices is undefined on insecure origins, so
// testing on a phone against http://192.168.x.x:5173 silently hides this
// button. Use localhost or a tunnel.
// =============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import api from '../../lib/axios';

export interface VoiceDraftFields {
  cropName: string | null;
  cropVariety: string | null;
  quantity: number | null;
  unit: 'KG' | 'QUINTAL' | 'TONNE' | null;
  qualityGrade: 'A' | 'B' | 'C' | null;
  pricePerUnitMin: number | null;
  pricePerUnitMax: number | null;
  harvestDate: string | null;
  description: string | null;
  organic: boolean | null;
  location: string | null;
  state: string | null;
}

export interface VoiceDraft {
  transcript: string;
  language: string | null;
  languageConfidence: number | null;
  fields: VoiceDraftFields;
}

type Phase = 'idle' | 'requesting' | 'denied' | 'recording' | 'transcribing' | 'error';

// Preference order for the recording container. Chrome/Firefox/Edge take the
// first; Safari supports none of them and falls through to its own default
// (audio/mp4), which the server accepts.
const MIME_PREFERENCES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return MIME_PREFERENCES.find((type) => MediaRecorder.isTypeSupported(type));
}

// A worked example per language. Shown under the prompt so the farmer hears
// the shape of a good answer before they start.
const EXAMPLES: Record<string, string> = {
  hi: 'पचास क्विंटल प्याज़, ए ग्रेड, नाशिक, दाम दो हज़ार से कम नहीं',
  mr: 'पन्नास क्विंटल कांदा, ए ग्रेड, नाशिक, भाव दोन हजारपेक्षा कमी नाही',
  en: 'Fifty quintal onions, A grade, from Nashik, lowest price two thousand',
};

interface VoiceListingButtonProps {
  onDraft: (draft: VoiceDraft) => void;
}

export function VoiceListingButton({ onDraft }: VoiceListingButtonProps) {
  const { t, i18n } = useTranslation();

  const [enabled, setEnabled] = useState(false);
  const [maxSeconds, setMaxSeconds] = useState(25);
  const [phase, setPhase] = useState<Phase>('idle');
  const [remaining, setRemaining] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Release the microphone on EVERY exit path. Miss this and the browser's
  // recording indicator stays lit for the rest of the session, which farmers
  // reasonably read as being spied on.
  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    if (autoStopRef.current) { clearTimeout(autoStopRef.current); autoStopRef.current = null; }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  }, []);

  // Ask the server whether voice is available at all. With SARVAM_API_KEY
  // blank this stays false and the button never renders — which is how the
  // feature disappears cleanly when the trial credits lapse, instead of
  // showing a control that errors.
  useEffect(() => {
    let cancelled = false;
    api
      .get('/voice/status')
      .then(({ data }) => {
        if (cancelled) return;
        setEnabled(Boolean(data?.enabled));
        if (typeof data?.maxSeconds === 'number') setMaxSeconds(data.maxSeconds);
      })
      .catch(() => {
        // Endpoint missing or request failed — treat voice as unavailable.
        if (!cancelled) setEnabled(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => releaseMic, [releaseMic]);

  async function upload(blob: Blob) {
    setPhase('transcribing');
    try {
      const form = new FormData();
      // Extension is cosmetic; the server identifies the format from the bytes.
      form.append('audio', blob, 'voice-note');

      const { data } = await api.post('/voice/listing-draft', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      onDraft(data as VoiceDraft);
      setPhase('idle');
    } catch (err: unknown) {
      const response = (err as { response?: { data?: { code?: string; message?: string } } }).response;

      // The key was removed mid-session. Hide the control rather than let them
      // keep tapping something that cannot work.
      if (response?.data?.code === 'VOICE_UNAVAILABLE') {
        setEnabled(false);
        return;
      }

      setErrorMessage(
        response?.data?.message || t("Couldn't understand that. Try again, or type below."),
      );
      setPhase('error');
    }
  }

  async function startRecording() {
    setErrorMessage('');
    setPhase('requesting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        releaseMic();
        if (blob.size > 0) void upload(blob);
        else setPhase('idle');
      };

      recorder.start();
      setPhase('recording');
      setRemaining(maxSeconds);

      // Hard stop, so we never hand Sarvam a clip it will reject.
      autoStopRef.current = setTimeout(() => stopRecording(), maxSeconds * 1000);
      tickRef.current = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    } catch (err) {
      releaseMic();
      // NotAllowedError = they declined the prompt (or blocked it earlier).
      if ((err as { name?: string })?.name === 'NotAllowedError') setPhase('denied');
      else {
        setErrorMessage(t('Could not start recording on this device.'));
        setPhase('error');
      }
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    else { releaseMic(); setPhase('idle'); }
  }

  // Server says voice is off, or this browser/origin cannot record at all.
  if (!enabled) return null;
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;

  const example = EXAMPLES[i18n.language.slice(0, 2)] ?? EXAMPLES.en;
  const busy = phase === 'requesting' || phase === 'transcribing';

  return (
    <div
      style={{
        padding: 16,
        border: '1px solid var(--cb-line)',
        borderRadius: 8,
        background: 'var(--cb-paper-2)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {phase !== 'recording' && (
        <>
          <div className="cb-small" style={{ fontWeight: 600 }}>
            {t('Say it instead of typing')}
          </div>
          <div className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>
            {t('Say the crop, how much, the grade, and your lowest price.')}
          </div>
          <div className="cb-tiny" style={{ color: 'var(--cb-ink-3)', fontStyle: 'italic' }}>
            {t('For example')}: “{example}”
          </div>
        </>
      )}

      {phase === 'recording' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            aria-hidden
            style={{
              width: 10, height: 10, borderRadius: '50%',
              background: 'var(--cb-danger, #c0392b)',
            }}
          />
          <div className="cb-small" style={{ fontWeight: 600 }}>{t('Listening…')}</div>
          <div
            className="cb-small"
            style={{
              marginLeft: 'auto',
              fontVariantNumeric: 'tabular-nums',
              // Amber for the last five seconds, so the cut-off is never a
              // surprise mid-sentence.
              color: remaining <= 5 ? 'var(--cb-warn, #b8860b)' : 'var(--cb-ink-3)',
            }}
          >
            {remaining}s
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {phase === 'recording' ? (
          <button type="button" className="cb-btn" onClick={stopRecording}>
            {t('Stop and fill the form')}
          </button>
        ) : (
          <button type="button" className="cb-btn" onClick={startRecording} disabled={busy}>
            {phase === 'transcribing'
              ? t('Understanding your voice note…')
              : phase === 'requesting'
                ? t('Starting…')
                : t('Record a voice note')}
          </button>
        )}
      </div>

      {phase === 'denied' && (
        <div className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>
          {t('Allow microphone access in your browser to use voice. You can still type below.')}
        </div>
      )}

      {phase === 'error' && errorMessage && (
        <div className="cb-tiny" style={{ color: 'var(--cb-danger, #c0392b)' }}>
          {errorMessage}
        </div>
      )}
    </div>
  );
}
