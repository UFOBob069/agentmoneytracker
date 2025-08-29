"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { db, storage, auth } from "../../firebase";
import {
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  Timestamp,
  orderBy,
  deleteDoc,
  doc,
  QuerySnapshot,
  DocumentData,
  QueryDocumentSnapshot,
  updateDoc,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { onAuthStateChanged } from "firebase/auth";
import SubscriptionGuard from "../../components/SubscriptionGuard";

const categories = [
  "Mileage",
  "Automotive",
  "Meals",
  "Software",
  "Marketing",
  "Supplies",
  "Education",
  "Other",
];

// Utility function to convert array of objects to CSV
function arrayToCSV(items: Record<string, unknown>[]): string {
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

function downloadCSV(data: Record<string, unknown>[], filename: string) {
  const csv = arrayToCSV(data);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

// Add Expense type
interface Expense {
  id: string;
  date: string;
  category: string;
  amount: number;
  notes: string;
  deal: string;
  receiptUrl?: string;
  [key: string]: unknown;
}

// Add MileageEntry type
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

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Array<Expense>>([]);
  const [mileageEntries, setMileageEntries] = useState<Array<MileageEntry>>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    date: "",
    category: "",
    amount: "",
    notes: "",
    deal: "",
    receipt: null as File | null,
  });
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<unknown>(null);
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editForm, setEditForm] = useState<Partial<Expense>>({});
  const [editLoading, setEditLoading] = useState(false);

  // Auth guard
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setAuthLoading(false);
      if (!user) router.replace("/signin");
    });
    return () => unsub();
  }, [router]);

  // Fetch expenses for current user
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "expenses"),
      where("userId", "==", (user as { uid: string }).uid),
      orderBy("date", "desc")
    );
    const unsub = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
      setExpenses(snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => ({ id: doc.id, ...doc.data() } as Expense)));
    });
    return () => unsub();
  }, [user]);

  // Fetch mileage entries for current user
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "mileage"),
      where("userId", "==", (user as { uid: string }).uid)
    );
    const unsub = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
      const entries = snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => ({ 
        id: doc.id, 
        ...doc.data() 
      } as MileageEntry));
      // Sort by date descending
      entries.sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return dateB - dateA;
      });
      setMileageEntries(entries);
    });
    return () => unsub();
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, files } = e.target as unknown as { name: string; value: string; files: FileList };
    if (name === "receipt") {
      setForm((f) => ({ ...f, receipt: files[0] }));
    } else {
      setForm((f) => ({ ...f, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (!user) throw new Error("You must be signed in.");
      let receiptUrl = "";
      if (form.receipt) {
        const storageRef = ref(
          storage,
          `receipts/${(user as { uid: string }).uid}/${Date.now()}_${form.receipt.name}`
        );
        const uploadTask = uploadBytesResumable(storageRef, form.receipt);
        uploadTask.on("state_changed", (snap) => {
          setUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100);
        });
        await uploadTask;
        receiptUrl = await getDownloadURL(storageRef);
      }
      await addDoc(collection(db, "expenses"), {
        userId: (user as { uid: string }).uid,
        date: form.date,
        category: form.category,
        amount: parseFloat(form.amount),
        notes: form.notes,
        deal: form.deal,
        receiptUrl,
        createdAt: Timestamp.now(),
      });
      setForm({ date: "", category: "", amount: "", notes: "", deal: "", receipt: null });
      setUploadProgress(null);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to add expense";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this expense?")) return;
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, "expenses", id));
    } finally {
      setDeletingId(null);
    }
  };

  const openEditModal = (expense: Expense) => {
    setEditingExpense(expense);
    setEditForm({ ...expense });
    setEditModalOpen(true);
  };

  const openMileageEditModal = () => {
    // For mileage entries, we'll redirect to the mileage page for editing
    router.push('/mileage');
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setEditingExpense(null);
    setEditForm({});
  };
  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let newValue: string | boolean = value;
    if (type === 'checkbox' && 'checked' in e.target) {
      newValue = (e.target as HTMLInputElement).checked;
    }
    setEditForm((f) => ({ ...f, [name]: newValue }));
  };
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense) return;
    setEditLoading(true);
    try {
      const docRef = doc(db, "expenses", editingExpense.id);
      const toNumber = (val: string | number | undefined) => typeof val === 'number' ? val : parseFloat(val || '0') || 0;
      await updateDoc(docRef, {
        date: editForm.date,
        category: editForm.category,
        amount: toNumber(editForm.amount),
        notes: editForm.notes || "",
        deal: editForm.deal || "",
      });
      closeEditModal();
    } catch {
      alert("Failed to update expense");
    } finally {
      setEditLoading(false);
    }
  };

  function safeDisplay(val: unknown): string {
    if (val === null || val === undefined) return "";
    return String(val);
  }

  // Combine expenses and mileage entries for display
  const allExpenses = [
    ...expenses.map(exp => ({
      ...exp,
      type: 'expense' as const,
      displayId: exp.id
    })),
    ...mileageEntries.map(mileage => ({
      id: mileage.id,
      displayId: `mileage-${mileage.id}`,
      type: 'mileage' as const,
      date: mileage.date || '',
      category: 'Mileage',
      amount: mileage.totalCost || 0,
      notes: mileage.notes || `${mileage.beginAddress} to ${mileage.endAddress}${mileage.roundTrip ? ' (round trip)' : ''}${mileage.notes ? ` - ${mileage.notes}` : ''}`,
      deal: mileage.deal || '',
      receiptUrl: undefined,
      miles: mileage.miles,
      costPerMile: mileage.costPerMile,
      beginAddress: mileage.beginAddress,
      endAddress: mileage.endAddress,
      roundTrip: mileage.roundTrip
    }))
  ].sort((a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    return dateB - dateA;
  });

  // Calculate totals
  const totalExpenses = allExpenses.reduce((sum, item) => sum + (item.amount as number || 0), 0);
  const expensesByCategory = allExpenses.reduce((acc, item) => {
    const category = item.category as string || 'Other';
    acc[category] = (acc[category] || 0) + (item.amount as number || 0);
    return acc;
  }, {} as Record<string, number>);

  if (authLoading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-gray-600 text-lg font-medium">Checking authentication...</div>
        </div>
      </main>
    );
  }

  return (
    <SubscriptionGuard>
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* Header Section */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-2">Expense Tracking</h1>
                <p className="text-gray-600 text-lg">Manage your business expenses and receipts</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => downloadCSV(allExpenses, 'expenses.csv')}
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
                <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                  <span className="text-2xl">💸</span>
                </div>
                <span className="text-red-600 text-sm font-medium">Total Expenses</span>
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">${totalExpenses.toLocaleString()}</div>
              <p className="text-gray-500 text-sm">All tracked expenses</p>
            </div>
            
            <div className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <span className="text-2xl">📋</span>
                </div>
                <span className="text-blue-600 text-sm font-medium">Total Entries</span>
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">{allExpenses.length}</div>
              <p className="text-gray-500 text-sm">Expense records</p>
            </div>
            
            <div className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                  <span className="text-2xl">📁</span>
                </div>
                <span className="text-green-600 text-sm font-medium">Categories</span>
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">{Object.keys(expensesByCategory).length}</div>
              <p className="text-gray-500 text-sm">Active categories</p>
            </div>
          </div>

          {/* Add Expense Form */}
          <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <span className="text-xl">➕</span>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Add New Expense</h2>
                <p className="text-gray-500 text-sm">Track your business expenses with receipts</p>
              </div>
            </div>
            
            <form className="grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={handleSubmit}>
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
                <label className="block text-sm font-semibold text-gray-700 mb-2">Category</label>
                <select 
                  name="category" 
                  value={form.category} 
                  onChange={handleChange} 
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" 
                  required
                >
                  <option value="">Select category...</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Amount</label>
                <input 
                  type="number" 
                  name="amount" 
                  step="0.01" 
                  min="0" 
                  value={form.amount} 
                  onChange={handleChange} 
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" 
                  required 
                  placeholder="0.00"
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
                <input 
                  type="text" 
                  name="notes" 
                  value={form.notes} 
                  onChange={handleChange} 
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" 
                  placeholder="Brief description"
                />
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Receipt (optional)</label>
                <div className="relative border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-blue-400 transition-colors">
                  <input 
                    type="file" 
                    name="receipt" 
                    accept="image/*,application/pdf" 
                    onChange={handleChange} 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                  />
                  <div className="space-y-2 pointer-events-none">
                    <span className="text-4xl">📄</span>
                    <p className="text-gray-600">Click to upload receipt</p>
                    <p className="text-sm text-gray-500">Supports images and PDFs</p>
                  </div>
                </div>
                {uploadProgress !== null && (
                  <div className="mt-3">
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <span>Uploading...</span>
                      <span>{uploadProgress.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="md:col-span-2">
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
              
              <div className="md:col-span-2 flex flex-col items-end gap-3">
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm w-full">
                    {error}
                  </div>
                )}
                <button 
                  type="submit" 
                  disabled={loading} 
                  className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-8 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? "Adding..." : "Add Expense"}
                </button>
              </div>
            </form>
          </div>

          {/* Expenses Table */}
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <span className="text-xl">📊</span>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Expense History</h2>
                <p className="text-gray-500 text-sm">{allExpenses.length} expense{allExpenses.length !== 1 ? 's' : ''} tracked</p>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Category</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Amount</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Notes</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Receipt</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Deal</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allExpenses.map((item) => (
                    <tr key={item.displayId} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium">{safeDisplay(item.date)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {safeDisplay(item.category)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-red-600">
                        ${typeof item.amount === 'number' ? item.amount.toFixed(2) : safeDisplay(item.amount)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{safeDisplay(item.notes)}</td>
                      <td className="px-4 py-3">
                        {item.receiptUrl ? (
                          <a 
                            href={item.receiptUrl as string} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-blue-600 hover:text-blue-800 underline font-medium"
                          >
                            View
                          </a>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{safeDisplay(item.deal) || "-"}</td>
                      <td className="px-4 py-3">
                        {item.type === 'expense' && (
                          <>
                            <button
                              onClick={() => openEditModal(item as Expense)}
                              className="text-blue-600 hover:text-blue-800 font-medium mr-2"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              onClick={() => handleDelete(item.id)}
                              disabled={deletingId === item.id}
                              className="text-red-600 hover:text-red-800 font-medium disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                            >
                              {deletingId === item.id ? "Deleting..." : "Delete"}
                            </button>
                          </>
                        )}
                        {item.type === 'mileage' && (
                          <button
                            onClick={() => openMileageEditModal()}
                            className="text-blue-600 hover:text-blue-800 font-medium mr-2"
                          >
                            ✏️ Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {allExpenses.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center text-gray-400 py-8">
                        <div className="flex flex-col items-center gap-2">
                          <span className="text-4xl">📊</span>
                          <p className="text-lg font-medium">No expenses yet</p>
                          <p className="text-sm">Add your first expense to get started!</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        {/* Edit Expense Modal */}
        {editModalOpen && editingExpense && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
            <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-lg relative">
              <button onClick={closeEditModal} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-2xl">&times;</button>
              <h3 className="text-2xl font-bold mb-4">Edit Expense</h3>
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Date</label>
                  <input type="date" name="date" value={editForm.date || ''} onChange={handleEditChange} className="w-full px-4 py-3 border border-gray-300 rounded-xl" required />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Category</label>
                  <select name="category" value={editForm.category || ''} onChange={handleEditChange} className="w-full px-4 py-3 border border-gray-300 rounded-xl" required>
                    <option value="">Select category...</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Amount</label>
                  <input type="number" name="amount" value={editForm.amount || ''} onChange={handleEditChange} className="w-full px-4 py-3 border border-gray-300 rounded-xl" required />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
                  <input type="text" name="notes" value={editForm.notes || ''} onChange={handleEditChange} className="w-full px-4 py-3 border border-gray-300 rounded-xl" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Deal</label>
                  <input type="text" name="deal" value={editForm.deal || ''} onChange={handleEditChange} className="w-full px-4 py-3 border border-gray-300 rounded-xl" />
                </div>
                <div className="flex justify-end gap-2 mt-6">
                  <button type="button" onClick={closeEditModal} className="px-6 py-2 rounded-xl bg-gray-100 text-gray-700 font-semibold">Cancel</button>
                  <button type="submit" disabled={editLoading} className="px-6 py-2 rounded-xl bg-blue-600 text-white font-semibold shadow hover:bg-blue-700 disabled:opacity-60">
                    {editLoading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </SubscriptionGuard>
  );
} 