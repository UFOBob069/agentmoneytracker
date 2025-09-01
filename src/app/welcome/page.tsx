"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import SubscriptionGuard from "../../components/SubscriptionGuard";

export default function WelcomePage() {
  const [user, setUser] = useState<unknown>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const router = useRouter();

  // Auth guard
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setAuthLoading(false);
      if (!user) router.replace("/signin");
    });
    return () => unsub();
  }, [router]);

  // Track conversion event and mark welcome page as seen
  useEffect(() => {
    if (user && typeof window !== 'undefined') {
      // Mark that user has seen welcome page
      localStorage.setItem('hasSeenWelcome', 'true');
      
      if (window.gtag) {
        // Track successful signup conversion
        window.gtag('event', 'sign_up', {
          method: 'email',
          custom_parameter: 'welcome_page_view'
        });
        
        // Track page view
        window.gtag('config', 'G-XKP9S9CNKJ', {
          page_title: 'Welcome - Agent Money Tracker',
          page_location: window.location.href
        });
      }
    }
  }, [user]);

  const handleGetStarted = () => {
    // Track button click
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'begin_onboarding', {
        method: 'settings_page'
      });
    }
    router.push('/settings');
  };

  const handleGoToDeals = () => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'begin_onboarding', {
        method: 'deals_page'
      });
    }
    router.push('/deals');
  };

  const handleGoToExpenses = () => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'begin_onboarding', {
        method: 'expenses_page'
      });
    }
    router.push('/expenses');
  };

  const handleGoToMileage = () => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'begin_onboarding', {
        method: 'mileage_page'
      });
    }
    router.push('/mileage');
  };

  if (authLoading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-gray-600 text-lg font-medium">Loading...</div>
        </div>
      </main>
    );
  }

  return (
    <SubscriptionGuard>
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="max-w-4xl mx-auto px-4 py-12">
          {/* Welcome Header */}
          <div className="text-center mb-12">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-3xl">🎉</span>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Welcome to Agent Money Tracker!</h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              You&apos;re all set up! Let&apos;s get you started with tracking your real estate business finances.
            </p>
          </div>

          {/* Next Steps Section */}
          <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <span className="text-xl">📋</span>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Next Steps</h2>
                <p className="text-gray-500 text-sm">Complete these steps to get the most out of your account</p>
              </div>
            </div>

            {/* Step 1 - Settings */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 mb-6">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-1">
                  1
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Set Up Your Commission Structure</h3>
                  <p className="text-gray-600 mb-4">
                    Configure your commission rates, company splits, and royalty percentages. This ensures accurate calculations for all your deals.
                  </p>
                  <button
                    onClick={handleGetStarted}
                    className="bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:bg-blue-700 transition-all transform hover:-translate-y-1"
                  >
                    Go to Settings →
                  </button>
                </div>
              </div>
            </div>

            {/* Step 2 - Data Entry */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-1">
                  2
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Start Adding Your Data</h3>
                  <p className="text-gray-600 mb-4">
                    Begin tracking your deals, expenses, and mileage. Choose where you&apos;d like to start:
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button
                      onClick={handleGoToDeals}
                      className="bg-white border-2 border-green-200 text-gray-700 px-4 py-3 rounded-xl font-medium shadow-sm hover:border-green-300 hover:shadow-md transition-all"
                    >
                      <div className="text-center">
                        <div className="text-2xl mb-2">🏠</div>
                        <div className="font-semibold">Deals</div>
                        <div className="text-sm text-gray-500">Closed transactions</div>
                      </div>
                    </button>
                    
                    <button
                      onClick={handleGoToExpenses}
                      className="bg-white border-2 border-green-200 text-gray-700 px-4 py-3 rounded-xl font-medium shadow-sm hover:border-green-300 hover:shadow-md transition-all"
                    >
                      <div className="text-center">
                        <div className="text-2xl mb-2">💸</div>
                        <div className="font-semibold">Expenses</div>
                        <div className="text-sm text-gray-500">Business costs</div>
                      </div>
                    </button>
                    
                    <button
                      onClick={handleGoToMileage}
                      className="bg-white border-2 border-green-200 text-gray-700 px-4 py-3 rounded-xl font-medium shadow-sm hover:border-green-300 hover:shadow-md transition-all"
                    >
                      <div className="text-center">
                        <div className="text-2xl mb-2">🚗</div>
                        <div className="font-semibold">Mileage</div>
                        <div className="text-sm text-gray-500">Travel tracking</div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Tips */}
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                <span className="text-xl">💡</span>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Quick Tips</h2>
                <p className="text-gray-500 text-sm">Get the most out of your account</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <span className="text-xs text-purple-600">✓</span>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">Complete Your Profile</h4>
                  <p className="text-sm text-gray-600">Fill in your commission structure first for accurate calculations</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <span className="text-xs text-purple-600">✓</span>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">Track Everything</h4>
                  <p className="text-sm text-gray-600">Log all your deals, expenses, and mileage for complete financial tracking</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <span className="text-xs text-purple-600">✓</span>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">Use the Dashboard</h4>
                  <p className="text-sm text-gray-600">Monitor your income, expenses, and net profit in real-time</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <span className="text-xs text-purple-600">✓</span>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">Export Data</h4>
                  <p className="text-sm text-gray-600">Download CSV reports for tax time and record keeping</p>
                </div>
              </div>
            </div>
          </div>

          {/* Dashboard Link */}
          <div className="text-center mt-8">
            <button
              onClick={() => router.push('/dashboard')}
              className="bg-gradient-to-r from-gray-600 to-gray-700 text-white px-8 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </main>
    </SubscriptionGuard>
  );
}
