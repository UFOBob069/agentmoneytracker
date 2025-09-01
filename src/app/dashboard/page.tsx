"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db, auth } from "../../firebase";
import { collection, query, where, onSnapshot, Timestamp, orderBy, QuerySnapshot, DocumentData, QueryDocumentSnapshot, doc, getDocs } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useSubscription } from "../../hooks/useSubscription";

interface UserProfile {
  userId: string;
  startOfCommissionYear: Timestamp;
  commissionPercent: number | string; // Agent's commission percentage on total deal
  companySplitPercent: number | string; // Company's percentage
  companySplitCap: number | string; // Company split cap
  royaltyPercent: number | string; // Royalty percentage
  royaltyCap: number | string; // Royalty cap
}

interface Deal {
  id: string;
  userId?: string;
  address?: string;
  client?: string;
  closeDate?: string;
  totalDealAmount?: number; // Total deal amount
  commissionPercent?: number; // Agent's commission percentage
  agentCommission?: number; // Agent's commission amount
  companySplit?: number; // Company split amount
  royaltyUsed?: number; // Royalty amount
  grossIncome?: number; // Gross before taxes
  estimatedTaxes?: number; // Estimated taxes
  netIncome?: number; // Take-home amount
  referralFee?: number; // Optional referral fee
  transactionFee?: number; // Optional transaction fee
  createdAt?: Timestamp;
  [key: string]: unknown;
}

interface Expense {
  id: string;
  userId?: string;
  description?: string;
  amount?: number;
  category?: string;
  date?: string;
  createdAt?: Timestamp;
  [key: string]: unknown;
}

interface CommissionSchedule {
  id: string;
  userId: string;
  yearStart: Timestamp;
  commissionType: 'percentage' | 'fixed';
  companySplitPercent: number | string;
  companySplitCap: number | string;
  royaltyPercent: number | string;
  royaltyCap: number | string;
  estimatedTaxPercent: number | string;
  fixedCommissionAmount?: number | string;
  createdAt?: Timestamp;
}

// Helper function to calculate YTD royalty usage
function calculateYtdRoyaltyUsage(deals: Deal[], startDate: Date, endDate: Date): number {
  return deals
    .filter(deal => {
      let dealDate: Date | null = null;
      if (deal.closeDate) {
        dealDate = new Date(deal.closeDate);
        if (isNaN(dealDate.getTime())) dealDate = null;
      }
      if (!dealDate && deal.createdAt) {
        if (typeof (deal.createdAt as Timestamp).toDate === "function") {
          dealDate = (deal.createdAt as Timestamp).toDate();
        }
      }
      if (!dealDate) return false;
      return dealDate >= startDate && dealDate <= endDate;
    })
    .reduce((sum, deal) => sum + (deal.royaltyUsed || 0), 0);
}

// Helper function to calculate YTD company split usage
function calculateYtdCompanySplitUsage(deals: Deal[], startDate: Date, endDate: Date): number {
  return deals
    .filter(deal => {
      let dealDate: Date | null = null;
      if (deal.closeDate) {
        dealDate = new Date(deal.closeDate);
        if (isNaN(dealDate.getTime())) dealDate = null;
      }
      if (!dealDate && deal.createdAt) {
        if (typeof (deal.createdAt as Timestamp).toDate === "function") {
          dealDate = (deal.createdAt as Timestamp).toDate();
        }
      }
      if (!dealDate) return false;
      return dealDate >= startDate && dealDate <= endDate;
    })
    .reduce((sum, deal) => sum + (deal.companySplit || 0), 0);
}

