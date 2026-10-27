"use client";

import { useEffect, useRef, useState } from "react";
import { IconPin } from "@/components/icons";

export type PickedAddress = { lat: number; lng: number; formatted: string; accessNotes?: string };

type Zone = { id: string; name: string; lat: number; lng: number };

declare global {
  interface Window {
    google?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    __drMapsReady?: () => void;
  }
}

function loadMaps(key: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  return new Promise((resolve, reject) => {
    window.__drMapsReady = () => resolve();
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&callback=__drMapsReady&loading=async&region=AE`;
    s.async = true;
    s.onerror = () => reject(new Error("maps failed"));
    document.head.appendChild(s);
  });
}

/**
 * Address + pin selection. With a Google Maps key: autocomplete + draggable pin.
 * Without one (or if Maps fails): manual address + device location or service-area selection.
 */
export function AddressPicker({ mapsKey, zones, onPicked }: { mapsKey: string | null; zones: Zone[]; onPicked: (a: PickedAddress) => void }) {
  const [mode, setMode] = useState<"map" | "fallback">(mapsKey ? "map" : "fallback");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const inputEl = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode !== "map" || !mapsKey) return;
    let cancelled = false;
    loadMaps(mapsKey)
      .then(() => {
        if (cancelled || !mapEl.current || !inputEl.current) return;
        const g = window.google;
        const center = { lat: 25.2048, lng: 55.2708 };
        const map = new g.maps.Map(mapEl.current, { center, zoom: 11, disableDefaultUI: true, zoomControl: true, gestureHandling: "cooperative" });
        const marker = new g.maps.Marker({ map, position: center, draggable: true });
        const ac = new g.maps.places.Autocomplete(inputEl.current, { componentRestrictions: { country: "ae" }, fields: ["geometry", "formatted_address"] });
        ac.addListener("place_changed", () => {
          const p = ac.getPlace();
          if (!p.geometry?.location) return;
          const pos = { lat: p.geometry.location.lat(), lng: p.geometry.location.lng() };
          map.setCenter(pos);
          map.setZoom(16);
          marker.setPosition(pos);
          setAddress(p.formatted_address ?? inputEl.current!.value);
          setCoords(pos);
        });
        marker.addListener("dragend", () => {
          const pos = marker.getPosition();
          setCoords({ lat: pos.lat(), lng: pos.lng() });
        });
      })
      .catch(() => !cancelled && setMode("fallback"));
    return () => {
      cancelled = true;
    };
  }, [mode, mapsKey]);

  function useMyLocation() {
    if (!navigator.geolocation) return setGeoError("Location is not available on this device.");
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocating(false);
      },
      () => {
        setGeoError("We couldn't get your location. Choose your area instead.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const ready = coords && address.trim().length >= 5;

  return (
    <div className="space-y-4">
      {mode === "map" ? (
        <>
          <div>
            <label htmlFor="addr" className="field-label">Search your address</label>
            <input ref={inputEl} id="addr" className="field" placeholder="Building, street, area" autoComplete="street-address" onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div ref={mapEl} className="h-64 w-full overflow-hidden rounded-2xl border border-line bg-sage" aria-label="Map — drag the pin to your building" role="application" />
          <p className="text-xs text-muted">Drag the pin to the exact building entrance.</p>
        </>
      ) : (
        <>
          <div>
            <label htmlFor="addr-manual" className="field-label">Full address</label>
            <textarea id="addr-manual" className="field min-h-20 py-3" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Villa/apartment, building, street, area" autoComplete="street-address" />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <button type="button" className="btn-secondary" onClick={useMyLocation} disabled={locating}>
              <IconPin className="size-4" /> {locating ? "Locating…" : "Use my current location"}
            </button>
            {zones.length > 0 && (
              <div className="flex-1">
                <label htmlFor="zone" className="field-label">…or choose your area</label>
                <select
                  id="zone"
                  className="field"
                  defaultValue=""
                  onChange={(e) => {
                    const z = zones.find((x) => x.id === e.target.value);
                    if (z) setCoords({ lat: z.lat, lng: z.lng });
                  }}
                >
                  <option value="" disabled>Select area</option>
                  {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </div>
            )}
          </div>
          {geoError && <p className="text-sm text-alert">{geoError}</p>}
          {coords && <p className="text-xs text-muted">Location set. The doctor will use your written address for navigation.</p>}
        </>
      )}
      <div>
        <label htmlFor="access" className="field-label">Access instructions (optional)</label>
        <input id="access" className="field" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Gate code, parking, floor — no medical details please" />
      </div>
      <button type="button" className="btn-primary" disabled={!ready} onClick={() => coords && onPicked({ ...coords, formatted: address.trim(), accessNotes: notes.trim() || undefined })}>
        Check availability at this address
      </button>
    </div>
  );
}
