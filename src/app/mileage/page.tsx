"use client";
import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { db, auth } from "../../firebase";
import { collection, addDoc, query, where, onSnapshot, Timestamp, QuerySnapshot, DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

interface MileageEntry {
  id: string;
  userId?: string;
  beginAddress?: string;
  endAddress?: string;
  roundTrip?: boolean;
  miles?: number;
  costPerMile?: number;
  totalCost?: number;
  deal?: string;
  date?: string;
  notes?: string;
  createdAt?: Timestamp;
  [key: string]: unknown;
}

interface MapboxFeature {
  place_name: string;
  center: [number, number];
}

interface MapboxResponse {
  features?: MapboxFeature[];
}

interface MapboxDirectionsResponse {
  routes?: Array<{
    distance: number;
  }>;
}

async function fetchAddressSuggestions(query: string) {
  if (!query || !MAPBOX_TOKEN) return [];
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&autocomplete=true&limit=5`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data: MapboxResponse = await res.json();
  return data.features?.map((f: MapboxFeature) => f.place_name) || [];
}

async function getMiles(begin: string, end: string) {
  if (!begin || !end || !MAPBOX_TOKEN) return null;
  // Geocode both addresses
  const geocode = async (address: string) => {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&limit=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: MapboxResponse = await res.json();
    return data.features?.[0]?.center;
  };
  const beginCoord = await geocode(begin);
  const endCoord = await geocode(end);
  if (!beginCoord || !endCoord) return null;
  // Get driving distance
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${beginCoord[0]},${beginCoord[1]};${endCoord[0]},${endCoord[1]}?access_token=${MAPBOX_TOKEN}&overview=false`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data: MapboxDirectionsResponse = await res.json();
  const meters = data.routes?.[0]?.distance;
  if (!meters) return null;
  return meters / 1609.34; // meters to miles
}

// Utility function to convert array of objects to CSV
function arrayToCSV(items: MileageEntry[]): string {
  if (!items.length) return '';
  const replacer = (key: string, value: unknown) => (value === null || value === undefined ? '' : value);
  const header = Object.keys(items[0]);
  const csv = [
    header.join(','),
    ...items.map(row =>
      header.map(fieldName => JSON.stringify(row[fieldName], replacer)).join(',')
    ),
  ].join('\r\n');
  return csv;
}

function downloadCSV(data: MileageEntry[], filename: string) {
  const csv = arrayToCSV(data);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

export default function MileagePage() {
  const [mileageEntries, setMileageEntries] = useState<MileageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<unknown>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [form, setForm] = useState({
    beginAddress: "",
    endAddress: "",
    roundTrip: false,
    miles: "",
    costPerMile: "0.67",
    deal: "",
    date: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [calculatedMiles, setCalculatedMiles] = useState<number | null>(null);
  const [beginSuggestions, setBeginSuggestions] = useState<string[]>([]);
  const [endSuggestions, setEndSuggestions] = useState<string[]>([]);
  const router = useRouter();
  const beginTimeout = useRef<NodeJS.Timeout | undefined>(undefined);
  const endTimeout = useRef<NodeJS.Timeout | undefined>(undefined);

  // Auth guard
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user: unknown) => {
      setUser(user);
      setAuthLoading(false);
      if (!user) router.replace("/signin");
    });
    return () => unsub();
  }, [router]);

  // Fetch mileage entries for current user
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const q = query(collection(db, "mileage"), where("userId", "==", (user as { uid: string }).uid));
    const unsub = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
      const entries = snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => ({ 
        id: doc.id, 
        ...(doc.data() as Record<string, unknown>) 
      })) as MileageEntry[];
      // Sort by date descending client-side
      entries.sort((a, b) => {
        const dateA = a.date ? new Date(a.date as string).getTime() : 0;
        const dateB = b.date ? new Date(b.date as string).getTime() : 0;
        return dateB - dateA;
      });
      setMileageEntries(entries);
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
    setForm((f) => ({ 
      ...f, 
      [name]: type === "checkbox" ? checked : value 
    }));

    if (name === "beginAddress") {
      clearTimeout(beginTimeout.current);
      beginTimeout.current = setTimeout(async () => {
        setBeginSuggestions(await fetchAddressSuggestions(value));
      }, 300);
      setCalculatedMiles(null);
    }
    if (name === "endAddress") {
      clearTimeout(endTimeout.current);
      endTimeout.current = setTimeout(async () => {
        setEndSuggestions(await fetchAddressSuggestions(value));
      }, 300);
      setCalculatedMiles(null);
    }
    if (name === "roundTrip") {
      setCalculatedMiles(null);
    }
  };

  const selectBegin = (address: string) => {
    setForm((f) => ({ ...f, beginAddress: address }));
    setBeginSuggestions([]);
    setCalculatedMiles(null);
  };

  const selectEnd = (address: string) => {
    setForm((f) => ({ ...f, endAddress: address }));
    setEndSuggestions([]);
    setCalculatedMiles(null);
  };

  const handleCalculateMiles = async () => {
    setError("");
    setCalculatedMiles(null);
    setCalculating(true);
    try {
      const miles = await getMiles(form.beginAddress, form.endAddress);
      if (miles == null) throw new Error("Could not calculate distance between addresses.");
      setCalculatedMiles(form.roundTrip ? miles * 2 : miles);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to calculate miles";
      setError(errorMessage);
    } finally {
      setCalculating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (!user) throw new Error("You must be signed in.");
      
      let miles = calculatedMiles;
      if (miles == null) {
        miles = await getMiles(form.beginAddress, form.endAddress);
        if (miles == null) throw new Error("Could not calculate distance between addresses.");
        if (form.roundTrip) miles *= 2;
      }
      
      const costPerMile = parseFloat(form.costPerMile) || 0.67;
      const totalCost = miles * costPerMile;

      await addDoc(collection(db, "mileage"), {
        userId: (user as { uid: string }).uid,
        beginAddress: form.beginAddress,
        endAddress: form.endAddress,
        roundTrip: form.roundTrip,
        miles: miles,
        costPerMile: costPerMile,
        totalCost: totalCost,
        deal: form.deal,
        date: form.date,
        notes: form.notes,
        createdAt: Timestamp.now(),
      });
      
      setForm({ 
        beginAddress: "", 
        endAddress: "", 
        roundTrip: false, 
        miles: "", 
        costPerMile: "0.67", 
        deal: "", 
        date: new Date().toISOString().slice(0, 10), 
        notes: "" 
      });
      setCalculatedMiles(null);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to add mileage entry";
      setError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate totals
  const totalMiles = mileageEntries.reduce((sum, entry) => sum + (entry.miles || 0), 0);
  const totalCost = mileageEntries.reduce((sum, entry) => sum + (entry.totalCost || 0), 0);
  const averageCostPerMile = totalMiles > 0 ? totalCost / totalMiles : 0;

  if (authLoading || loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-gray-600 text-lg font-medium">Loading mileage tracker...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Mileage Tracking</h1>
              <p className="text-gray-600 text-lg">Log and track your business mileage</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => downloadCSV(mileageEntries, 'mileage.csv')}
                className="bg-white/80 backdrop-blur-sm border border-gray-200 text-gray-700 px-4 py-2 rounded-xl font-medium shadow-sm hover:bg-white hover:shadow-md transition-all duration-200"
              >
                📥 Download CSV
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="bg-white/80 backdrop-blur-sm border border-gray-200 text-gray-700 px-4 py-2 rounded-xl font-medium shadow-sm hover:bg-white hover:shadow-md transition-all duration-200"
              >
                📊 Dashboard
              </button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <span className="text-2xl">🚗</span>
              </div>
              <span className="text-blue-600 text-sm font-medium">Total Miles</span>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">{totalMiles.toFixed(1)}</div>
            <p className="text-gray-500 text-sm">Business miles logged</p>
          </div>
          
          <div className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <span className="text-2xl">💰</span>
              </div>
              <span className="text-green-600 text-sm font-medium">Total Deduction</span>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">${totalCost.toFixed(2)}</div>
            <p className="text-gray-500 text-sm">Tax deductible amount</p>
          </div>
          
          <div className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                <span className="text-2xl">📊</span>
              </div>
              <span className="text-purple-600 text-sm font-medium">Avg Rate</span>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">${averageCostPerMile.toFixed(2)}</div>
            <p className="text-gray-500 text-sm">Per mile average</p>
          </div>
        </div>

        {/* Add Mileage Form */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <span className="text-xl">➕</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Log New Mileage</h2>
              <p className="text-gray-500 text-sm">Enter trip details and calculate distance automatically</p>
            </div>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="relative">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Begin Address</label>
                <input 
                  type="text" 
                  name="beginAddress" 
                  value={form.beginAddress} 
                  onChange={handleChange} 
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" 
                  required 
                  autoComplete="off" 
                  placeholder="Enter starting address"
                />
                {beginSuggestions.length > 0 && (
                  <ul className="absolute z-10 bg-white border border-gray-200 rounded-xl w-full mt-1 shadow-lg max-h-40 overflow-y-auto">
                    {beginSuggestions.map((s, i) => (
                      <li key={i} className="px-4 py-3 hover:bg-blue-50 cursor-pointer transition-colors" onClick={() => selectBegin(s)}>{s}</li>
                    ))}
                  </ul>
                )}
              </div>
              
              <div className="relative">
                <label className="block text-sm font-semibold text-gray-700 mb-2">End Address</label>
                <input 
                  type="text" 
                  name="endAddress" 
                  value={form.endAddress} 
                  onChange={handleChange} 
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" 
                  required 
                  autoComplete="off" 
                  placeholder="Enter destination address"
                />
                {endSuggestions.length > 0 && (
                  <ul className="absolute z-10 bg-white border border-gray-200 rounded-xl w-full mt-1 shadow-lg max-h-40 overflow-y-auto">
                    {endSuggestions.map((s, i) => (
                      <li key={i} className="px-4 py-3 hover:bg-blue-50 cursor-pointer transition-colors" onClick={() => selectEnd(s)}>{s}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <input 
                type="checkbox" 
                name="roundTrip" 
                checked={form.roundTrip} 
                onChange={handleChange} 
                id="roundTrip" 
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <label htmlFor="roundTrip" className="text-sm font-medium text-gray-700">Round Trip</label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Cost per Mile</label>
                <input 
                  type="number" 
                  name="costPerMile" 
                  value={form.costPerMile} 
                  onChange={handleChange} 
                  step="0.01" 
                  min="0" 
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" 
                  required 
                />
                <p className="text-xs text-gray-500 mt-1">Current IRS rate: $0.67/mile</p>
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Date</label>
                <input 
                  type="date" 
                  name="date" 
                  value={form.date} 
                  onChange={handleChange} 
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" 
                  required 
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Tag to Deal (optional)</label>
                <input 
                  type="text" 
                  name="deal" 
                  value={form.deal} 
                  onChange={handleChange} 
                  placeholder="Deal address or ID" 
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" 
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Notes (optional)</label>
              <textarea 
                name="notes" 
                value={form.notes} 
                onChange={handleChange} 
                rows={3}
                placeholder="Additional trip details..." 
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
              />
            </div>

            <div className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                  {error}
                </div>
              )}
              
              <div className="flex gap-4">
                <button 
                  type="button" 
                  onClick={handleCalculateMiles} 
                  disabled={calculating || !form.beginAddress || !form.endAddress} 
                  className="flex-1 bg-gray-100 text-gray-700 px-6 py-3 rounded-xl font-semibold shadow hover:bg-gray-200 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {calculating ? "Calculating..." : "Calculate Miles"}
                </button>
                
                <button 
                  type="submit" 
                  disabled={submitting || (!calculatedMiles && (!form.beginAddress || !form.endAddress))} 
                  className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed transform hover:-translate-y-1"
                >
                  {submitting ? "Adding..." : "Add Mileage Entry"}
                </button>
              </div>
              
              {calculatedMiles !== null && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm text-center font-semibold">
                  {calculatedMiles.toFixed(2)} miles {form.roundTrip ? "(round trip)" : ""}
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Mileage Entries Table */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <span className="text-xl">📋</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Mileage History</h2>
              <p className="text-gray-500 text-sm">{mileageEntries.length} trip{mileageEntries.length !== 1 ? 's' : ''} logged</p>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">From</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">To</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Miles</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Rate</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Total</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Deal</th>
                </tr>
              </thead>
              <tbody>
                {mileageEntries.map((entry) => (
                  <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-600">{String(entry.date ?? "")}</td>
                    <td className="px-4 py-3 font-medium">{String(entry.beginAddress ?? "").split(',')[0]}</td>
                    <td className="px-4 py-3 font-medium">{String(entry.endAddress ?? "").split(',')[0]}</td>
                    <td className="px-4 py-3 font-semibold text-blue-600">{(entry.miles || 0).toFixed(1)}</td>
                    <td className="px-4 py-3 text-gray-600">${(entry.costPerMile || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 font-semibold text-green-600">${(entry.totalCost || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-600">{String(entry.deal ?? "") || "-"}</td>
                  </tr>
                ))}
                {mileageEntries.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-gray-400 py-8">
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-4xl">🚗</span>
                        <p className="text-lg font-medium">No mileage entries yet</p>
                        <p className="text-sm">Log your first trip to get started!</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
} 