// Helper function to calculate monthly net income
function calculateMonthlyNetIncome(deals: Deal[], expenses: Expense[], months: number = 12): Array<{ month: string; netIncome: number }> {
  const monthlyData: { [key: string]: number } = {};
  
  // Helper function to parse date safely
  function parseDateSafely(dateString: string): Date | null {
    if (!dateString) return null;
    
    // Handle ISO date format (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const [year, month, day] = dateString.split('-').map(Number);
      // month is 0-indexed in Date constructor
      return new Date(year, month - 1, day);
    }
    
    // Fallback to standard Date parsing
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
  }
  
  // Get all unique months from deals and expenses
  const allDates: Date[] = [];
  
  // Add deal dates
  deals.forEach(deal => {
    if (deal.closeDate) {
      const dealDate = parseDateSafely(deal.closeDate);
      if (dealDate) {
        allDates.push(dealDate);
      }
    }
  });
  
  // Add expense dates
  expenses.forEach(expense => {
    if (expense.date && expense.category !== 'Mileage') {
      const expenseDate = parseDateSafely(expense.date);
      if (expenseDate) {
        allDates.push(expenseDate);
      }
    }
  });
  
  // If no dates, fall back to last 12 months
  if (allDates.length === 0) {
    const now = new Date();
    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      monthlyData[monthKey] = 0;
    }
  } else {
    // Initialize months for all dates found
    allDates.forEach(date => {
      const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      if (!(monthKey in monthlyData)) {
        monthlyData[monthKey] = 0;
      }
    });
  }
  
  // Add deal income
  deals.forEach(deal => {
    if (deal.closeDate) {
      const dealDate = parseDateSafely(deal.closeDate);
      if (dealDate) {
        const monthKey = dealDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        if (monthlyData[monthKey] !== undefined) {
          const dealIncome = safeNumber(deal.netIncome);
          monthlyData[monthKey] += dealIncome;
        }
      }
    }
  });
  
  // Subtract expenses (only regular expenses, not mileage)
  expenses.forEach(expense => {
    if (expense.date && expense.category !== 'Mileage') {
      const expenseDate = parseDateSafely(expense.date);
      if (expenseDate) {
        const monthKey = expenseDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        if (monthlyData[monthKey] !== undefined) {
          const expenseAmount = safeNumber(expense.amount);
          monthlyData[monthKey] -= expenseAmount;
        }
      }
    }
  });
  
  // Filter out months with no activity and sort by date
  const result = Object.entries(monthlyData)
    .filter(([, netIncome]) => netIncome !== 0) // Only show months with activity
    .map(([month, netIncome]) => ({ month, netIncome }))
    .sort((a, b) => {
      const dateA = new Date(a.month);
      const dateB = new Date(b.month);
      return dateA.getTime() - dateB.getTime();
    });
  
  // If no months have activity, show the last 3 months
  if (result.length === 0) {
    const now = new Date();
    const last3Months = [];
    for (let i = 2; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      last3Months.push({ month: monthKey, netIncome: 0 });
    }
    return last3Months;
  }
  
  return result;
}

function safeNumber(val: number | string | undefined): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val) || 0;
  return 0;
}

