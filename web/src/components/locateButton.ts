import { h } from '../dom.js';
import { icon } from '../icons.js';

/** The "Use my location" button and the browser geolocation behind it. */

export interface Coords {
  lat: number;
  lon: number;
}

const LOCATE_LABEL = 'Use my location';
const GEO_FAILED = "Couldn't get your location — search for your city instead.";
/** Keyed by GeolocationPositionError.code, so each failure says how to fix it. */
const GEO_MESSAGES: Partial<Record<number, string>> = {
  1: "Location access is blocked for this site. Allow it in your browser's site settings, or search for your city.",
  2: "Your device couldn't work out where you are. Check that location is turned on, or search for your city.",
  3: 'Finding your location took too long. Try again, or search for your city.',
};

/** The message for a failed geolocation: specific for the browser's error codes, general otherwise. */
export function geoErrorMessage(err: unknown): string {
  const code = (err as { code?: unknown } | null | undefined)?.code;
  return (typeof code === 'number' ? GEO_MESSAGES[code] : undefined) ?? GEO_FAILED;
}

/** The browser's position, coarse and possibly cached for 10 min: city-level air needs no more. */
export function browserGeolocate(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      reject,
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  });
}

interface LocateHandlers {
  /** Called as a lookup starts, so stale messages can be cleared. */
  onStart(): void;
  onFound(coords: Coords): void;
  onError(message: string): void;
}

/**
 * The button. While a lookup runs it reads "Locating…" and is `aria-disabled`, so a second
 * press does nothing but the button keeps its place in the tab order.
 */
export function locateButton(geolocate: () => Promise<Coords>, on: LocateHandlers): HTMLElement {
  const text = h('span', {}, LOCATE_LABEL);
  const button = h(
    'button',
    { type: 'button', class: 'btn btn--secondary locate-button' },
    icon('locate'),
    text,
  );
  let locating = false;

  const setBusy = (busy: boolean): void => {
    locating = busy;
    if (busy) button.setAttribute('aria-disabled', 'true');
    else button.removeAttribute('aria-disabled');
    text.textContent = busy ? 'Locating…' : LOCATE_LABEL;
  };

  const locate = async (): Promise<void> => {
    if (locating) return;
    setBusy(true);
    on.onStart();
    try {
      on.onFound(await geolocate());
    } catch (err) {
      on.onError(geoErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  button.addEventListener('click', () => {
    void locate();
  });
  return button;
}