export default function DashboardPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [user, setUser] = useState<unknown>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const router = useRouter();
  const { subscription, loading: subLoading } = useSubscription();
  const [commissionSchedules, setCommissionSchedules] = useState<CommissionSchedule[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<CommissionSchedule | null>(null);

  // Auth guard
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user: unknown) => {
      setUser(user);
      setAuthLoading(false);
      if (!user) router.replace("/signin");
    });
    return () => unsub();
  }, [router]);

  // Load user profile and check if new user
  useEffect(() => {
    if (!user) return;
    const userId = (user as { uid: string }).uid;
    const profileRef = doc(db, "userProfiles", userId);
    const unsub = onSnapshot(profileRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data() as UserProfile;
        setUserProfile(data);
        
        // Check if this is a new user (no deals, expenses, or mileage entries)
        checkIfNewUser(userId);
      }
    });
    return () => unsub();
  }, [user, router]);

  // Check if user is new and redirect to welcome page
  const checkIfNewUser = async (userId: string) => {
    try {
      // Check for deals
      const dealsQuery = query(collection(db, "deals"), where("userId", "==", userId));
      const dealsSnapshot = await getDocs(dealsQuery);
      
      // Check for expenses
      const expensesQuery = query(collection(db, "expenses"), where("userId", "==", userId));
      const expensesSnapshot = await getDocs(expensesQuery);
      
      // Check for mileage
      const mileageQuery = query(collection(db, "mileage"), where("userId", "==", userId));
      const mileageSnapshot = await getDocs(mileageQuery);
      
      // If user has no data and hasn't seen welcome page, redirect
      if (dealsSnapshot.empty && expensesSnapshot.empty && mileageSnapshot.empty) {
        const hasSeenWelcome = localStorage.getItem('hasSeenWelcome');
        if (!hasSeenWelcome) {
          router.push('/welcome');
        }
      }
    } catch (error) {
      console.error('Error checking if new user:', error);
    }
  };

  // Fetch deals for current user
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const q = query(collection(db, "deals"), where("userId", "==", (user as { uid: string }).uid), orderBy("closeDate", "desc"));
    const unsub = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
      setDeals(snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => ({ 
        id: doc.id, 
        ...(doc.data() as Record<string, unknown>) 
      })));
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  // Fetch expenses for current user
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "expenses"), where("userId", "==", (user as { uid: string }).uid), orderBy("date", "desc"));
    const unsub = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
      setExpenses(snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => ({ 
        id: doc.id, 
        ...(doc.data() as Record<string, unknown>) 
      })));
    });
    return () => unsub();
  }, [user]);

  // Fetch commission schedules for the user
  useEffect(() => {
    if (!user) return;
    const userId = (user as { uid: string }).uid;
    const q = query(collection(db, "commissionSchedules"), where("userId", "==", userId));
    getDocs(q).then(snapshot => {
      const schedules = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as CommissionSchedule[];
      setCommissionSchedules(schedules);
      // Default to the most recent schedule
      if (schedules.length > 0 && !selectedScheduleId) {
        setSelectedScheduleId(schedules[schedules.length - 1].id);
      }
    });
  }, [user, selectedScheduleId]);

  // Set selected schedule object
  useEffect(() => {
    if (!commissionSchedules.length || !selectedScheduleId) return;
    const sched = commissionSchedules.find(s => s.id === selectedScheduleId) || null;
    setSelectedSchedule(sched);
  }, [commissionSchedules, selectedScheduleId]);

  // Helper: get start and end date for a schedule
  function getScheduleRange(schedule: CommissionSchedule, nextSchedule?: CommissionSchedule) {
    const start = schedule?.yearStart?.toDate ? schedule.yearStart.toDate() : null;
    let end = null;
    if (nextSchedule && nextSchedule.yearStart?.toDate) {
      end = new Date(nextSchedule.yearStart.toDate().getTime() - 1);
    } else if (start) {
      end = new Date(start);
      end.setFullYear(end.getFullYear() + 1);
      end.setDate(end.getDate() - 1);
    }
    return { start, end };
  }

  // Filter deals for selected schedule
  const filteredDeals = selectedSchedule ? deals.filter(deal => {
    const dealDate = deal.closeDate ? new Date(deal.closeDate) : (deal.createdAt && typeof (deal.createdAt as Timestamp).toDate === 'function' ? (deal.createdAt as Timestamp).toDate() : null);
    if (!dealDate) return false;
    const idx = commissionSchedules.findIndex(s => s.id === selectedScheduleId);
    const nextSchedule = commissionSchedules[idx + 1];
    const { start, end } = getScheduleRange(selectedSchedule, nextSchedule);
    if (!start || !end) return false;
    return dealDate >= start && dealDate <= end;
  }) : deals;

  // Use selected schedule for all calculations
  const scheduleRange = selectedSchedule ? getScheduleRange(selectedSchedule, commissionSchedules[commissionSchedules.findIndex(s => s.id === selectedScheduleId) + 1]) : null;
  const ytdRoyaltyUsage = selectedSchedule && scheduleRange?.start && scheduleRange?.end ? calculateYtdRoyaltyUsage(filteredDeals, scheduleRange.start, scheduleRange.end) : 0;
  const ytdCompanySplitUsage = selectedSchedule && scheduleRange?.start && scheduleRange?.end ? calculateYtdCompanySplitUsage(filteredDeals, scheduleRange.start, scheduleRange.end) : 0;
  const remainingRoyaltyCap = selectedSchedule ? safeNumber(selectedSchedule.royaltyCap) - ytdRoyaltyUsage : 0;
  const remainingCompanyCap = selectedSchedule ? safeNumber(selectedSchedule.companySplitCap) - ytdCompanySplitUsage : 0;
  const royaltyCapPercentage = selectedSchedule ? (ytdRoyaltyUsage / safeNumber(selectedSchedule.royaltyCap)) * 100 : 0;
  const companyCapPercentage = selectedSchedule ? (ytdCompanySplitUsage / safeNumber(selectedSchedule.companySplitCap)) * 100 : 0;

  // Calculate monthly net income for chart
  const monthlyNetIncome = calculateMonthlyNetIncome(deals, expenses, 12);
  const averageMonthlyNet = monthlyNetIncome.length > 0 
    ? monthlyNetIncome.reduce((sum, month) => sum + month.netIncome, 0) / monthlyNetIncome.length 
    : 0;
  const bestMonth = monthlyNetIncome.length > 0 
    ? Math.max(...monthlyNetIncome.map(month => month.netIncome)) 
    : 0;

  // Check if settings are incomplete
  const isSettingsIncomplete = !userProfile || 
    !safeNumber(userProfile.companySplitPercent) || 
    !safeNumber(userProfile.companySplitCap) || 
    !safeNumber(userProfile.royaltyPercent) || 
    !safeNumber(userProfile.royaltyCap) ||
    !userProfile.startOfCommissionYear;

  // Calculate next anniversary of commission year
  let commissionYearReminder = null;
  if (userProfile && userProfile.startOfCommissionYear) {
    const startDate = userProfile.startOfCommissionYear.toDate();
    const now = new Date();
    // Calculate next anniversary (if today is after the anniversary, it's time to update)
    const nextAnniversary = new Date(startDate);
    while (nextAnniversary <= now) {
      nextAnniversary.setFullYear(nextAnniversary.getFullYear() + 1);
    }
    // If today is after the anniversary (i.e., more than a year since start), show reminder
    const lastAnniversary = new Date(nextAnniversary);
    lastAnniversary.setFullYear(lastAnniversary.getFullYear() - 1);
    if (now > nextAnniversary || (now >= lastAnniversary && now < nextAnniversary && now.getFullYear() > lastAnniversary.getFullYear())) {
      commissionYearReminder = (
        <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-2xl p-6 mb-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-2xl">⏰</span>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-yellow-800 mb-2">Update Your Commission Year</h3>
              <p className="text-yellow-700 mb-4">
                It&apos;s been over a year since your last commission year start date (<b>{startDate.toLocaleDateString()}</b>).<br />
                Please update your Commission Year in <b>Settings</b> to ensure accurate cap tracking.
              </p>
              <button
                onClick={() => router.push('/settings')}
                className="bg-gradient-to-r from-yellow-600 to-orange-600 text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
              >
                Update Commission Year
              </button>
            </div>
          </div>
        </div>
      );
    }
  }

  if (subLoading || authLoading) {
    return <div className="p-8 text-center text-gray-500">Loading...</div>;
  }
  if (!subscription || (subscription.status !== 'active' && subscription.status !== 'trialing')) {
    // Redirect to enhanced subscription-required page
    router.replace('/subscription-required');
    return null;
  }

  // Calculate totals
  const totalDealAmount = deals.reduce((sum, deal) => sum + (deal.totalDealAmount || 0), 0);
  const totalAgentCommission = deals.reduce((sum, deal) => sum + (deal.agentCommission || 0), 0);
  const totalNetIncome = deals.reduce((sum, deal) => sum + (deal.netIncome || 0), 0);
  const totalExpenses = expenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);
  
  // Only do conditional rendering after all hooks
  if (authLoading || loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-gray-600 text-lg font-medium">Loading your dashboard...</div>
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
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Financial Dashboard</h1>
              <p className="text-gray-600 text-lg">Track your real estate income and expenses</p>
            </div>
            <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/deals')}
                className="bg-white/80 backdrop-blur-sm border border-gray-200 text-gray-700 px-4 py-2 rounded-xl font-medium shadow-sm hover:bg-white hover:shadow-md transition-all duration-200"
        >
                📋 Deals
        </button>
        <button
          onClick={() => router.push('/expenses')}
                className="bg-white/80 backdrop-blur-sm border border-gray-200 text-gray-700 px-4 py-2 rounded-xl font-medium shadow-sm hover:bg-white hover:shadow-md transition-all duration-200"
        >
                💰 Expenses
        </button>
        <button
                onClick={() => router.push('/settings')}
                className="bg-white/80 backdrop-blur-sm border border-gray-200 text-gray-700 px-4 py-2 rounded-xl font-medium shadow-sm hover:bg-white hover:shadow-md transition-all duration-200"
        >
                ⚙️ Settings
        </button>
      </div>
          </div>
        </div>

        {/* Settings Completion Notification */}
        {isSettingsIncomplete && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-6 mb-8">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="text-2xl">⚠️</span>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-amber-800 mb-2">Complete Your Settings</h3>
                <p className="text-amber-700 mb-4">
                  To get the most out of your dashboard and ensure accurate commission calculations, 
                  please complete your profile settings including caps and tax rates.
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {!safeNumber(userProfile?.companySplitPercent) && (
                    <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-sm font-medium">Company Split %</span>
                  )}
                  {!safeNumber(userProfile?.companySplitCap) && (
                    <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-sm font-medium">Company Cap</span>
                  )}
                  {!safeNumber(userProfile?.royaltyPercent) && (
                    <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-sm font-medium">Royalty %</span>
                  )}
                  {!safeNumber(userProfile?.royaltyCap) && (
                    <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-sm font-medium">Royalty Cap</span>
                  )}
                  {!userProfile?.startOfCommissionYear && (
                    <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-sm font-medium">Commission Year</span>
                  )}
                </div>
            <button
                  onClick={() => router.push('/settings')}
                  className="bg-gradient-to-r from-amber-600 to-orange-600 text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
            >
                  Complete Settings Now
            </button>
              </div>
            </div>
          </div>
        )}

        {/* Commission Year Reminder */}
        {commissionYearReminder}

        {/* Commission Year Selector */}
        <div className="mb-4 flex flex-col md:flex-row md:items-center md:gap-4">
          <label className="font-semibold text-gray-700 mr-2">Commission Year:</label>
          <select
            value={selectedScheduleId || ''}
            onChange={e => setSelectedScheduleId(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-xl"
          >
            {commissionSchedules.sort((a, b) => (a.yearStart?.seconds || 0) - (b.yearStart?.seconds || 0)).map((sched, idx, arr) => {
              const { start, end } = getScheduleRange(sched, arr[idx + 1]);
              return (
                <option key={sched.id} value={sched.id}>
                  {start?.toLocaleDateString()} - {end?.toLocaleDateString()}
                </option>
              );
            })}
          </select>
          {selectedSchedule && (
            <span className="ml-4 text-sm text-gray-500">Split: {selectedSchedule.companySplitPercent}%, Cap: ${selectedSchedule.companySplitCap}, Royalty: {selectedSchedule.royaltyPercent}% / ${selectedSchedule.royaltyCap}, Tax: {selectedSchedule.estimatedTaxPercent}%</span>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <span className="text-2xl">💰</span>
              </div>
              <span className="text-green-600 text-sm font-medium">Total Deals</span>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">${totalDealAmount.toLocaleString()}</div>
            <p className="text-gray-500 text-sm">Total deal volume</p>
          </div>
          
          <div className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <span className="text-2xl">📈</span>
              </div>
              <span className="text-blue-600 text-sm font-medium">Agent Commission</span>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">${totalAgentCommission.toLocaleString()}</div>
            <p className="text-gray-500 text-sm">Your commission total</p>
          </div>
          
          <div className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                <span className="text-2xl">👑</span>
              </div>
              <span className="text-purple-600 text-sm font-medium">Take-Home</span>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">${totalNetIncome.toLocaleString()}</div>
            <p className="text-gray-500 text-sm">Net after taxes</p>
          </div>
          
          <div className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                <span className="text-2xl">💸</span>
              </div>
              <span className="text-red-600 text-sm font-medium">Expenses</span>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">${totalExpenses.toLocaleString()}</div>
            <p className="text-gray-500 text-sm">Total expenses</p>
          </div>
        </div>

        {/* Cap Tracking Widgets */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Royalty Cap Widget */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <span className="text-xl">👑</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Royalty Cap</h3>
                  <p className="text-gray-500 text-sm">Annual royalty tracking</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">${ytdRoyaltyUsage.toLocaleString()}</div>
                <div className="text-sm text-gray-500">of ${safeNumber(selectedSchedule?.royaltyCap).toLocaleString()}</div>
              </div>
            </div>
            
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Progress</span>
                <span>{royaltyCapPercentage.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className={`h-3 rounded-full transition-all duration-500 ${
                    royaltyCapPercentage >= 90 ? 'bg-red-500' : 
                    royaltyCapPercentage >= 75 ? 'bg-orange-500' : 'bg-purple-500'
                  }`}
                  style={{ width: `${Math.min(royaltyCapPercentage, 100)}%` }}
                ></div>
              </div>
            </div>
            
            <div className="flex justify-between text-sm">
              <span className={`font-medium ${
                remainingRoyaltyCap <= 0 ? 'text-red-600' : 
                remainingRoyaltyCap < safeNumber(selectedSchedule?.royaltyCap) * 0.1 ? 'text-orange-600' : 'text-green-600'
              }`}>
                {remainingRoyaltyCap <= 0 ? 'Cap reached!' : `$${remainingRoyaltyCap.toLocaleString()} remaining`}
              </span>
              <span className="text-gray-500">
                {scheduleRange?.start?.toLocaleDateString() || 'Not set'} - {scheduleRange?.end?.toLocaleDateString() || 'Not set'}
              </span>
            </div>
          </div>

          {/* Company Split Cap Widget */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                  <span className="text-xl">🏢</span>
              </div>
              <div>
                  <h3 className="text-lg font-bold text-gray-900">Company Split Cap</h3>
                  <p className="text-gray-500 text-sm">Annual company split tracking</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">${ytdCompanySplitUsage.toLocaleString()}</div>
                <div className="text-sm text-gray-500">of ${safeNumber(selectedSchedule?.companySplitCap).toLocaleString()}</div>
              </div>
            </div>
            
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Progress</span>
                <span>{companyCapPercentage.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className={`h-3 rounded-full transition-all duration-500 ${
                    companyCapPercentage >= 90 ? 'bg-red-500' : 
                    companyCapPercentage >= 75 ? 'bg-orange-500' : 'bg-orange-500'
                  }`}
                  style={{ width: `${Math.min(companyCapPercentage, 100)}%` }}
                ></div>
              </div>
            </div>
            
            <div className="flex justify-between text-sm">
              <span className={`font-medium ${
                remainingCompanyCap <= 0 ? 'text-red-600' : 
                remainingCompanyCap < safeNumber(selectedSchedule?.companySplitCap) * 0.1 ? 'text-orange-600' : 'text-green-600'
              }`}>
                {remainingCompanyCap <= 0 ? 'Cap reached!' : `$${remainingCompanyCap.toLocaleString()} remaining`}
              </span>
              <span className="text-gray-500">
                {scheduleRange?.start?.toLocaleDateString() || 'Not set'} - {scheduleRange?.end?.toLocaleDateString() || 'Not set'}
              </span>
            </div>
          </div>
        </div>

        {/* Net Income Chart */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <span className="text-xl">📊</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Net Income Over Time</h2>
              <p className="text-gray-500 text-sm">Monthly net income (deals - expenses)</p>
            </div>
          </div>
          
          {monthlyNetIncome.length > 0 ? (
              <div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="bg-gradient-to-r from-emerald-50 to-green-50 rounded-xl p-4">
                  <div className="text-2xl font-bold text-emerald-600">${averageMonthlyNet.toLocaleString()}</div>
                  <div className="text-sm text-gray-600">Average Monthly Net</div>
                </div>
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4">
                  <div className="text-2xl font-bold text-blue-600">${bestMonth.toLocaleString()}</div>
                  <div className="text-sm text-gray-600">Best Month</div>
                </div>
                <div className="bg-gradient-to-r from-purple-50 to-violet-50 rounded-xl p-4">
                  <div className="text-2xl font-bold text-purple-600">${(totalNetIncome - totalExpenses).toLocaleString()}</div>
                  <div className="text-sm text-gray-600">Total Net (All Time)</div>
                </div>
              </div>
              
              <div className="space-y-4">
                {monthlyNetIncome.map((month) => {
                  const maxValue = Math.max(...monthlyNetIncome.map(m => Math.abs(m.netIncome || 0)), 1);
                  return (
                    <div key={month.month} className="flex items-center gap-4">
                      <div className="w-20 text-sm font-medium text-gray-600">{month.month}</div>
                      <div className="flex-1 bg-gray-200 rounded-full h-4 relative">
                        <div 
                          className={`h-4 rounded-full transition-all duration-500 ${
                            (month.netIncome || 0) >= 0 ? 'bg-emerald-500' : 'bg-red-500'
                          }`}
                          style={{ 
                            width: `${Math.min(Math.abs(month.netIncome || 0) / maxValue * 100, 100)}%` 
                          }}
                        ></div>
                      </div>
                      <div className={`w-24 text-right font-semibold ${
                        (month.netIncome || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}>
                        ${(month.netIncome || 0).toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <div className="flex flex-col items-center gap-2">
                <span className="text-4xl">📊</span>
                <p className="text-lg font-medium">No data yet</p>
                <p className="text-sm">Add some deals and expenses to see your net income chart</p>
              </div>
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Recent Deals */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <span className="text-sm">📋</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900">Recent Deals</h3>
            </div>
            <div className="space-y-3">
              {filteredDeals.slice(0, 5).map((deal) => (
                <div key={deal.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div>
                    <div className="font-medium text-gray-900">{String(deal.address ?? "").split(',')[0]}</div>
                    <div className="text-sm text-gray-500">{String(deal.closeDate ?? "")}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-emerald-600">${(deal.netIncome || 0).toLocaleString()}</div>
                    <div className="text-xs text-gray-500">Net Income</div>
                  </div>
                </div>
              ))}
              {filteredDeals.length === 0 && (
                <div className="text-center text-gray-400 py-4">
                  <p className="text-sm">No deals yet</p>
                </div>
              )}
            </div>
          </div>

          {/* Recent Expenses */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                <span className="text-sm">💸</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900">Recent Expenses</h3>
            </div>
            <div className="space-y-3">
              {expenses.slice(0, 5).map((expense) => (
                <div key={expense.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div>
                    <div className="font-medium text-gray-900">{String(expense.description ?? "")}</div>
                    <div className="text-sm text-gray-500">{String(expense.date ?? "")}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-red-600">-${(expense.amount || 0).toLocaleString()}</div>
                    <div className="text-xs text-gray-500">{String(expense.category ?? "")}</div>
                  </div>
                </div>
              ))}
              {expenses.length === 0 && (
                <div className="text-center text-gray-400 py-4">
                  <p className="text-sm">No expenses yet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
} 